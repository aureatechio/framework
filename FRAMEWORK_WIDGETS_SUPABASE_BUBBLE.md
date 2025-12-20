### Framework padrão: Widgets no Bubble via CDN (Supabase Storage) com versionamento + deploy automatizado + PULL latest

Este documento descreve, de forma **técnica e passo a passo**, o framework que estamos usando para:

- Construir **widgets** (componentes) em **HTML/CSS/JS**.
- Publicar os arquivos em **Supabase Storage** como **CDN** em pastas versionadas (`v1`, `v2`, …) **por elemento** (ex.: `dashboard/v2/...`).
- Atualizar automaticamente a tabela `versionamento` no **Bubble** após cada deploy (desativando os anteriores e ativando o novo).
- Renderizar esses widgets **dentro** do Bubble (sem iframe) por meio de um **loader** JS global.
- Adotar a regra operacional **PULL latest before deploy**: sempre baixar a versão ativa do Bubble/Storage antes de editar/publicar.

> Idioma: Português (PT-BR).  
> Público-alvo: agentes, devs e novos chats que precisam seguir o mesmo padrão.

---

### 1) Problema e motivação

O Bubble é excelente para construir apps rápidos, mas “componentes complexos” (UI rica, integrações customizadas, lógica de frontend) ficam mais fáceis de manter quando encapsulados como **widgets** em HTML/CSS/JS.

Queremos:
- Entregar UI rica sem depender de plugins.
- Versionar e publicar com “CDN” (cache, rollback, previsibilidade).
- Controlar qual versão está ativa dentro do Bubble.
- Renderizar vários widgets na mesma página (ex.: 5–15).

---

### 2) Decisão arquitetural crítica: por que NÃO usar iframe

Tentamos usar `<iframe src="...supabase.../index.html">` e o navegador reportou erros de CSP/sandbox (ex.: `default-src 'none'; sandbox`).

Isso significa:
- O Supabase aplica uma política restritiva ao servir HTML, impedindo que scripts/estilos rodem em iframe.

**Conclusão:** o padrão correto é **renderização por fragmento**:
- Baixar o HTML do widget via `fetch(htmlUrl)`
- Injetar no DOM do Bubble (`container.innerHTML = ...`)
- Carregar CSS/JS como arquivos externos

---

### 3) Componentes do framework (definições)

#### 3.1 Widget

Um widget é um pacote de 3 arquivos:
- `form.html` (fragmento HTML; sem `<!DOCTYPE>`, sem `<html>`, `<head>`, `<body>`)
- `form.css` (estilos escopados)
- `form.js` (lógica + `init(root, params)`)

**Estrutura local (repo):**
- `public/widgets/<slug>/form.html`
- `public/widgets/<slug>/form.css`
- `public/widgets/<slug>/form.js`

**Estrutura no Supabase Storage (CDN) — novo padrão (por elemento):**
- `cdn-assets/<nome>/v<NN>/form.html`
- `cdn-assets/<nome>/v<NN>/form.css`
- `cdn-assets/<nome>/v<NN>/form.js`

> Observação: `<nome>` é o valor salvo no Bubble (campo `nome`).  
> Se você usa `widget_slug` diferente de `nome`, tudo bem: `widget_slug` é só a pasta local; o Storage usa `<nome>`.

**Regras obrigatórias do widget:**
- O HTML deve ter um wrapper para escopo:
  - `<div data-cdn-widget="<slug>"> ... </div>`
- O CSS deve ser escopado por esse wrapper:
  - `[data-cdn-widget="<slug>"] ...`
- O JS deve registrar um `init` no registry:
  - `window.CDN_WIDGET_REGISTRY["<widgetKey>"] = { init }`

#### 3.2 Loader (motor)

Um único JS global que roda dentro do Bubble:
- lê `window.CDN_WIDGETS`
- espera o Bubble criar/renderizar containers (MutationObserver + retry)
- injeta HTML
- injeta CSS/JS com dedupe por URL
- chama `init` do widget (se existir)

**Arquivo local:**
- `public/script.js`

**Arquivo na CDN (loader/main) — novo padrão (por elemento):**
- `cdn-assets/main/v<NN>/script.js`

