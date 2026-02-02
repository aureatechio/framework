## `dashboard_tela` — Documento completo (contexto do widget)

Este documento serve como **fonte única de verdade** para entender o widget **`dashboard_tela`** (UI, parâmetros, fontes de dados e métricas), para facilitar manutenção por outros agentes/IA.

> Versão de referência (código atual no repo / última publicada no Bubble durante este trabalho): **v109**.

---

### 1) O que é o widget

O `dashboard_tela` é um dashboard de CRM/Marketing renderizado como **fragmento HTML/CSS/JS**, carregado no Bubble via framework de widgets.

Ele exibe:
- KPIs (faturamento, conversões, vendas, ticket, leads, etc.)
- Gráficos (ApexCharts) e velocímetro
- SLAs (FRT, ciclo, tempo da proposta, follow-up)
- Ranking de executivos (com dropdown de ordenação)
- Funil de vendas e pipeline por etapa

---

### 2) Como o widget inicializa (loader → params → execução)

No `form.js` o widget se registra no loader por:
- `window.CDN_WIDGET_REGISTRY[WIDGET_KEY].init = async function init(root, params) { ... }`

E salva os parâmetros recebidos em:
- `window.__WISH_BOARD_PARAMS__ = params || {}`

Depois carrega dependências e roda o dashboard.

**WIDGET_KEY atual no código**: `wish-board`  
> Observação: apesar do widget ser “dashboard_tela” no Storage/Bubble, o registry usa a chave `"wish-board"` no JS. Isso é importante para o loader.

---

### 3) Parâmetros suportados (`params`)

Os parâmetros são lidos de `window.__WISH_BOARD_PARAMS__` (ou seja, do `params` que o Bubble passa no Header via `window.CDN_WIDGETS[*].params`).

#### 3.1 `businessHours` (horário útil dinâmico)

Define a janela diária de **horas úteis** usada por:
- **FRT** (minutos úteis)
- **Follow-up** (horas úteis)
- **Tempo Proposta** (horas úteis)

Formato:

```js
params: {
  businessHours: {
    start: "2026-01-15T09:00:00.000Z",
    end:   "2026-01-15T19:00:00.000Z",
    exclude_weekends: true
  }
}
```

- **start/end**: o código usa apenas `HH:MM` via UTC (`getUTCHours()`/`getUTCMinutes()`).
- **exclude_weekends** (default `true`): se `false`, conta sáb/dom também.
- **Fallback**: se inválido/ausente, usa SP fixo (UTC-3) e 09:00–19:00, seg–sex.

⚠️ **Atenção**: não duplique a chave `params` no objeto do widget no Bubble. Em JavaScript, a última sobrescreve a anterior e você “perde” o `businessHours`.

#### 3.2 `applyCutoff` / `cutoffDate` (corte de dados)

Habilita um corte global (para a maior parte das queries), com semântica estrita `>`:

```js
params: {
  applyCutoff: true,
  cutoffDate: "2026-01-19T13:58:18.223Z"
}
```

O cutoff gera internamente:
- `cutoffInstantIso` (para colunas timestamp)
- `cutoffYmdLocal` (para colunas date-string como `agendamento.data`)

#### 3.3 `monthlyTarget` (meta mensal)

Sobrescreve a meta mensal padrão do widget (usada no velocímetro e meta do gráfico de faturamento):

```js
params: { monthlyTarget: 2100000 }
```

#### 3.4 `loggedSellerId` (opcional)

Permite informar o vendedor logado para controle de acesso/UI (quando aplicável no projeto):

```js
params: { loggedSellerId: "uuid-do-vendedor" }
```

#### 3.5 `scroll` (auto-scroll)

Auto-scroll inicial do dashboard, útil em TV/kiosk:

```js
params: { scroll: "#ranking-list" } // ou um id/selector suportado
```

#### 3.6 `funnelMode` (opcional)

Controla modo do funil (ex.: comportamento de carregamento/filtragem do funil/ads):

```js
params: { funnelMode: "lp" }
```

---

### 4) Fontes de dados (Supabase): tabelas e campos mais importantes

O widget usa Supabase (client-side) e consulta principalmente:

- **`vendedores`**: `id`, `nome`, `perfil_img`, `usuarioInterno`
- **`leads`**: `lead_id`, `created_at`, `vendedorResponsavel`, (e outros campos conforme blocos)
- **`loogsLeads`**: `lead`, `created_at`, `vendedor_id`, `etapa_anterior`, `etapa_posterior`, `descrição`
- **`imagemProposta`**: `created_at`, `id_lead`, `id_vendedor`
- **`agendamento`**: `leadId`, `data`, `hora`, `vendedor`, `score_final`, `statusReuniao`
- **`compras`**: `data_compra`, `valor_total`, `vendedoresponsavel`, `leadid`, `created_at`, `vendaaprovada`
- **`etapa`**: usado pontualmente para lookup (mas IDs críticos estão hardcoded para evitar drift)

