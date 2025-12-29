## Dashboard `wish-board` — Regras, parâmetros (Bubble) e cálculos

Este documento descreve **como o widget `wish-board` funciona**, cobrindo:
- Controle de acesso (**líder vs vendedor comum**)
- Parâmetros/integração no Bubble (padrão: `params.loggedSellerId`)
- Fonte dos dados (tabelas/colunas) e **como cada métrica é calculada**

**Novidades v13:**
- Grid de KPIs ajustada para **8 colunas** em linha única (melhor aproveitamento horizontal).
- Adicionado KPI de **Conversão** (leads fechados / leads captados no período).

Fonte de verdade (código):
- `public/widgets/dashboard/form.js`
- `public/widgets/dashboard/form.html`
- `public/widgets/dashboard/form.css`

---

## Integração no Bubble (Header + containers)

### 1) Container(s) na página

Crie um HTML Element com:

```html
<div id="slot-wish-board"></div>
```

### 2) Header do Bubble (Page → HTML Header)

Passe o vendedor logado via `params.loggedSellerId`:

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

        // (Opcional) Corte de data para ignorar dados antigos
        // Regra: se applyCutoff=true e cutoffDate válido, aplica filtro estrito ">".
        applyCutoff: true,
        cutoffDate: "2025-01-01T00:00:00"
      }
    }
  ];
</script>

