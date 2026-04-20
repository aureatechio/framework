## Objetivo

Projeto estático (HTML/CSS/JS) + script Python (`deploy.py`) para **publicar assets no Supabase Storage** e (opcionalmente) **atualizar registros no Bubble (Data API)**.

## 🎯 Finalidade

Este repo entrega um **loader CDN + widgets estáticos** (HTML/CSS/JS) versionados e publicados no **Supabase Storage**.  
No produto, esses assets aparecem no **Bubble** (via Data API), que aponta para as URLs publicadas (CSS/JS/HTML) e monta os widgets na página.

## 🚀 Quickstart (local)

### Pré-requisitos

- [ ] Python 3.10+ (recomendado)

### Rodar

- [ ] Opção A (mais simples): abrir `public/index.html` no navegador
- [ ] Opção B (recomendado, via HTTP):

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080/public/`.

### Validar

- [ ] Tela abre (você vê “Teste de Deploy Versionado”)
- [ ] Nenhum erro no console
- [ ] (Se estiver testando widgets) os containers montam e não ficam pendentes no log

## 📦 Deploy / Atualização

### Como atualizar (padrão)

1) Configure o ambiente:

```bash
copy config.env.example config.env
python -m pip install -r requirements.txt
```

2) Faça deploy do “main” (loader em `public/`):

```bash
python deploy.py <versao> main
```

3) Faça deploy de um widget (ex.: `dashboard`):

```bash
python deploy.py <versao> wish-board dashboard
```

Observações importantes:

- O deploy **sobe arquivos com versão** no Storage (padrão `STORAGE_LAYOUT=per_element`): `<nome>/<versao>/...`
- O script também **cria um manifesto** do deploy no Storage: `_deploy_manifests/<nome>/<versao>/<code_version>.json`
- Se `BUBBLE_OBJ_URL` e `BUBBLE_TOKEN` estiverem configurados, o script **cria um registro no Bubble** e **desativa** versões anteriores do mesmo `nome`

### Changelog (obrigatório)

Após cada deploy, **atualize o changelog versão a versão**:
- `public/widgets/dashboard/CHANGELOG.md` (existe também um atalho em `CHANGELOG.md`)

### Como reverter (se quebrar)

- **Rollback rápido (recomendado)**: re-publicar a última versão boa, que vai virar a “ativa” no Bubble.

```bash
python deploy.py <versao_anterior_boa> <nome> [widget_slug]
```

Exemplos:

- main:
  - `python deploy.py v1 main`
- widget `dashboard`:
  - `python deploy.py v2 dashboard dashboard`

### Onde conferir versão em produção

- **No Bubble**: confira o registro ativo (`ativo=true`) do `nome` e o campo de versão (ex.: `version_text` / `version`)
- **No Storage**: confira o manifesto em `_deploy_manifests/<nome>/<versao>/...json` (ele inclui `code_version` e as URLs publicadas)

## Segurança (importante)

- **NUNCA** commite `config.env` (contém segredos como `SUPABASE_SERVICE_ROLE_KEY` e `BUBBLE_TOKEN`).
- Use `config.env.example` como modelo e crie um `config.env` local.
- Se você já compartilhou esses segredos por engano, **rotacione** as chaves (Supabase/Bubble) e atualize seu `config.env`.

## Estrutura

- `public/`: arquivos do “main” (`index.html`, `style.css`, `script.js`)
- `public/widgets/<widget_slug>/`: widgets (`form.html`, `form.css`, `form.js`)
- `deploy.py`: faz upload para Supabase Storage e atualiza Bubble (opcional)

## Pré-requisitos (para usar o `deploy.py`)

- Python 3.10+ (recomendado)

Instalar dependências:

```bash
python -m pip install -r requirements.txt
```

Configurar variáveis:

```bash
copy config.env.example config.env
```

Edite `config.env` e preencha os valores.

## Como rodar local (apenas para visualizar)

Os arquivos são estáticos. Você pode abrir `public/index.html` no navegador.

Se preferir servir por HTTP (evita problemas de CORS em alguns casos), use um servidor simples:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080/public/`.

## 🧯 Problemas comuns

- **“Não atualiza”**
  - provável **cache** (browser / Bubble / CDN) ou você está apontando para uma **versão antiga**
  - ação: publique uma **nova versão** (ex.: `v3`) e aponte o Bubble para ela (ou rode o `deploy.py`, que já marca a nova como ativa)
  - ação: force reload no browser e valide o manifesto gerado em `_deploy_manifests/...`

- **“Quebrou layout”**
  - provável **conflito de CSS** (estilos globais vazando entre Bubble e widget)
  - ação: prefira CSS “escopado” (classes raiz do widget) e evite seletores globais (`body`, `h1`, `*`, etc.)
  - ação: valide se o widget está carregando a **CSS correta** (URL do Storage da mesma versão do JS/HTML)

## Deploy para Supabase Storage (via `deploy.py`)

### Deploy do “main”

Sobe `public/index.html`, `public/style.css`, `public/script.js`:

```bash
python deploy.py <versao> [nome]
```

Exemplo:

```bash
python deploy.py v1 main
```

### Deploy de um widget

Sobe `public/widgets/<widget_slug>/form.(html|css|js)`:

```bash
python deploy.py <versao> [nome] <widget_slug>
```

Exemplo:

```bash
python deploy.py v2 dashboard dashboard
```

## Subir para o GitHub (repositório privado)

1) Crie um repositório **Private** no GitHub (via UI).
2) No seu PC, rode:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<org-ou-usuario>/<repo>.git
git push -u origin main
```

3) Dê acesso para a equipe:
- Repo → **Settings → Collaborators and teams**.