**Regras do loader:**
- Ser **idempotente**: se for incluído 2x no Bubble, não pode quebrar (“already been declared”).
- Deduplicar CSS/JS por URL.
- Montar widgets mesmo que o Bubble crie DOM mais tarde.

---

### 4) Modelo no Bubble: tabela `versionamento`

O Bubble é a “fonte de verdade” do que está ativo.

#### 4.1 Campos (como você modelou)

No type `versionamento` existem:
- `nome` (nome do elemento/widget)
- `version` (versão publicada, ex.: `v21`)
- `ativo` (yes/no)
- `html` (URL do HTML)
- `css` (URL do CSS)
- `js` (URL do JS)

#### 4.2 Nomes internos na Data API (muito importante)

O Bubble pode expor nomes “internos” na Data API. No nosso projeto, vimos respostas com:
- `nome_text`, `css_text`, `js_text`, `html_text`, `ativo_boolean`

E você informou que `version` é exposto como **`version`** (sem sufixo `_text`).

Por isso usamos chaves configuráveis em `config.env`.

---

### 5) Configuração do projeto (config.env)

Arquivo: `config.env`

Campos principais:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (somente para deploy; nunca no browser)
- `SUPABASE_BUCKET_NAME` (ex.: `cdn-assets`)

Bubble:
- `BUBBLE_OBJ_URL` (endpoint Data API do type `versionamento`)
- `BUBBLE_TOKEN` (Bearer token)

Mapeamento de campos Bubble (Data API):
- `BUBBLE_FIELD_NOME` (ex.: `nome_text` ou `nome`)
- `BUBBLE_FIELD_VERSION` (**`version`**)
- `BUBBLE_FIELD_ATIVO` (ex.: `ativo_boolean`)
- `BUBBLE_FIELD_HTML` (ex.: `html_text`)
- `BUBBLE_FIELD_CSS` (ex.: `css_text`)
- `BUBBLE_FIELD_JS` (ex.: `js_text`)

---

### 6) Deploy automatizado (deploy.py)

Arquivo: `deploy.py`

Ele faz:
1. Upload para o Supabase Storage em `<nome>/vNN/...` (novo padrão)
2. Atualiza Bubble:
   - desativa registros anteriores com o mesmo `nome` e `ativo=true`
   - cria um novo registro com `ativo=true`, URLs e `version`
3. Gera um **manifesto** do deploy no bucket (versionamento do código), com `code_version` (git hash ou timestamp).

#### 6.1 Modos de deploy

##### A) Deploy do loader (main)

Publica:
- `public/index.html`
- `public/style.css`
- `public/script.js`

Para (novo padrão):
- `cdn-assets/main/vNN/index.html`
- `cdn-assets/main/vNN/style.css`
- `cdn-assets/main/vNN/script.js`

Comando:
```bash
python deploy.py v11 main
```

##### B) Deploy de widget

Publica:
- `public/widgets/<widget_slug>/form.html`
- `public/widgets/<widget_slug>/form.css`
- `public/widgets/<widget_slug>/form.js`

Para (novo padrão):
- `cdn-assets/<nome>/vNN/form.(html|css|js)`

Comando:
```bash
python deploy.py v21 popup-criar-lead popup-criar-lead
```

**Parâmetros:**
- `v21` = valor salvo em `version` no Bubble
- `popup-criar-lead` (2º arg) = valor salvo em `nome` no Bubble
- `popup-criar-lead` (3º arg) = pasta local em `public/widgets/popup-criar-lead/`

> Dica (para manter versões lado a lado no repo): se existir `public/widgets/<widget_slug>/v21/form.*`, o deploy usa essa pasta; senão usa `public/widgets/<widget_slug>/form.*`.

---

### 6.2 Layout legacy (compatibilidade)

Se você precisar manter o layout antigo:
- `cdn-assets/vNN/widgets/<widget_slug>/form.*`
- `cdn-assets/vNN/script.js`

Defina no `config.env`:
- `STORAGE_LAYOUT=legacy`

---

### 7) Regra operacional obrigatória: PULL latest before deploy

Antes de editar um widget/loader, o agente deve **baixar a versão ativa**.

Motivos:
- Evita editar um código desatualizado
- Evita regressões e “drift”
- Garante que a base local começa sempre a partir do que está em produção/ativo no Bubble

