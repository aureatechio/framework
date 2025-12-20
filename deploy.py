import os
import sys
import requests
import json
import io
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from pathlib import Path

# Carrega variáveis de ambiente
if os.path.exists("config.env"):
    load_dotenv("config.env")
else:
    load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET_NAME = os.getenv("SUPABASE_BUCKET_NAME", "cdn-assets")

# Layout de upload no Storage:
# - "per_element" (padrão): <nome>/<versao>/...  (ex.: dashboard/v2/form.js)
# - "legacy": <versao>/widgets/<widget_slug>/... (como era antes)
STORAGE_LAYOUT = (os.getenv("STORAGE_LAYOUT") or "per_element").strip().lower()
# Prefixo opcional dentro do bucket (ex.: "cdn", "assets"). Deixe vazio para usar a raiz.
STORAGE_PREFIX = (os.getenv("STORAGE_PREFIX") or "").strip().strip("/")

BUBBLE_OBJ_URL = os.getenv("BUBBLE_OBJ_URL") or os.getenv("BUBBLE_API_URL")
BUBBLE_TOKEN = os.getenv("BUBBLE_TOKEN")
SKIP_BUBBLE = (os.getenv("SKIP_BUBBLE") or "").strip().lower() in ("1", "true", "yes", "y")

# Bubble field keys (Bubble pode expor nomes "internos" na Data API)
BUBBLE_FIELD_NOME = os.getenv("BUBBLE_FIELD_NOME", "nome_text")
BUBBLE_FIELD_CSS = os.getenv("BUBBLE_FIELD_CSS", "css_text")
BUBBLE_FIELD_JS = os.getenv("BUBBLE_FIELD_JS", "js_text")
BUBBLE_FIELD_ATIVO = os.getenv("BUBBLE_FIELD_ATIVO", "ativo_boolean")
BUBBLE_FIELD_HTML = os.getenv("BUBBLE_FIELD_HTML", "html_text")
BUBBLE_FIELD_VERSION = os.getenv("BUBBLE_FIELD_VERSION", "version")
# Campo opcional para rastrear o deploy do código (se existir no Bubble)
BUBBLE_FIELD_CODE_VERSION = os.getenv("BUBBLE_FIELD_CODE_VERSION", "")
# Campo opcional para salvar URL do manifesto do deploy (se existir no Bubble)
BUBBLE_FIELD_MANIFEST_URL = os.getenv("BUBBLE_FIELD_MANIFEST_URL", "")

