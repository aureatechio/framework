## Objetivo

Projeto estático (HTML/CSS/JS) + script Python (`deploy.py`) para **publicar assets no Supabase Storage** e (opcionalmente) **atualizar registros no Bubble (Data API)**.

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