---

### 5) Regras e IDs hardcoded importantes

#### 5.1 FRT (base + hardcut)
- **Etapa base (Oportunidade)**: `a6709949-9857-4b25-965d-b4bf8270426b`
- **Hardcut FRT (UTC)**: `2026-01-15T15:00:00.000Z` (equivale a 15/01/2026 12:00 em SP)

#### 5.2 Follow-up (FLW)
- **FLW1**: `dde9e8fa-142f-411b-b6f3-6c1f9f6cc0c9`
- **FLW2**: `169eb74f-ee37-4b49-9848-6866fd3b8af9`
- **FLW3**: `f9e89423-7b32-4680-90aa-be7480a5dc0a`

#### 5.3 Tempo Proposta (etapa âncora)
- **Etapa âncora**: `a22c3ad3-6093-4c57-a633-da16a5b4514c`

---

### 6) Métricas (como o widget calcula)

#### 6.1 Faturamento
- Fonte: `compras`
- Soma: `sum(parseCurrency(compras.valor_total))`
- Filtro de aprovação: `vendaaprovada IS NULL OR vendaaprovada = TRUE`
- Data de referência: `compras.data_compra` (não `created_at`)
- Filtro por vendedor (quando selecionado): `compras.vendedoresponsavel = selectedSeller`

#### 6.2 FRT (First Response Time) — global + individual

Conceito:
- Medir o tempo desde a **entrada** do lead na etapa base (Oportunidade) até a **primeira saída** dessa etapa.

Implementação:
- Função-chave: `computeFRTEventsHardcut()`
- Janela temporal do FRT: **hardcut** → “agora” (sobrepõe filtros do header/cutoff para FRT).
- `diffMinutes` agora representa **minutos úteis** (usando `businessHours`/`exclude_weekends`).
- Guardrails: `diffMinutes > 0` e `< 43200` (30 dias).

Ranking FRT:
- Ao agregar FRT por vendedor, o ranking **ignora eventos com `diffMinutes <= 1`** (mantém apenas `> 1`).

#### 6.3 Follow-up (horas úteis)

Fonte: `loogsLeads` e etapas FLW1/2/3.

Regras principais:
- Considera apenas a **primeira entrada** em cada FLW por lead.
- `FLW1`: delta do **último log antes do 1º FLW1** → `t1`
- `FLW2`: `t1 → t2`
- `FLW3`: `t2 → t3`
- Delta em **horas úteis** usando `businessHours`/`exclude_weekends`.
- Guardrails: `0 < diffHours < 720` (30 dias)
- SLA follow-up: `<= 24h`

#### 6.4 Tempo da Proposta (SLA 6h) — por etapa

Fonte:
- `loogsLeads` (t0)
- `imagemProposta` (t1)

Regra:
- **t0**: 1ª entrada do lead na etapa `a22c3ad3-...` **dentro do período do header**.
- **t1**: 1ª proposta do lead após t0 (`imagemProposta.created_at > t0`) — pode ocorrer depois do `end`.
- Delta: **horas úteis** (`businessMinutes(t0,t1)/60`).
- Guardrails: `t1 > t0` e `diffHours < 720`.
- SLA: `diffHours <= 6`.

Filtro por vendedor (quando `selectedSeller` setado):
1) `imagemProposta.id_vendedor` (se existir)
2) `loogsLeads.vendedor_id` do evento t0
3) `leads.vendedorResponsavel` (fallback)

#### 6.5 Ranking (Executivos)

Fonte dos dados:
- `fetchRankingData()` constrói um `sellerMap` e calcula métricas por vendedor.

Ordenação (dropdown):
- O `<select id="ranking-sort">` define a métrica para ordenar.
- **FRT e Ciclo**: ordenação **ascendente** (menor é melhor).
- Demais: ordenação **descendente** (maior é melhor).
- O sort usa o valor **atual do dropdown** como fonte de verdade (evita `state` dessincronizado).

---

### 7) Troubleshooting (mais comum)

#### 7.1 “businessHours não aplica”
- `businessHours` fora de `params` → não chega no widget.
- `params` duplicado no objeto do widget → a última definição sobrescreve a primeira.
- `start/end` inválidos (end <= start) → cai no fallback (09–19, seg–sex, SP).

#### 7.2 FRT zerado
- Pode ser **falta de dados** após o hardcut, ou o hardcut “empurrar” o início além do fim.

#### 7.3 Ranking “não muda”
- Muitas linhas podem estar com valores iguais/zero; visualmente parece não ordenar.\n+

---

### 8) Docs auxiliares (repo)

Se quiser aprofundar cada peça:
- `docs/horario_util_dinamico_params.md` (businessHours e exclude_weekends)
- `docs/frt_logica.md` (FRT detalhado)
- `docs/followup_horas_uteis.md` (Follow-up detalhado)
- `docs/tempo_proposta_filtro.md` (Tempo Proposta detalhado)

