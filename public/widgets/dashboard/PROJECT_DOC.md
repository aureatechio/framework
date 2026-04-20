# Projeto `testeCDNmauro` — Contexto completo (framework + widget `wish-board` / `dashboard`)

Este documento serve como **“fonte única”** para outra IA (ou dev) entender este repositório e operar com segurança:

- Rodar localmente (visualização rápida).
- Entender o **framework Bubble + Loader + Supabase Storage (CDN)**.
- Fazer **PULL latest** (baixar a versão ativa antes de editar) e **DEPLOY**.
- Entender o widget **`wish-board`** (pasta local `public/widgets/dashboard/`) e onde mexer.
- Entender regras-chave de métricas: **horário útil dinâmico**, **FRT**, **Tempo Proposta** e **Follow-up**.

> **Nota (segredos):** conforme solicitado, este doc **mantém** URLs/IDs/tokens atuais que já estão no código (não mascarados). Use com cautela.

---

> **IMPORTANTE para IAs:** Este projeto utiliza uma **arquitetura de multi-agentes especializados**. Antes de operar, leia obrigatoriamente o guia:
> 
> **[`docs/AGENTS_GUIDE.md`](../../docs/AGENTS_GUIDE.md)** — Define 10 agentes especializados (Métricas, SLAs, Ranking, Gráficos, Canais, Reuniões, Filtros, Deploy, CSS, Debugging) e o protocolo de operação.

---

## Atualizações recentes (v122–v185) — resumo

Esta seção resume as mudanças mais relevantes feitas recentemente no widget **`wish-board`**.

- **Filtros (header) e consistência de período**
  - Card **Reuniões** (lateral) passou a seguir o filtro do header: total do período + **Agendadas** + **Realizadas**.
  - Subtítulo do topo passou a refletir mês/ano e agência selecionada.
- **Agência (header)**
  - Filtro de agência agora é um **seletor de 3 pills**: **Todos | MGS | Aceleraí** (aplica filtro por `leads.agencia` UUID).
- **Marketing (Meta Ads) — Investimento por agência (v198)**
  - KPI **Investimento Mkt** passou a respeitar o filtro de agência do header via **allowlist de `campaign.id`** (Meta Graph API).
  - “Todos” agora soma **apenas** as campanhas mapeadas (MGS + Aceleraí), em vez do total do ad account.
  - Nota técnica crítica: com `filtering` no `/insights`, o Meta pode retornar **múltiplas linhas/páginas**; portanto é obrigatório **paginar e somar** `spend` para obter o total correto.
- **Compras (qualidade de dados)**
  - Filtro best-effort para ignorar compras de teste: `compras.is_test is not true` (quando a coluna existir).
- **Velocímetro**
  - Meta mensal vinda do CRM (fallbacks documentados abaixo).
  - Quando vendedor selecionado **não é elegível à rotação** (`vendedores.elegivel_rotacao=false`), a meta é exibida como `--`.
  - Em filtro **Mês**, o alvo/meta do velocímetro usa a **meta do mês inteiro**.
- **Gráfico “Evolução do Faturamento” (ApexCharts)**
  - Ganhou **controles próprios** (independentes do header): período `Mês/Semestre/Ano`, toggles de linhas e zoom.
  - “Legenda” virou toggle do marcador do “dia atual” (linha tracejada + pontos + caixa fixa).
  - Série **“Projeção”** (Run Rate) adicionada: linha **pontilhada** a partir do ponto atual até o fim do período (ativa em Mês/Ano).
- **Metas (Propostas/Reuniões)**
  - Percentuais e donuts foram ajustados para ficar **mais legíveis** (0 casas decimais e fonte maior no donut).
- **Ranking**
  - Propostas no ranking passaram a contar **1 proposta por lead por vendedor** (deduplicação por `id_lead`).

## 1) O que é este repo

Este repo é um projeto estático (HTML/CSS/JS) + um script Python (`deploy.py`) para:

- publicar assets em **Supabase Storage** (usado como CDN)
- (opcionalmente) atualizar o **Bubble** via **Data API** para apontar para a nova versão

Arquivos principais:

- Loader global: `public/script.js`
- Widgets: `public/widgets/<widget_slug>/form.html|form.css|form.js`
- Deploy/Pull: `deploy.py`

---

## 2) Arquitetura (Bubble ↔ Loader ↔ Supabase Storage)

### 2.1 Conceito

No Bubble, o widget não roda em iframe. Em vez disso:

