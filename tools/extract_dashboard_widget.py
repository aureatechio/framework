from __future__ import annotations

import re
from pathlib import Path


def read_text_best_effort(path: Path) -> str:
    data = path.read_bytes()
    # tenta UTF-8 (com/sem BOM) e cai para cp1252 (comum no Windows)
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    # fallback lossless
    return data.decode("latin-1", errors="replace")


DIV_OPEN_RE = re.compile(r"<div\b[^>]*>", re.I)
DIV_CLOSE_RE = re.compile(r"</div\s*>", re.I)


def find_container_block(html: str, container_id: str) -> str:
    # Acha a tag de abertura que contém id="<container_id>" ou id='<container_id>'
    start_match = re.search(
        rf"<div\b[^>]*\bid\s*=\s*(?:\"{re.escape(container_id)}\"|'{re.escape(container_id)}')[^>]*>",
        html,
        flags=re.I,
    )
    if not start_match:
        raise RuntimeError(f"Não achei a tag <div> com id='{container_id}'.")

    start = start_match.start()

    # Scanner simples para achar o fechamento correspondente, contando divs.
    depth = 0
    i = start
    n = len(html)
    while i < n:
        open_m = DIV_OPEN_RE.search(html, i)
        close_m = DIV_CLOSE_RE.search(html, i)

        if open_m and (not close_m or open_m.start() < close_m.start()):
            depth += 1
            i = open_m.end()
            continue

        if close_m:
            depth -= 1
            i = close_m.end()
            if depth == 0:
                return html[start:i]
            continue

        break

    raise RuntimeError("Não consegui encontrar o </div> final do container (HTML pode estar truncado).")


def main() -> None:
    src_path = Path("dashboard/dashboard.html")
    out_dir = Path("public/widgets/dashboard")
    out_dir.mkdir(parents=True, exist_ok=True)

    src = read_text_best_effort(src_path)
    block = find_container_block(src, "dashboard-acelerai-v2")

    # 1) CSS: primeiro <style> dentro do container
    m_style = re.search(r"<style[^>]*>(.*?)</style>", block, flags=re.S | re.I)
    if not m_style:
        raise RuntimeError("Não achei o bloco <style> dentro do container.")
    css = m_style.group(1).strip("\n")

    # 2) Remover scripts externos do HTML
    block_wo_external = re.sub(
        r"<script[^>]*\ssrc\s*=\s*[^>]*></script>\s*",
        "",
        block,
        flags=re.I,
    )

    # 3) JS: último <script> inline (o principal)
    inline_scripts = re.findall(r"<script>(.*?)</script>", block_wo_external, flags=re.S | re.I)
    if not inline_scripts:
        raise RuntimeError("Não achei nenhum <script> inline dentro do container.")
    js = inline_scripts[-1].strip("\n")

    # 4) HTML fragment: remover <style> e todos scripts (externos já removidos)
    html_body = re.sub(r"<style[^>]*>.*?</style>\s*", "", block_wo_external, flags=re.S | re.I)
    html_body = re.sub(r"<script>.*?</script>\s*", "", html_body, flags=re.S | re.I)

    # Wrapper obrigatório do framework
    form_html = f'<div data-cdn-widget="dashboard">\n{html_body.strip()}\n</div>\n'

    (out_dir / "form.html").write_text(form_html, encoding="utf-8", newline="\n")
    (out_dir / "form.css").write_text(css + "\n", encoding="utf-8", newline="\n")
    (out_dir / "form.js").write_text(js + "\n", encoding="utf-8", newline="\n")

    print("OK: gerados:", out_dir / "form.html", out_dir / "form.css", out_dir / "form.js")


if __name__ == "__main__":
    main()