#### 7.1 Pull de widget (baixar a versão ativa)

Comando:
```bash
python deploy.py pull popup-criar-lead popup-criar-lead
```

O script:
1. Faz GET no Bubble procurando `nome=<nome>` e `ativo=true`
2. Lê `html/css/js` do registro ativo
3. Baixa os arquivos e salva em:
   - `public/widgets/<widget_slug>/form.html`
   - `public/widgets/<widget_slug>/form.css`
   - `public/widgets/<widget_slug>/form.js`

#### 7.2 Pull do loader (main)

Comando:
```bash
python deploy.py pull main
```

Ele baixa para:
- `public/index.html`
- `public/style.css`
- `public/script.js`

---

### 8) Renderização no Bubble (uso correto)

#### 8.1 Containers (na página)

Crie um elemento HTML por instância:
```html
<div id="slot-1"></div>
```

#### 8.2 Header (Page → HTML Header)

Defina `window.CDN_WIDGETS` e inclua o loader:
```html
<script>
  window.CDN_WIDGETS = [
    {
      widgetKey: "popup-criar-lead",
      rootId: "slot-1",
      htmlUrl: "URL_FORM_HTML",
      cssUrl:  "URL_FORM_CSS",
      jsUrl:   "URL_FORM_JS",
      params: {
        vendedorResponsavelId: "UUID",
        ambienteTeste: true,
        prefill: { nome: "", telefone: "", email: "", empresa: "" }
      }
    }
  ];
</script>

<script defer src="URL_DO_LOADER/script.js"></script>
```

**Regras importantes:**
- `window.CDN_WIDGETS` deve ficar no **Header**, não dentro de um elemento HTML.
- O loader deve ser incluído **uma única vez** (ele é idempotente, mas 1 vez é o ideal).

---

### 9) Escalabilidade (5–15 widgets) e widgets ocultos

#### 9.1 5–15 widgets

Funciona porque:
- HTML é 1 fetch por instância
- CSS/JS são deduplicados por URL (carrega 1 vez por URL)
- O loader espera DOM (não depende de timing do Bubble)

#### 9.2 Widgets ocultos / renderização posterior

Cenários:
- Se o container existe no DOM (mesmo hidden): o loader monta.
- Se o Bubble cria o container depois: o loader monta quando aparece (MutationObserver).

Melhoria recomendada (para controle por workflow):
- expor funções globais:
  - `window.CDN_MOUNT()` / `window.CDN_MOUNT_ONE(...)`

---

### 10) Teste de múltiplas versões na mesma página (v14/v15/v16)

Se você carregar versões diferentes com o mesmo `widgetKey`, elas brigam pelo registry:
- `window.CDN_WIDGET_REGISTRY["popup-criar-lead"] = ...`

Para teste lado a lado, use chaves versionadas:
- `popup-criar-lead@v14`
- `popup-criar-lead@v15`
- `popup-criar-lead@v16`

---

### 11) Checklist (SOP) para novos agentes/chats

1) Identificar:
- `nome` (Bubble): nome do elemento/widget
- `widget_slug` (repo): pasta em `public/widgets/<slug>/`

2) **PULL latest**:
- `python deploy.py pull <nome> <widget_slug>`

3) Editar localmente:
- `form.html/.css/.js` (ou `public/script.js` para loader)

4) Escolher nova versão:
- `vNN` (com prefixo `v`)

5) DEPLOY:
- Widget: `python deploy.py vNN <nome> <widget_slug>`
- Loader: `python deploy.py vNN main`

6) Validar no Bubble:
- só 1 registro ativo por `nome`
- `nome` correto
- `version` correto (ex.: `v21`)
- URLs corretas

---

### 12) Troubleshooting (erros comuns)

- **“Bug in custom html / Unexpected token”**
  - você colocou `<script>` dentro de um elemento HTML em vez do Header.

- **“Identifier ... already been declared”**
  - loader incluído mais de uma vez (idempotência reduz o problema, mas prefira 1 include).

- **Widget não monta**
  - faltou incluir o loader no Header
  - container `rootId` não existe (id errado)
  - URL do widget aponta para `index.html/style.css/script.js` em vez de `form.html/form.css/form.js`