1) O Bubble injeta `window.CDN_WIDGETS` no **Page → HTML Header**  
2) O loader (`public/script.js`) monta widgets:
   - injeta CSS
   - faz `fetch` do HTML fragmento e injeta no container
   - carrega o JS do widget via `<script src=...>`
   - chama `window.CDN_WIDGET_REGISTRY[widgetKey].init(root, params)`

### 2.2 Estruturas globais importantes

- `window.CDN_WIDGETS`: lista de widgets a montar (definido no Bubble).
- `window.CDN_WIDGET_REGISTRY`: registry onde cada widget registra seu `init`.
- `window.CDN_LOADER.mount(...)`: API para montar dinamicamente (útil em testes).
- Idempotência do loader: `window.__CDN_LOADER_INITED__` evita double-run.

Fonte de verdade:
- `public/script.js`
- `FRAMEWORK_WIDGETS_SUPABASE_BUBBLE.md`

---

## 3) Rodar local (visualização rápida)

Pré-requisito: Python 3.10+ (recomendado).

### 3.1 Servir por HTTP (recomendado)

```bash
python -m http.server 8080
```

Abra:
- `http://localhost:8080/public/`

### 3.2 Observações

- Como os widgets dependem de Supabase e outras APIs, local serve para validar layout/JS básico e console.
- O loader monta widgets com base no que estiver em `window.CDN_WIDGETS` (você pode simular isso no `public/index.html` ou via console usando `window.CDN_LOADER.mountOne(...)`).

---

## 4) Deploy e Pull latest (workflow recomendado)

### 4.1 Dependências do `deploy.py`

`requirements.txt`:
- `supabase`
- `python-dotenv`
- `requests`

### 4.2 Configuração de ambiente (deploy)

Copie:

```bash
copy config.env.example config.env
```

Campos importantes (exemplo em `config.env.example`):

- Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (**somente** para deploy; nunca no browser)
  - `SUPABASE_BUCKET_NAME=cdn-assets`
  - `STORAGE_LAYOUT=per_element`
  - `STORAGE_PREFIX` (opcional)
- Bubble (Data API):
  - `BUBBLE_OBJ_URL`
  - `BUBBLE_TOKEN`
  - mapeamento de campos (`BUBBLE_FIELD_*`)

### 4.3 Layout no Storage (padrão `per_element`)

O deploy publica em:

- **Loader (main):** `main/<versao>/index.html|style.css|script.js`
- **Widget:** `<nome>/<versao>/form.html|form.css|form.js`

E também cria um manifesto:

- `_deploy_manifests/<nome>/<versao>/<code_version>.json`

> `code_version` vem do git short hash (`git-xxxxxxx`) ou timestamp UTC como fallback.

### 4.4 PULL latest (antes de editar)

Regra operacional (SOP): **sempre puxar o que está ativo** antes de modificar.

Comandos:

- Pull do loader:

```bash
python deploy.py pull main
```

- Pull de widget (nome no Bubble + pasta local):

```bash
python deploy.py pull wish-board dashboard
```

Isso baixa para:
- `public/widgets/dashboard/form.html`
- `public/widgets/dashboard/form.css`
- `public/widgets/dashboard/form.js`

### 4.5 Deploy

- Deploy do loader:

```bash
python deploy.py <versao> main
```

- Deploy do widget `wish-board` usando a pasta local `dashboard`:

```bash
python deploy.py <versao> wish-board dashboard
```

O script:
- sobe os arquivos para o Storage
- gera manifesto
- atualiza Bubble (ativa nova versão e desativa versões anteriores com mesmo `nome`)

Fonte de verdade:
- `README.md`
- `FRAMEWORK_WIDGETS_SUPABASE_BUBBLE.md`
- `deploy.py`

---

## 5) Integração no Bubble (Header + containers)

### 5.0 Conceitos importantes: `widgetKey` vs `nome` vs `widget_slug`

Neste projeto, existem **3 nomes** que aparecem e podem confundir:

- **`widgetKey`**: é a chave usada pelo loader para achar o `init()` no registry.
  - Aqui: `widgetKey: "wish-board"` (é o mesmo valor do `WIDGET_KEY` no JS).
- **`nome` (Bubble/versionamento)**: é o “nome do elemento” que o `deploy.py` atualiza no Bubble.
  - Aqui: `nome = "wish-board"` (é o 2º argumento do deploy).