def _safe_slug(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("\\", "/")
    s = re.sub(r"[^a-zA-Z0-9@._/-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-/") or "unnamed"

def _join_remote(*parts: str) -> str:
    out: list[str] = []
    for p in parts:
        if p is None:
            continue
        p = str(p).strip().strip("/")
        if not p:
            continue
        out.append(p)
    return "/".join(out)

def get_code_version() -> str:
    """
    Identificador do "versionamento do código" do deploy:
    - Preferência: git short hash
    - Fallback: timestamp UTC (YYYYMMDD-HHMMSS)
    """
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        h = (r.stdout or "").strip()
        if h:
            return f"git-{h}"
    except Exception:
        pass
    return datetime.now(timezone.utc).strftime("ts-%Y%m%d-%H%M%S")

def _bubble_candidates(primary: str, candidates: list[str]) -> list[str]:
    """
    Retorna lista de chaves únicas, priorizando 'primary' e depois os candidates.
    """
    out: list[str] = []
    for k in [primary, *candidates]:
        if k and k not in out:
            out.append(k)
    return out

def bubble_name_keys() -> list[str]:
    # Alguns apps expõem como nome_text; outros como elemento_text; outros como nome
    return _bubble_candidates(BUBBLE_FIELD_NOME, ["nome_text", "elemento_text", "nome"])

def bubble_active_keys() -> list[str]:
    return _bubble_candidates(BUBBLE_FIELD_ATIVO, ["ativo_boolean", "ativo"])

def bubble_version_keys() -> list[str]:
    return _bubble_candidates(BUBBLE_FIELD_VERSION, ["version_text", "version"])

def bubble_html_keys() -> list[str]:
    return _bubble_candidates(BUBBLE_FIELD_HTML, ["html_text", "html"])

def bubble_css_keys() -> list[str]:
    return _bubble_candidates(BUBBLE_FIELD_CSS, ["css_text", "css"])

def bubble_js_keys() -> list[str]:
    return _bubble_candidates(BUBBLE_FIELD_JS, ["js_text", "js"])

def setup_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Erro: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_file(supabase: Client, local_path: Path, remote_path: str):
    with open(local_path, "rb") as f:
        print(f"Subindo {local_path} para {remote_path}...")
        # Upsert=True permite sobrescrever se necessário, mas como usamos versão, será novo
        supabase.storage.from_(BUCKET_NAME).upload(
            path=remote_path,
            file=f,
            file_options={"x-upsert": "true", "content-type": get_content_type(local_path)}
        )
    
    # Retorna a URL pública
    url = supabase.storage.from_(BUCKET_NAME).get_public_url(remote_path)
    # A lib às vezes retorna um '?' no final; removemos para evitar problemas no Bubble.
    return url.rstrip("?")

def upload_bytes(supabase: Client, content: bytes, remote_path: str, content_type: str = "application/octet-stream"):
    print(f"Subindo bytes para {remote_path}...")
    # A lib storage3 (sync) espera um caminho de arquivo (str/PathLike) ou bytes,
    # mas em algumas versões ela tenta dar open(file, "rb"), então BytesIO quebra.
    # Para compatibilidade no Windows, gravamos em um arquivo temporário e subimos.
    fd, tmp_path = tempfile.mkstemp(prefix="cdn_manifest_", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        with open(tmp_path, "rb") as f2:
            supabase.storage.from_(BUCKET_NAME).upload(
                path=remote_path,
                file=f2,
                file_options={"x-upsert": "true", "content-type": content_type},
            )
        url = supabase.storage.from_(BUCKET_NAME).get_public_url(remote_path)
        return url.rstrip("?")
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

def get_content_type(path: Path):
    if path.suffix == ".html": return "text/html"
    if path.suffix == ".css": return "text/css"
    if path.suffix == ".js": return "application/javascript"
    return "application/octet-stream"

def bubble_headers():
    return {
        "Authorization": f"Bearer {BUBBLE_TOKEN}",
        "Content-Type": "application/json",
    }

def bubble_deactivate_others(nome: str):
    """
    Marca como ativo=false todos os registros que tenham o mesmo 'nome'
    e que estejam ativos.
    """
    if SKIP_BUBBLE:
        print("Aviso: SKIP_BUBBLE=1; pulando integração Bubble (desativar versões anteriores).")
        return
    if not BUBBLE_OBJ_URL or not BUBBLE_TOKEN:
        print("Aviso: BUBBLE_OBJ_URL ou BUBBLE_TOKEN não configurados; pulando integração Bubble.")
        return

    # Tenta combinações de chaves caso o Bubble use nomes internos diferentes na Data API
    name_keys = bubble_name_keys()
    active_keys = bubble_active_keys()

    resp = None
    for nk in name_keys:
        for ak in active_keys:
            constraints = [
                {"key": nk, "constraint_type": "equals", "value": nome},
                {"key": ak, "constraint_type": "equals", "value": True},
            ]
            try:
                r = requests.get(
                    BUBBLE_OBJ_URL,
                    params={"constraints": json.dumps(constraints)},
                    headers=bubble_headers(),
                    timeout=30,
                )
                # Se deu 200/201, usamos
                if r.status_code in (200, 201):
                    resp = r
                    break
            except Exception as e:
                print(f"Aviso: falha ao consultar Bubble para desativar versões anteriores: {e}")
                return
        if resp is not None:
            break

    if resp is None:
        print("Aviso: não foi possível consultar Bubble para desativar versões anteriores (nenhuma chave funcionou).")
        return

    if resp.status_code not in (200, 201):
        print(f"Aviso: Bubble GET falhou ({resp.status_code}). Não foi possível desativar registros anteriores.")
        print(resp.text)
        return

    try:
        data = resp.json()
        results = (data.get("response") or {}).get("results") or []
    except Exception:
        results = []

    for item in results:
        item_id = item.get("_id") or item.get("id")
        if not item_id:
            continue

        try:
            patch_resp = requests.patch(
                f"{BUBBLE_OBJ_URL.rstrip('/')}/{item_id}",
                json={BUBBLE_FIELD_ATIVO: False},
                headers=bubble_headers(),
                timeout=30,
            )
            if patch_resp.status_code not in (200, 204):
                print(f"Aviso: falha ao desativar registro {item_id} ({patch_resp.status_code}): {patch_resp.text}")
        except Exception as e:
            print(f"Aviso: falha ao desativar registro {item_id}: {e}")

def update_bubble(nome, version_value, css_url, js_url, html_url=None, code_version: str | None = None, manifest_url: str | None = None):
    print(f"Atualizando Bubble (nome='{nome}', version='{version_value}', code_version='{code_version}')...")

    if SKIP_BUBBLE:
        print("Aviso: SKIP_BUBBLE=1; pulando integração Bubble.")
        return
    if not BUBBLE_OBJ_URL or not BUBBLE_TOKEN:
        print("Aviso: BUBBLE_OBJ_URL ou BUBBLE_TOKEN não configurados; pulando integração Bubble.")
        return

    # Desativa outros registros com o mesmo nome
    bubble_deactivate_others(nome)

    headers = {
        "Authorization": f"Bearer {BUBBLE_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        BUBBLE_FIELD_NOME: nome,
        BUBBLE_FIELD_CSS: css_url,
        BUBBLE_FIELD_JS: js_url,
        BUBBLE_FIELD_ATIVO: True,
    }

    # Campo de versionamento (opcional no Bubble / depende de exposição na Data API)
    if version_value:
        payload[BUBBLE_FIELD_VERSION] = version_value

    # Campo opcional: code_version
    if code_version and BUBBLE_FIELD_CODE_VERSION:
        payload[BUBBLE_FIELD_CODE_VERSION] = code_version
    # Campo opcional: manifest_url
    if manifest_url and BUBBLE_FIELD_MANIFEST_URL:
        payload[BUBBLE_FIELD_MANIFEST_URL] = manifest_url
    
    if html_url:
        payload[BUBBLE_FIELD_HTML] = html_url

    response = requests.post(BUBBLE_OBJ_URL, json=payload, headers=headers, timeout=30)

    if response.status_code in [201, 200]:
        print("Sucesso: Bubble atualizado!")
        return

    # Se algum campo não existir/exposto na Data API, tentamos novamente removendo-o.
    if response.status_code == 400:
        text = response.text or ""
        removed_any = False

        if html_url and f"Unrecognized field: {BUBBLE_FIELD_HTML}" in text:
            print(
                f"Aviso: o Bubble não reconheceu o campo '{BUBBLE_FIELD_HTML}'. "
                f"Crie o campo 'html' (text) no type e habilite na Data API (ou ajuste BUBBLE_FIELD_HTML)."
            )
            payload.pop(BUBBLE_FIELD_HTML, None)
            removed_any = True

        if f"Unrecognized field: {BUBBLE_FIELD_VERSION}" in text:
            print(
                f"Aviso: o Bubble não reconheceu o campo '{BUBBLE_FIELD_VERSION}'. "
                f"Crie o campo 'version' (text) no type e habilite na Data API (ou ajuste BUBBLE_FIELD_VERSION)."
            )
            payload.pop(BUBBLE_FIELD_VERSION, None)
            removed_any = True

        if BUBBLE_FIELD_CODE_VERSION and f"Unrecognized field: {BUBBLE_FIELD_CODE_VERSION}" in text:
            print(
                f"Aviso: o Bubble não reconheceu o campo '{BUBBLE_FIELD_CODE_VERSION}'. "
                f"Crie/exponha o campo no type (ou ajuste BUBBLE_FIELD_CODE_VERSION)."
            )
            payload.pop(BUBBLE_FIELD_CODE_VERSION, None)
            removed_any = True

        if BUBBLE_FIELD_MANIFEST_URL and f"Unrecognized field: {BUBBLE_FIELD_MANIFEST_URL}" in text:
            print(
                f"Aviso: o Bubble não reconheceu o campo '{BUBBLE_FIELD_MANIFEST_URL}'. "
                f"Crie/exponha o campo no type (ou ajuste BUBBLE_FIELD_MANIFEST_URL)."
            )
            payload.pop(BUBBLE_FIELD_MANIFEST_URL, None)
            removed_any = True

        # Se o problema for o campo de nome (ex.: elemento_text vs nome_text), tentamos chaves alternativas.
        # (Não basta remover, porque nome é essencial para o nosso modelo.)
        if "Unrecognized field:" in text and any(f"Unrecognized field: {k}" in text for k in bubble_name_keys()):
            # tenta substituir a chave do nome por alternativas
            current_name_val = None
            for k in bubble_name_keys():
                if k in payload:
                    current_name_val = payload.pop(k)
                    break
            if current_name_val is None:
                current_name_val = nome

            for nk in bubble_name_keys():
                payload_try = dict(payload)
                payload_try[nk] = current_name_val
                response_try = requests.post(BUBBLE_OBJ_URL, json=payload_try, headers=headers, timeout=30)
                if response_try.status_code in [201, 200]:
                    print(f"Sucesso: Bubble atualizado (nome via '{nk}')!")
                    return

            # Se falhou, restaura payload com a chave original e deixa cair no erro.
            payload[BUBBLE_FIELD_NOME] = current_name_val

        if removed_any:
            response2 = requests.post(BUBBLE_OBJ_URL, json=payload, headers=headers, timeout=30)
            if response2.status_code in [201, 200]:
                print("Sucesso: Bubble atualizado (com fallback de campos)!")
                return
            print(f"Erro ao atualizar Bubble (fallback): {response2.status_code}")
            print(response2.text)
            return

    print(f"Erro ao atualizar Bubble: {response.status_code}")
    print(response.text)

def main():
    if len(sys.argv) < 2:
        print("Uso:")
        print("  Deploy:")
        print("    python deploy.py <versao> [nome] [widget_slug]")
        print("      - Sem widget_slug: sobe public/index.html, public/style.css, public/script.js")
        print("      - Com widget_slug: sobe public/widgets/<widget_slug>/form.(html|css|js)")
        print("")
        print("  Versionamento por elemento (novo):")
        print("    - Storage: <nome>/<versao>/...  (ex.: dashboard/v3/form.js)")
        print("    - Opcional: se existir public/widgets/<widget_slug>/<versao>/form.(...), usa essa pasta")
        print("      (isso permite manter v1/v2/v3 lado a lado no repo)")
        print("")
        print("  Pull (baixar versão ativa antes de editar):")
        print("    python deploy.py pull <nome> [widget_slug]")
        print("      - Sem widget_slug: baixa html/css/js para public/index.html, public/style.css, public/script.js")
        print("      - Com widget_slug: baixa para public/widgets/<widget_slug>/form.(html|css|js)")
        sys.exit(1)

    # Subcomando: pull
    if sys.argv[1].lower() == "pull":
        nome = sys.argv[2] if len(sys.argv) >= 3 else None
        widget_slug = sys.argv[3] if len(sys.argv) >= 4 else None
        if not nome:
            print("Uso: python deploy.py pull <nome> [widget_slug]")
            sys.exit(1)
        pull_latest(nome, widget_slug)
        return

    version = sys.argv[1]
    widget_slug = sys.argv[3] if len(sys.argv) >= 4 else None
    # Default de nome:
    # - se for widget e nome não veio, usamos widget_slug
    # - se for main (sem widget), e nome não veio, usamos "main"
    if len(sys.argv) >= 3:
        nome = sys.argv[2]
    else:
        nome = widget_slug if widget_slug else "main"
    supabase = setup_supabase()
    code_version = get_code_version()
    
    # Garante que o bucket existe (tenta criar, ignora se já existir)
    try:
        supabase.storage.create_bucket(BUCKET_NAME, options={"public": True})
        print(f"Bucket '{BUCKET_NAME}' criado.")
    except Exception:
        pass

    public_dir = Path("public")

    # Resolve caminhos locais (suporta pasta por versão no widget: <widget>/<versao>/form.*)
    def resolve_widget_file(widget_dir: Path, version_value: str, filename: str) -> Path:
        vdir = widget_dir / version_value
        if vdir.exists() and (vdir / filename).exists():
            return vdir / filename
        return widget_dir / filename

    # Resolve base remoto
    nome_safe = _safe_slug(nome)
    version_safe = _safe_slug(version)
    if STORAGE_LAYOUT not in ("per_element", "legacy"):
        print(f"Aviso: STORAGE_LAYOUT='{STORAGE_LAYOUT}' inválido. Usando 'per_element'.")
        layout = "per_element"
    else:
        layout = STORAGE_LAYOUT

    if widget_slug:
        widget_dir = public_dir / "widgets" / widget_slug
        html_file = resolve_widget_file(widget_dir, version, "form.html")
        css_file = resolve_widget_file(widget_dir, version, "form.css")
        js_file = resolve_widget_file(widget_dir, version, "form.js")

        if layout == "legacy":
            remote_base = _join_remote(STORAGE_PREFIX, version_safe, "widgets", _safe_slug(widget_slug))
        else:
            # Novo: nome/versao (ex.: dashboard/v2/form.js)
            remote_base = _join_remote(STORAGE_PREFIX, nome_safe, version_safe)

        html_url = upload_file(supabase, html_file, f"{remote_base}/form.html")
        css_url = upload_file(supabase, css_file, f"{remote_base}/form.css")
        js_url = upload_file(supabase, js_file, f"{remote_base}/form.js")
    else:
        # Loader "main": suporta também pasta por versão no public/<versao>/...
        vdir = public_dir / version
        html_file = (vdir / "index.html") if (vdir / "index.html").exists() else (public_dir / "index.html")
        css_file = (vdir / "style.css") if (vdir / "style.css").exists() else (public_dir / "style.css")
        js_file = (vdir / "script.js") if (vdir / "script.js").exists() else (public_dir / "script.js")

        if layout == "legacy":
            remote_base = _join_remote(STORAGE_PREFIX, version_safe)
        else:
            remote_base = _join_remote(STORAGE_PREFIX, nome_safe, version_safe)

        html_url = upload_file(supabase, html_file, f"{remote_base}/index.html")
        css_url = upload_file(supabase, css_file, f"{remote_base}/style.css")
        js_url = upload_file(supabase, js_file, f"{remote_base}/script.js")
    
    print(f"HTML URL: {html_url}")
    print(f"CSS URL: {css_url}")
    print(f"JS URL: {js_url}")

    # Manifesto do deploy (versionamento do código)
    manifest = {
        "nome": nome,
        "nome_safe": nome_safe,
        "versao_elemento": version,
        "versao_elemento_safe": version_safe,
        "code_version": code_version,
        "widget_slug": widget_slug,
        "layout": layout,
        "bucket": BUCKET_NAME,
        "remote_base": remote_base,
        "urls": {"html": html_url, "css": css_url, "js": js_url},
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    manifest_remote = _join_remote(STORAGE_PREFIX, "_deploy_manifests", nome_safe, version_safe, f"{code_version}.json")
    manifest_url = upload_bytes(
        supabase,
        content=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        remote_path=manifest_remote,
        content_type="application/json",
    )
    print(f"Manifest URL: {manifest_url}")
    
    # Atualiza o Bubble
    # Observação: HTML do Storage não pode ser renderizado em iframe por CSP/sandbox,
    # mas pode ser baixado via fetch e injetado no DOM do Bubble (CSP do subresource não se aplica).
    update_bubble(nome, version, css_url, js_url, html_url=html_url, code_version=code_version, manifest_url=manifest_url)


def bubble_get_active_record(nome: str):
    """
    Busca 1 registro ativo no Bubble para um dado nome.
    Retorna dict do item (com html/css/js/version) ou None.
    """
    if not BUBBLE_OBJ_URL or not BUBBLE_TOKEN:
        print("Erro: BUBBLE_OBJ_URL ou BUBBLE_TOKEN não configurados; não dá para fazer pull.")
        return None

    resp = None
    for nk in bubble_name_keys():
        for ak in bubble_active_keys():
            constraints = [
                {"key": nk, "constraint_type": "equals", "value": nome},
                {"key": ak, "constraint_type": "equals", "value": True},
            ]
            r = requests.get(
                BUBBLE_OBJ_URL,
                params={"constraints": json.dumps(constraints), "limit": 1},
                headers=bubble_headers(),
                timeout=30,
            )
            if r.status_code in (200, 201):
                resp = r
                break
        if resp is not None:
            break

    if resp is None:
        print("Erro: Bubble GET falhou (nenhuma chave funcionou)")
        return None
    if resp.status_code not in (200, 201):
        print(f"Erro: Bubble GET falhou ({resp.status_code})")
        print(resp.text)
        return None
    data = resp.json()
    results = (data.get("response") or {}).get("results") or []
    return results[0] if results else None


def download_to_file(url: str, dest_path: Path):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"Falha ao baixar {url} (HTTP {r.status_code})")
    dest_path.write_bytes(r.content)


def pull_latest(nome: str, widget_slug: str | None):
    """
    Baixa a versão ATIVA (Bubble) para o repo local, antes de editar.
    - widget_slug None: salva em public/index.html, public/style.css, public/script.js
    - widget_slug set: salva em public/widgets/<widget_slug>/form.(html|css|js)
    """
    item = bubble_get_active_record(nome)
    if not item:
        print(f"Nenhuma versão ativa encontrada no Bubble para nome='{nome}'.")
        return

    html_url = item.get(BUBBLE_FIELD_HTML)
    css_url = item.get(BUBBLE_FIELD_CSS)
    js_url = item.get(BUBBLE_FIELD_JS)
    version_value = item.get(BUBBLE_FIELD_VERSION)

    print(f"Pull latest: nome='{nome}', version='{version_value}'")
    print(f"  html: {html_url}")
    print(f"  css : {css_url}")
    print(f"  js  : {js_url}")

    if widget_slug:
        base = Path("public") / "widgets" / widget_slug
        html_path = base / "form.html"
        css_path = base / "form.css"
        js_path = base / "form.js"
    else:
        base = Path("public")
        html_path = base / "index.html"
        css_path = base / "style.css"
        js_path = base / "script.js"

    if html_url:
        download_to_file(html_url, html_path)
        print(f"  -> {html_path}")
    if css_url:
        download_to_file(css_url, css_path)
        print(f"  -> {css_path}")
    if js_url:
        download_to_file(js_url, js_path)
        print(f"  -> {js_path}")

if __name__ == "__main__":
    main()