<script defer src="URL_DO_LOADER/script.js"></script>
```

### 3) Variáveis opcionais (fallbacks)

Se você não passar `params.loggedSellerId`, o widget tenta:
- `window.BUBBLE_LOGGED_SELLER_ID`
- `window.idVendedor`
- `window.loggedSellerId`
- fallback final: constante `LOGGED_SELLER_ID` (hardcoded no código)

---

## Corte de data (filtro global)

Motivação: o projeto vai para produção, mas o banco tem dados históricos que você não quer considerar nos gráficos.

Parâmetros:
- `params.applyCutoff` (boolean)
- `params.cutoffDate` (string ISO; pode vir sem timezone)

Semântica (confirmada):
- **Só aplica** quando `applyCutoff === true` **e** `cutoffDate` é válido.
- Filtro é **estrito**: **`>`** (não inclui o instante do corte).
- **Timezone**: interpretado como **local do navegador** (via `new Date(cutoffDate)`); o widget deriva:
  - `cutoffInstantIso` (para colunas timestamp)
  - `cutoffYmdLocal` (YYYY-MM-DD para colunas tipo date-string)

Campos onde o corte é aplicado (default mixed):
- `leads.created_at` (captação)
- `leads.dataFechamento` (fechamento)
- `agendamento.data` (YYYY-MM-DD)
- `imagemProposta.created_at`
- `loogsLeads.created_at`
- `vendedores`: **não** aplica (controle de acesso)

Observação:
- O corte é aplicado **além** do filtro de período (hoje/semana/mês/semestre/ano). Se o corte for mais recente que o início do período, ele “encurta” o range efetivo.

---

## Controle de acesso: líder vs vendedor comum

### Identificação do vendedor

O widget extrai um UUID do valor recebido (mesmo que o Bubble injete texto “sujo”) e valida no Supabase:
- Tabela: `vendedores`
- Campos consultados: `id, nome, diretorVendas, usuarioInterno`

### Regras aplicadas

- **Líder**: `diretorVendas = true`
  - `state.selectedSeller = null` (visão global por padrão)
  - carrega lista de executivos no dropdown: `vendedores.usuarioInterno = false`
  - pode escolher qualquer executivo no select (ou “Todos”)

- **Vendedor comum**: `diretorVendas = false`
  - trava a visão no próprio vendedor:
    - `state.selectedSeller = access.sellerId`
  - o dropdown é “controlado” para permitir só:
    - “Todos os executivos” (`value=""`)
    - “Meu executivo” (`value=access.sellerId`)
  - hard-guard: se tentar setar um UUID de outro vendedor, o código reverte para o próprio.

### O que deve ser enviado no Bubble

Para o controle funcionar, basta enviar o UUID do vendedor logado:
- `params.loggedSellerId = "<uuid do vendedor>"`.

Se não existir UUID válido após 8s de polling, o widget exibe **“Acesso negado”**.

---

## Filtros de data (range atual e período anterior)

Estado:
- `state.dateFilter` ∈ `{today, week, month, semester, year}`

Funções:
- `getDateRange(filter)`: retorna `{ start: ISO, end: ISO }`
- `getPreviousDateRange(filter)`: retorna o período imediatamente anterior para comparação

Observação importante:
- Algumas queries usam `created_at` (captação), outras usam `dataFechamento` (venda) e outras usam `agendamento.data` (data “YYYY-MM-DD”).

---

## Realtime (atualização automática)

O widget assina Supabase Realtime e faz refresh debounced (1s) quando há mudanças em:
- `agendamento` → `fetchMeetings()` + `fetchRankingData()`
- `imagemProposta` → `fetchMeetings()` + `fetchRankingData()`
- `leads` → `fetchRevenue()` (e outros conforme flags) + `fetchMeetings()` + `fetchRankingData()`
- `loogsLeads` → `fetchMeetings()` + `fetchRankingData()`

O badge “Atualizado agora / há X min” é derivado de `lastUpdatedAt`.

---

## Resumo: métricas → fonte → filtros → fórmula

| Bloco | Métrica | Fonte | Filtro por vendedor | Filtro por data | Como calcula |
|---|---|---|---|---|---|
| KPIs | Faturamento | `leads.valorFechado` | `leads.vendedorResponsavel = selectedSeller` | `dataFechamento` no range | soma de `valorFechado` (parseCurrency) |
| KPIs | Vendas realizadas | `leads` | idem | `dataFechamento` | quantidade de leads com `valorFechado != null` |
| KPIs | Ticket médio | `leads` | idem | `dataFechamento` | \(ticket = receita / vendas\) |
| KPIs | Leads ativos | `leads` | idem | `created_at` | count de `lead_id` com `vendedorResponsavel != null` |
| KPIs | Investimento Mkt | estado | n/a | n/a | `state.marketingInvestment` (editável via `updateMarketingInvestment`) |
| KPIs | CAC | estado + leads | idem | `dataFechamento` | \(CAC = investimento / vendas\) |
| KPIs | ROAS | estado + leads | idem | `dataFechamento` | \(ROAS = receita / investimento\) |
| KPIs | **Conversão** | `leads` | idem | range do filtro | \(fechados / captados * 100\) |
| Velocímetro | % meta mês | `leads` + constante | idem | **sempre month** | \(min(receitaMes/meta, 1)\) |
| Reuniões | Agora | `agendamento` | `agendamento.vendedor = selectedSeller` | `data = hoje` | conta registros com `hora` na hora atual e `statusReuniao='agendado'` |
| Reuniões | Hoje/Semana/Mês | `agendamento` | idem | `data` por range | count (`statusReuniao='agendado'`) |
| SLAs | FRT | `loogsLeads` + `leads` | via `leads.vendedorResponsavel` | **ignora filtro de data** | média (minutos) entre `leads.created_at` e log “Novo Lead →” |
| SLAs | Ciclo venda | `leads` | idem | ignora filtro de data | média dias entre `created_at` e `dataFechamento` |
| SLAs | Tempo proposta | `imagemProposta` + `leads` | idem | ignora filtro de data | média horas entre `leads.created_at` e `imagemProposta.created_at` |
| SLAs | Follow-up | `leads` | idem | ignora filtro de data | média horas entre timestamps follow_up_* |
| Ranking | Score | `agendamento.score_final` | `agendamento.vendedor` | `agendamento.data` por range | média por vendedor (scoreSum/scoreCount) e ordena desc |
| Ranking | Propostas | `imagemProposta.id_vendedor` (fallback via leads) | aplicado | `imagemProposta.created_at` por range | count por vendedor |
| Ranking | Vendas (R$) | `leads.valorFechado` | `leads.vendedorResponsavel` | `dataFechamento` por range | soma por vendedor |
| Funil | Leads captados | `leads` | `vendedorResponsavel` | `created_at` por range | count |
| Funil | Leads qualificados | `leads.classificacao` | idem | `created_at` | count onde `classificacao != 'Frio' OR null` |
| Funil | Propostas | `imagemProposta` (com filtro por vendedor via leads) | aplicado | `created_at` | count |
| Funil | Reuniões | `agendamento` | `agendamento.vendedor` | `data` por range | count |
| Funil | Vendas | `leads` | `vendedorResponsavel` | `dataFechamento` | count de `valorFechado != null` |
| Conversões | Lead/Proposta/Reunião | `leads`, `agendamento`, `imagemProposta` | aplicado | range do filtro | ver seção “Taxas de Conversão” (denominador = leads fechados) |
| Canal | Landing vs WhatsApp | `leads.leadLandingPage` | `vendedorResponsavel` | `created_at` / `dataFechamento` | leads (count), vendas (len), receita (soma), ROI e conv% |

---

## KPIs + Receita (Evolução do faturamento)

Fonte: `fetchRevenue()`.

### Receita e vendas

- Query atual (período selecionado):
  - `leads.select('valorFechado, dataFechamento')`
  - `not('valorFechado', 'is', null)`
  - `gte('dataFechamento', start)` e `lte('dataFechamento', end)`
  - filtro opcional: `eq('vendedorResponsavel', state.selectedSeller)`
- `currentSales = dataCurr.length`
- `currentRevenue = sum(parseCurrency(valorFechado))`

Período anterior (comparativo):
- mesma query, com `prevRange = getPreviousDateRange(state.dateFilter)`
- `prevSales`, `prevRevenue` análogos

### Ticket médio

- `ticketAtual = currentRevenue / currentSales` (se sales > 0)
- `ticketAnterior = prevRevenue / prevSales`

### Leads ativos

O KPI “Leads Ativos” é contado por `created_at` (captação), não por fechamento:
- Query atual:
  - `leads.select('lead_id', { count:'exact', head:true })`
  - `not('vendedorResponsavel', 'is', null)`
  - `gte('created_at', start)` e `lte('created_at', end)`
- `countLeadsPrev` usa `prevRange`

### Investimento, CAC e ROAS

- `investment = state.marketingInvestment` (default 120000)
- `CAC = investment / currentSales` (se sales > 0)
- `ROAS = currentRevenue / investment` (se investment > 0)

### Variação percentual (vs período anterior)

Para KPI com `prevValue`:
- `variationPct = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0)`

### Chart de receita (acumulado + meta)

Função: `processRevenueData(leads, startDate, endDate)`

- Se o range tiver mais de 40 dias (`isYearly=true`), agrega por mês (`YYYY-MM`); senão por dia (`YYYY-MM-DD`).
- Soma valores por bucket, depois transforma em série **acumulada**.
- Meta:
  - meta base mensal: `TARGET_REVENUE_MONTHLY = 2_100_000`
  - se `isYearly`, meta total = mensal * 12
  - meta “linear”: `stepGoal = metaTotal / steps` e acumula igual a receita.

---

## Velocímetro do mês (sempre mensal)

Regra explicitada no código:
- O velocímetro **não respeita** `state.dateFilter`; ele sempre calcula **mês atual** vs `TARGET_REVENUE_MONTHLY`.
- Ele respeita `state.selectedSeller` (líder vs vendedor / vendedor escolhido).

Como calcula:
- `gaugeCurrentRevenue`: receita do mês atual (sum valorFechado)
- `gaugePrevRevenue`: receita do mês anterior
- `gaugePct = min((gaugeCurrentRevenue / targetRevenue) * 100, 100)`
- `missing = max(targetRevenue - gaugeCurrentRevenue, 0)`
- Trend vs mês anterior:
  - `trendVariation = ((currentRevenue - prevRevenue) / prevRevenue) * 100` (com fallback quando prev=0)

---

## Reuniões (agendamento)

Fonte: `fetchMeetings()`.

Tabela: `agendamento`

Filtro base:
- `statusReuniao = 'agendado'`
- opcional: `vendedor = state.selectedSeller`

Campos de data:
- `data` é usado como string `YYYY-MM-DD`
- `hora` é usada como string `HH:mm` (o código compara só a hora)

Métricas:
- **Hoje**: `data = todayStr`
- **Semana**: `data` entre início/fim da semana (segunda → domingo)
- **Mês**: `data` entre início/fim do mês
- **Agora**: reuniões de hoje com `hora` na mesma hora do relógio (`now.getHours()`).

---

## SLAs (absolutos — ignoram filtro de data)

Fonte: `fetchSLAs()`.

Observação:
- O código diz “SLAs are absolute, ignoring date filters” e **não aplica `getDateRange`**.
- Ele **aplica filtro de vendedor** (`state.selectedSeller`) em queries com `leads.vendedorResponsavel`.

### 1) FRT Pré-vendas (min)

Tabelas:
- `loogsLeads` (logs)
- `leads` (created_at do lead)

Passos:
1) Busca logs com `descrição ilike '%Novo Lead%'`.
2) Filtra logs de saída “Novo Lead →” ou “Novo Lead ->”.
3) Busca leads desses IDs para obter `created_at` e `vendedorResponsavel`.
4) Para cada lead, calcula:
   - `diffMinutes = (log.created_at - lead.created_at) / 60_000`
   - considera apenas 0 < diff < 43200 (30 dias) para evitar outliers
5) `avgFRT = round(totalMinutes / count)`

### 2) Ciclo de venda (dias)

Tabela: `leads`
- exige `dataFechamento != null`
- calcula:
  - `diffDays = (dataFechamento - created_at) / (1000*60*60*24)`
- `avgCiclo = (sumDays / count).toFixed(1)`

### 3) Tempo proposta (horas)

Tabelas:
- `imagemProposta` (created_at, id_lead)
- `leads` (created_at)

Passos:
1) Busca propostas.
2) Busca leads correspondentes.
3) `diffHours = (proposta.created_at - lead.created_at) / 3600000`
4) filtra 0 < diff < 720 (30 dias)
5) `avgProp = round(sumHours / count)`

### 4) Follow-up (horas)

Tabela: `leads`
Campos usados:
- `follow_up_1_enviado_em`
- `follow_up_2_enviado_em`
- `follow_up_3_enviado_em`

Para cada tipo, calcula diferença em horas entre o timestamp atual e o anterior (ou `created_at` no primeiro), soma e tira média.

### Status visual (on-track / at-risk / breached)

Thresholds fixos (meta):
- FRT: 20min
- Ciclo: 5d
- Proposta: 6h
- Follow-up: 24h

Regra:
- se `val > meta`: `at-risk` até `2x meta`, senão `breached`.

---

## Ranking de executivos

Fonte: `fetchRankingData()`.

Filtro de data:
- range via `getDateRange(state.dateFilter)`
- agendamento usa `start/end` convertidos para `YYYY-MM-DD`

Filtro de vendedor:
- se `state.selectedSeller`, filtra para o vendedor (ou o próprio, se vendedor comum).

Tabelas e métricas:

1) **Base de vendedores**
- `vendedores.select('id, nome').eq('usuarioInterno', false)`

2) **Reuniões + score**
- `agendamento.select('vendedor, score_final').gte('data', start).lte('data', end)`
- Para cada registro:
  - `meetings++`
  - se `score_final`: soma em `scoreSum` e incrementa `scoreCount`
- `avgScore = (scoreSum / scoreCount).toFixed(1)` (se count > 0)

3) **Propostas**
- fonte principal: `imagemProposta.select('id_lead, id_vendedor').gte('created_at', start).lte('created_at', end)`
- regra:
  - se `id_vendedor` existe: conta direto por vendedor
  - se `id_vendedor` é nulo: usa fallback `leads.vendedorResponsavel` via `lead_id`

4) **Vendas (R$) + ciclo médio**
- `leads.select('vendedorResponsavel, valorFechado, created_at, dataFechamento')`
- `not('valorFechado','is',null)` e `dataFechamento` no range
- soma valorFechado por vendedor (`sales`)
- ciclo por vendedor:
  - `diffDays = dataFechamento - created_at` e média (`avgCycle`)

5) **FRT por vendedor**
- Similar ao SLA, mas filtrado pelo range de data (logs dentro do range)

Ordenação final:
- ordena por `avgScore` desc (quando `avgScore='-'`, trata como 0).

---

## Funil (Leads captados → Vendas)

Fonte: `fetchFunnelData()`.

Range: `getDateRange(state.dateFilter)`

Etapas:
1) Leads Captados
   - `leads.created_at` no range, count
2) Leads Qualificados
   - mesmo range, e:
   - `.or('classificacao.neq.Frio,classificacao.is.null')`
3) Propostas
   - sem filtro de vendedor: count direto em `imagemProposta` no range
   - com filtro: busca `imagemProposta` no range → filtra via `leads.vendedorResponsavel`
4) Reuniões
   - `agendamento.data` no range
5) Vendas
   - `leads.valorFechado != null` e `dataFechamento` no range

Conversão:
- por etapa vs anterior: \(c = round(v_atual / v_anterior * 100)\)
- conversão global vs total: `gc` (calculado, mas o badge mostra `c` no render atual)

---

## Taxas de conversão (Lead / Proposta / Reunião)

Fonte: `fetchConversionRates()`.

Denominador comum:
- `leadsClosedTotal` = count de `leads` com `valorFechado != null` no range (`dataFechamento`), com filtro de vendedor opcional.

Taxas:
- **taxaLead**:
  - `leadsClosedWithVendor / leadsClosedTotal * 100`
  - onde `leadsClosedWithVendor` exige `vendedorResponsavel != null`
- **taxaProposta** (nome atual no código):
  - `countMeetings / leadsClosedTotal * 100`
  - `countMeetings` vem de `agendamento` no range
- **taxaReuniao** (nome atual no código):
  - `countProposals / leadsClosedTotal * 100`
  - `countProposals` vem de `imagemProposta` no range (com filtro por vendedor via leads quando necessário)

⚠️ Observação: os nomes (“Proposta” e “Reunião”) aqui estão **invertidos em relação ao funil tradicional** (porque “taxaProposta” usa reuniões e “taxaReuniao” usa propostas). A doc mantém o que está no código.

---

## Performance por canal (Landing Page vs WhatsApp)

Fonte: `fetchChannelData()`.

Definição de canal:
- Landing Page: `leads.leadLandingPage = true`
- WhatsApp: `leads.leadLandingPage = false` (simplificação atual)

Métricas por canal (no range):
- Leads: count por `created_at`
- Vendas (qtd): quantidade de leads com `valorFechado != null` (usa query que retorna linhas e conta o array)
- Receita: soma `valorFechado` (parseCurrency) para leads fechados no range (`dataFechamento`)

Conversão por canal:
- `conv% = (sales / leads) * 100` (formatado com 1 decimal)

ROI:
- `ROI% = ((receita - investimento) / investimento) * 100`
- investimento vem de:
  - `state.channelInvestments.landing`
  - `state.channelInvestments.whatsapp`
- Atualização via:
  - `window.updateChannelInvestment(channel, value)`

Outbound e Social:
- atualmente mocks (valores fixos), marcados como `active: false`.

---

## Observações e limitações atuais

- `valorFechado` é tratado como texto e convertido via `parseCurrency()` (suporta BR e US).
- Métricas e nomes refletem o código atual; podemos renomear e/ou ajustar denominadores se você quiser alinhamento de negócio.
- Algumas seções (Pipeline “Tempos por etapa”) estão mockadas no front (`renderPipeline()`), ainda sem dados reais por vendedor/etapa.