- **`widget_slug` (pasta local no repo)**: é a pasta em `public/widgets/<widget_slug>/`.
  - Aqui: `widget_slug = "dashboard"` (é o 3º argumento do deploy).

Ou seja, este widget é:

```text
nome (Bubble)     = wish-board
widgetKey (loader)= wish-board
widget_slug (repo)= dashboard
```

### 5.1 Container na página

Crie um HTML Element no Bubble com:

```html
<div id="slot-wish-board"></div>
```

### 5.2 Header (Page → HTML Header)

Exemplo (simplificado; use URLs da versão publicada):

```html
<script>
  window.CDN_WIDGETS = [
    {
      widgetKey: "wish-board",
      rootId: "slot-wish-board",
      htmlUrl: "URL_FORM_HTML",
      cssUrl:  "URL_FORM_CSS",
      jsUrl:   "URL_FORM_JS",
      params: {
        loggedSellerId: "UUID_DO_VENDEDOR_LOGADO",

        // (Opcional) Horário útil dinâmico (impacta FRT/Follow-up/Tempo Proposta)
        businessHours: {
          start: "2026-01-15T09:00:00.000Z",
          end:   "2026-01-15T19:00:00.000Z",
          exclude_weekends: true
        },

        // (Opcional) Corte global
        applyCutoff: true,
        cutoffDate: "2025-01-01T00:00:00"
      }
    }
  ];
</script>

<script defer src="URL_DO_LOADER/script.js"></script>
```

### 5.3 Checklist rápido (erro mais comum)

- **Não declarar `params` duas vezes** no mesmo objeto do widget (JS sobrescreve o anterior).
- `businessHours` deve estar **dentro** de `params`.
- `rootId` precisa existir na página.
- Loader deve ser incluído (idealmente 1 vez).

---

## 6) Widget `wish-board` (pasta local `public/widgets/dashboard/`)

### 6.1 Arquivos do widget

- HTML: `public/widgets/dashboard/form.html`
  - wrapper: `<div data-cdn-widget="dashboard">`
  - container principal: `#dashboard-acelerai-v2`
  - tem “skeleton” (`#dashboard-skeleton`) e conteúdo real (`#dashboard-content`)
- CSS: `public/widgets/dashboard/form.css`
  - tokens CSS + dark mode via `#dashboard-acelerai-v2.dark-mode`
  - regras de grid, cards, ranking, modal etc.
- JS: `public/widgets/dashboard/form.js`
  - registra `window.CDN_WIDGET_REGISTRY["wish-board"].init(...)`
  - faz `initSupabase()`, `initRealtime()`, e carrega as métricas

### 6.2 Dependências (carregadas dinamicamente)

O próprio `form.js` carrega (once) via CDN:
- Lucide: `https://unpkg.com/lucide@latest`
- ApexCharts: `https://cdn.jsdelivr.net/npm/apexcharts`
- Supabase JS v2: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`

### 6.3 Credenciais/IDs atualmente no frontend (fonte: `form.js`)

- Supabase:
  - `SUPABASE_URL = 'https://awqtzoefutnfmnbomujt.supabase.co'`
  - `SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY'` (anon JWT)
- Meta Ads:
  - `META_GRAPH_VERSION = 'v20.0'`
  - `META_AD_ACCOUNT_ID = 'act_843937229337573'`
  - `META_ACCESS_TOKEN = 'EAASGBRlEgBwBQGFUAaRob6p1yhZCfLL9szluxABxeXFYmmpz0Gankr47BZBKFD8TAkBharYfGwck69wMZC8okMGjoIfZAP8VcirRD6Eu2uBQ4PqJHj7NYKuBz83F2rvRhb4D32iCC0Iar2URocbEEw1dZCf4GFamZBnVz4OLt49k3ejs1UFx2eMondXTlCApOe'`

### 6.4 Fluxo de inicialização (alto nível)

1) Loader injeta HTML e chama `init(root, params)`.
2) `init` salva params em `window.__WISH_BOARD_PARAMS__` (fallback global).
3) `init()` aguarda libs carregarem, inicializa Supabase, Realtime e UI (charts/labels).
4) Controle de acesso:
   - líder vê global; vendedor comum fica travado no próprio vendedor.
5) `fetchData()` dispara queries e renderizações.

---

## 7) Parâmetros e “business hours” (horário útil dinâmico)

### 7.1 Contrato `params.businessHours`

Docs: `docs/horario_util_dinamico_params.md`

- `start` / `end`: string ISO UTC (o código extrai apenas HH:MM via UTC).
- `exclude_weekends`:
  - `true` (padrão): seg–sex
  - `false`: seg–dom

Fallback (quando não passa ou vem inválido):
- janela SP 09:00–19:00, seg–sex, modo `sp` (UTC-3 fixo)

### 7.2 Função unificada

No `dashboard/form.js`:
- `__parseBusinessHoursCfg(params)` → cria `__BUSINESS_HOURS_CFG`
- `__businessMinutesBetweenWeekdaysMs(startMsUtc, endMsUtc, cfg)` → retorna **minutos úteis** dentro da janela.

Esse relógio impacta:
- FRT (diffMinutes)
- Tempo Proposta (diffHours = minutes/60)
- Follow-up (diffHours = minutes/60)

---

## 8) Métricas e regras (onde olhar e como funciona)

Documentação detalhada do dashboard (métricas/queries):
- `DASHBOARD_WISH_BOARD.md` (arquivo de referência no repo; pode conter nota de “movido” dependendo da versão)

Docs específicos (padrões replicáveis):
- `docs/tempo_proposta_filtro.md`
- `docs/followup_horas_uteis.md`
- `docs/horario_util_dinamico_params.md`

### 8.0 Novidades importantes (UI/controles)

#### 8.0.1 Gráfico “Evolução do Faturamento” (controles próprios)

- Render: `renderRevenue()` (ApexCharts).
- Dados: `fetchRevenue()` monta `state.revenueChartData` e chama `processRevenueData(...)`.
- Controles independentes do header (no próprio card):
  - Período: `Mês` (diário), `Semestre` e `Ano` (agregação mensal)
  - Linhas: `Realizado`, `Ano passado`, `Meta`, `Projeção`
  - `Zoom`: habilita zoom no eixo X por **scroll do mouse** e seleção por arrasto
  - `Legenda`: toggle do marcador do “dia atual” (linha tracejada + pontos + caixa fixa)
  - `Projeção`: run-rate do período atual:
    - **Mês**: \((faturamento acumulado até hoje / dias passados) × dias do mês\)
    - **Ano**: \((faturamento acumulado até mês atual / meses passados) × 12\)
    - **Semestre**: desabilitado por padrão (não exibido como série)

Observação (Bubble): o container `#revenue-chart` tem altura fixa para evitar “crescimento” do card em re-render de gráficos.

#### 8.0.2 Velocímetro (meta e regras)

- Fonte da meta mensal (CRM):
  - Preferência: RPC `crm_get_metas_vendedores` → `meta_mensal_final` (quando aplicável)
  - Fallback: tabela `crm_metas_geral_mes.meta_geral` (por `mes`)
  - Fallback final: `monthlyTarget` em `params` (ou constante)
- Regra de exibição: se vendedor selecionado **não elegível à rotação** (`vendedores.elegivel_rotacao=false`), a meta é exibida como `--`.
- Regra de período: em filtro `Mês`, a meta exibida é a meta do **mês inteiro**.

#### 8.0.3 Compras de teste (`is_test`)

- As queries de `compras` aplicam um filtro best-effort para ignorar registros de teste: `is_test is not true` (quando a coluna existir no ambiente).

### 8.1 SLAs (cards)

No `dashboard/form.js` → `fetchSLAs()`:

- **FRT Pré-vendas**:
  - calcula eventos via `computeFRTEventsHardcut()`
  - `diffMinutes` é em **minutos úteis** com `__BUSINESS_HOURS_CFG`
  - guardrails: `diffMinutes > 0` e `< 43200`
  - SLA: `<= 20min`
  - Observação: hardcut sobrepõe header/cutoff conforme regra do widget.

- **Tempo Proposta (SLA 6h)**:
  - etapa âncora hardcoded:
    - `PROPOSAL_STAGE_ID = a22c3ad3-6093-4c57-a633-da16a5b4514c`
  - `t0`: 1ª entrada na etapa no período do header
  - `t1`: 1ª proposta após t0 (pode ocorrer após fim do header)
  - delta: `__businessMinutesBetweenWeekdaysMs(t0, t1)/60`
  - guardrails: `t1 > t0` e `< 720h`
  - filtro por vendedor (prioridade): proposta.id_vendedor → log entry.vendedor_id → leads.vendedorResponsavel

- **Follow-up (SLA 24h)**:
  - etapas hardcoded:
    - FLW1 `dde9e8fa-142f-411b-b6f3-6c1f9f6cc0c9`
    - FLW2 `169eb74f-ee37-4b49-9848-6866fd3b8af9`
    - FLW3 `f9e89423-7b32-4680-90aa-be7480a5dc0a`
  - `prev_t1` + deltas consecutivos
  - delta em horas úteis usando o mesmo relógio/config

### 8.2 Ranking (Executivos)

UI:
- `public/widgets/dashboard/form.html` → `<select id="ranking-sort">` com opções:
  - `score`, `proposals`, `meetings`, `sales`, `revenue`, `frt`, `cycle`.

Definições importantes:
- **`sales` (Vendas)**: **quantidade** (count de linhas aprovadas em `compras` no período).
- **`revenue` (Faturamento total)**: **R$** (soma de `compras.valor_total` aprovadas no período).
- **`proposals` (Propostas)**: conta **1 proposta por lead por vendedor** (dedup por `id_lead` em `imagemProposta`).

Regra:
- `score/proposals/meetings/sales/revenue`: **maior é melhor** (ordem desc).
- `frt/cycle`: **menor é melhor** (ordem asc).

Arquivo:
- `public/widgets/dashboard/form.js` → `renderRanking()` e `fetchRankingData()`.

UI do card (ranking):
- Pills exibidas: **Propostas**, **Reuniões**, **Vendas (qtd)** e **Faturamento (R$)** (separados).
- O rodapé mantém **Ciclo** e **FRT** (faturamento não fica mais no rodapé).

### 8.3 Realtime (auto-refresh)

O widget assina Supabase Realtime e agenda refresh debounced quando mudam:
- `agendamento`
- `imagemProposta`
- `leads`
- `loogsLeads`

Arquivo:
- `public/widgets/dashboard/form.js` → `initRealtime()`

---

## 9) Troubleshooting (prático)

- **Widget não monta**:
  - loader não está no Header
  - `rootId` não existe
  - URLs apontam para versão errada
  - JS não registrou `window.CDN_WIDGET_REGISTRY[widgetKey].init`
- **“Identifier already been declared”**:
  - loader/JS incluído múltiplas vezes; loader é idempotente, mas evite duplicar.
- **“Não atualiza”**:
  - cache do browser/Bubble/CDN
  - você está olhando uma versão antiga
  - confira o manifesto `_deploy_manifests/...` e o registro ativo no Bubble
- **Layout quebrado**:
  - CSS global do Bubble pode vazar; prefira escopo no wrapper (`#dashboard-acelerai-v2` e `[data-cdn-widget="dashboard"]`).

---

## 10) Mapa rápido: onde mexer

- **Guia de Multi-Agentes (OBRIGATÓRIO para IAs)**:
  - `docs/AGENTS_GUIDE.md` — arquitetura de 10 agentes especializados e protocolo de operação
- Loader (montagem, dedupe, fetch fragment, MutationObserver):
  - `public/script.js`
- Deploy/pull/versionamento:
  - `deploy.py`
  - `config.env.example`
- Widget dashboard (`wish-board`):
  - `public/widgets/dashboard/form.html`
  - `public/widgets/dashboard/form.css`
  - `public/widgets/dashboard/form.js`
- Documentação do dashboard:
  - `DASHBOARD_WISH_BOARD.md` (arquivo de referência no repo; pode conter nota de “movido” dependendo da versão)
- Docs de regras específicas:
  - `docs/horario_util_dinamico_params.md`
  - `docs/tempo_proposta_filtro.md`
  - `docs/followup_horas_uteis.md`
  - `docs/frt_logica.md`
  - `docs/confirmacoes_metricas_*.md` (validação de valores)

---

## 11) Estado do repo (referência)

- Branch: `main`
- Commit (curto): `2a15075`

### 11.1 Exemplo real de deploy recente (referência)

Exemplo (deploy do widget `wish-board` versão `v99`):

- HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.html`
- CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.css`
- JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.js`
- Manifesto: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v99/git-2a15075.json`

---

## 12) Changelog (obrigatório)

Este projeto **deve** manter um changelog “versão a versão” do que foi alterado no elemento publicado no Bubble.

- **Arquivo**: `public/widgets/dashboard/CHANGELOG.md`
- **Regra (SOP)**: a cada deploy (nova versão), atualizar o changelog com:
  - manifesto + URLs
  - `code_version`
  - lista **granular (“linha a linha”)** de mudanças por arquivo (1 item por alteração objetiva)

Isso garante rastreabilidade e facilita debug/rollback (Bubble/CDN/cache).

