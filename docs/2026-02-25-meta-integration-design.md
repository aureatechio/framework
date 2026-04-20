# Meta Ads Integration - Documentacao Tecnica

> **Projeto:** Lirica Aurea
> **Data:** 2026-02-25
> **Publico-alvo:** Desenvolvedores internos
> **Stack:** React + TypeScript + TanStack Query v5 + Supabase + Meta Graph API v20.0

---

## Sumario

1. [Visao Geral](#1-visao-geral)
2. [Arquitetura](#2-arquitetura)
3. [Configuracao](#3-configuracao)
4. [Seguranca](#4-seguranca)
5. [API Client - meta.ts](#5-api-client---metats)
6. [Hooks](#6-hooks)
7. [Componentes UI](#7-componentes-ui)
8. [Fluxo de Dados](#8-fluxo-de-dados)
9. [Calculos de KPIs](#9-calculos-de-kpis)
10. [State Management e Cache](#10-state-management-e-cache)
11. [Tratamento de Erros](#11-tratamento-de-erros)
12. [Feature Flags](#12-feature-flags)
13. [Referencia de Arquivos](#13-referencia-de-arquivos)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Visao Geral

A integracao com a Meta permite que a plataforma Lirica Aurea consuma dados de campanhas, ad sets e anuncios do Meta Ads (Facebook/Instagram) e os combine com dados de CRM armazenados no Supabase, gerando um funil completo de marketing e vendas.

### O que a integracao faz

- Busca metricas de campanhas diretamente da Meta Graph API (spend, clicks, impressions, leads)
- Combina com dados de CRM do Supabase (oportunidades, reunioes, propostas, vendas)
- Calcula KPIs derivados (CPM, CTR, CPC, CPL, ROAS, CAC, etc.)
- Exibe dashboards comparativos, consolidados e calendarios
- Suporta real-time updates via Supabase Realtime

### Stack da integracao

| Camada | Tecnologia | Proposito |
|--------|-----------|-----------|
| API Client | `fetch` + Meta Graph API v20.0 | Chamadas diretas a API da Meta |
| State | TanStack Query v5 | Cache, refetch, invalidacao |
| CRM | Supabase (Postgres + RPC + Realtime) | Dados de leads, vendas, oportunidades |
| UI | React + Tailwind + shadcn/ui | Dashboards, tabelas, KPI cards |
| Types | TypeScript | Tipagem end-to-end |

---

## 2. Arquitetura

### Diagrama de Camadas

```
+-----------------------------------------------------------+
|                    CAMADA DE APRESENTACAO                  |
|  MetaAdsVisaoCalendario | AureaCloud | Dashboard          |
|  (React Components + shadcn/ui)                           |
+-----------------------------+-----------------------------+
                              |
+-----------------------------v-----------------------------+
|                    CAMADA DE HOOKS                         |
|  useMetaAdsCalendario     - Visao calendario              |
|  useAureaCloudMetrics     - Funil completo                |
|  useTimelineFilteredCampaignIds - Match campanhas         |
|  useAureaCloudRealtime    - Subscricoes realtime          |
|  useDashboardMetas        - Metas do dashboard            |
|  useDashboardMetrics      - Metricas do dashboard         |
|  (TanStack Query wrappers)                                |
+--------------+----------------------------+---------------+
               |                            |
+--------------v--------------+  +----------v--------------+
|      META GRAPH API         |  |    SUPABASE BACKEND     |
|  src/lib/meta.ts            |  |  src/lib/supabase.ts    |
|                             |  |                         |
|  fetchMetaSpendAndLPViews() |  |  RPC: get_aurea_cloud_  |
|  fetchMetaAdSetInsights()   |  |        metrics_fast()   |
|  fetchMetaCampaignInsights()|  |  RPC: get_aurea_cloud_  |
|  fetchMetaCampaigns()       |  |        metrics()        |
|  fetchAllPages()            |  |  RPC: get_hot_          |
|  sanitizeEnvValue()         |  |        opportunities()  |
|  normalizeIds()             |  |  Realtime subscriptions |
|  sumResultsFromActions()    |  |  Direct table queries   |
+--------------+--------------+  +----------+--------------+
               |                            |
+--------------v--------------+  +----------v--------------+
|   Meta Graph API v20.0      |  |  Supabase Postgres      |
|   graph.facebook.com        |  |  leads, compras,        |
|   /insights, /campaigns     |  |  agendamento,           |
|                             |  |  imagemProposta,        |
|                             |  |  timeline_campanhas     |
+-----------------------------+  +-------------------------+
```

### Principio de Design

A integracao segue o padrao **"Direct API + CRM Merge"**:

1. Dados de midia paga vem diretamente da Meta API (sem cache intermediario)
2. Dados de CRM vem do Supabase (via RPC otimizado ou queries diretas como fallback)
3. Os hooks fazem o merge e calculam metricas derivadas
4. TanStack Query gerencia cache e invalidacao no client-side

---

## 3. Configuracao

### Variaveis de Ambiente

```bash
# === OBRIGATORIAS para integracao Meta ===
VITE_META_ACCESS_TOKEN=<token_do_sistema_meta_business_manager>
VITE_META_AD_ACCOUNT_ID=<act_xxxxxxxx ou apenas xxxxxxxx>

# === OBRIGATORIAS para CRM ===
VITE_SUPABASE_URL=<url_do_projeto_supabase>
VITE_SUPABASE_ANON_KEY=<anon_key_do_supabase>

# === OPCIONAIS ===
VITE_AUREA_CLOUD_REALTIME_ENABLED=true  # Default: false
```

### Setup do Meta Business Manager

1. Acessar [Meta Business Manager](https://business.facebook.com/settings)
2. Ir em **System Users** > Criar ou selecionar um system user
3. Gerar um **token de acesso** com as permissoes:
   - `ads_read`
   - `ads_management` (se precisar de escrita futura)
   - `read_insights`
4. Copiar o **Ad Account ID** de Ads Manager > Settings
5. Inserir ambos no `.env`

### Setup do Supabase

**Tabelas necessarias:**

| Tabela | Proposito |
|--------|-----------|
| `leads` | Leads do CRM (canalentrada, data_oportunidade, novo_crm) |
| `compras` | Vendas realizadas (valor_total, lead_id) |
| `agendamento` | Reunioes agendadas/realizadas (statusReuniao) |
| `imagemProposta` | Propostas enviadas (id_lead) |
| `timeline_campanhas` | Campanhas internas para match com Meta |
| `dashboard_metas` | Metas mensais de faturamento/investimento |
| `funil_metricas` | Metricas consolidadas do funil |

**RPCs necessarias:**

| Funcao RPC | Proposito |
|------------|-----------|
| `get_aurea_cloud_metrics_fast()` | Metricas CRM otimizadas com counters |
| `get_aurea_cloud_metrics()` | Versao legacy (fallback) |
| `get_hot_opportunities()` | Oportunidades quentes ativas |
| `get_dashboard_metrics()` | Metricas gerais do dashboard |
| `get_dashboard_faturamento_mensal()` | Faturamento por mes |

**Realtime (opcional):**

Habilitar Realtime nas tabelas: `meta_insights_cache`, `compras`, `leads`, `agendamento`, `imagemProposta`

---

## 4. Seguranca

### Tokens de Acesso da Meta

| Aspecto | Detalhes |
|---------|---------|
| **Tipo de token** | System User Token (Meta Business Manager) |
| **Expiracao** | ~60 dias (deve ser renovado manualmente) |
| **Armazenamento** | Variavel de ambiente `VITE_META_ACCESS_TOKEN` no `.env` |
| **Exposicao** | Token e exposto no client-side (prefixo `VITE_`) |

### Riscos e Mitigacoes

#### Risco 1: Token exposto no client-side

O token Meta esta em uma variavel `VITE_*`, o que significa que e incluida no bundle do frontend e visivel no browser.

**Mitigacao atual:** O token possui apenas permissao de leitura (`ads_read`, `read_insights`). Nao pode modificar campanhas.

**Mitigacao recomendada (futura):**
- Mover chamadas Meta para uma Supabase Edge Function ou API server-side
- O frontend chamaria a Edge Function, que faria a chamada a Meta com o token seguro
- Exemplo: `supabase.functions.invoke('meta-insights', { body: { dateRange, campaignIds } })`

#### Risco 2: Token expirado

Tokens de system user expiram em ~60 dias. Se expirar, o dashboard mostra `R$ 0,00`.

**Mitigacao atual:**
- Tratamento de erro 190 (token invalido) com log no console
- Componentes exibem banner de alerta quando configuracao esta ausente

**Mitigacao recomendada (futura):**
- Implementar alerta automatico quando token esta proximo de expirar
- Usar Long-Lived Token ou renovacao automatica via API

#### Risco 3: Sanitizacao de input

**Mitigacao atual (implementada):**
- `sanitizeEnvValue()` remove aspas, prefixo "Bearer", whitespace e ponto-e-virgulas
- `normalizeIds()` deduplica e valida IDs de campanhas
- Campaign IDs sao passados via query parameter (nao concatenados na URL)

#### Risco 4: Supabase Anon Key

A `VITE_SUPABASE_ANON_KEY` tambem e exposta no client-side.

**Mitigacao atual:**
- Row Level Security (RLS) habilitado nas tabelas
- Anon key so permite leitura conforme as policies definidas

### Boas Praticas para Desenvolvedores

1. **NUNCA** commitar o `.env` no repositorio (esta no `.gitignore`)
2. **NUNCA** logar tokens em producao (usar `console.warn` sem incluir o token)
3. Ao renovar o token, testar em staging antes de atualizar producao
4. Manter permissoes do token no minimo necessario (read-only)
5. Revisar RLS policies do Supabase periodicamente

---

## 5. API Client - meta.ts

**Arquivo:** `src/lib/meta.ts` (~280 linhas)

Este e o modulo mais baixo nivel da integracao. Faz chamadas HTTP diretas a Meta Graph API.

### 5.1 Funcoes Utilitarias

#### `sanitizeEnvValue(val: string): string`

Limpa valores de variaveis de ambiente que podem conter formatacao incorreta:

```typescript
// Remove:
// - Aspas simples e duplas ao redor
// - Prefixo "Bearer "
// - Whitespace nas extremidades
// - Ponto-e-virgula no final
```

#### `normalizeIds(ids: string[]): string[]`

Deduplica e filtra IDs vazios de uma lista de IDs de campanhas.

#### `sumResultsFromActions(actions: MetaAction[]): number`

Extrai o total de conversoes `complete_registration` do array `actions` retornado pela Meta API:

```typescript
// Meta retorna:
// actions: [{ action_type: "complete_registration", value: "42" }, ...]
// Esta funcao extrai e soma os valores de "complete_registration"
```

#### `fetchAllPages<T>(url: string): Promise<T[]>`

Lida com a paginacao da Meta API. Segue o cursor `paging.next` ate nao haver mais paginas.

### 5.2 Funcoes Principais

#### `fetchMetaSpendAndLandingPageViews(campaignIds, since, until)`

**Proposito:** Buscar spend, clicks e resultados (conversoes) no nivel de campanha.

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `campaignIds` | `string[]` | IDs das campanhas Meta |
| `since` | `string` | Data inicio (YYYY-MM-DD) |
| `until` | `string` | Data fim (YYYY-MM-DD) |

**Retorno:** `MetaInsightsResult`

```typescript
type MetaInsightsResult = {
  spend: number    // Total gasto em R$
  clicks: number   // Total de cliques
  results: number  // Total de complete_registration
}
```

**Endpoint:** `GET /v20.0/{adAccountId}/insights`

**Query params:**
- `level=campaign`
- `fields=spend,clicks,actions`
- `time_increment=1` (breakdown diario)
- `filtering=[{field: "campaign.id", operator: "IN", value: campaignIds}]`
- `limit=500`

---

#### `fetchMetaAdSetInsights(campaignIds, since, until)`

**Proposito:** Buscar metricas diarias no nivel de ad set.

**Retorno:** `MetaAdSetDailyRow[]`

```typescript
type MetaAdSetDailyRow = {
  date: string            // YYYY-MM-DD
  adSetId: string
  adSetName: string
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  landingPageViews: number  // actions[landing_page_view]
  leads: number             // actions[complete_registration]
}
```

**Endpoint:** `GET /v20.0/{adAccountId}/insights`

**Query params:**
- `level=adset`
- `fields=adset_id,adset_name,campaign_id,spend,impressions,clicks,actions`
- `time_increment=1`

---

#### `fetchMetaCampaignInsights(campaignIds, since, until)`

**Proposito:** Buscar metricas diarias no nivel de campanha.

**Retorno:** `MetaCampaignDailyRow[]`

```typescript
type MetaCampaignDailyRow = {
  date: string
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  landingPageViews: number
  leads: number
}
```

**Endpoint:** `GET /v20.0/{adAccountId}/insights`

**Query params:**
- `level=campaign`
- `fields=campaign_id,campaign_name,spend,impressions,clicks,actions`
- `time_increment=1`

---

#### `fetchMetaCampaigns()`

**Proposito:** Listar todas as campanhas da conta de anuncios.

**Retorno:** `MetaCampaign[]`

```typescript
type MetaCampaign = {
  id: string
  name: string
  status: string  // effective_status
}
```

**Endpoint:** `GET /v20.0/{adAccountId}/campaigns`

**Query params:**
- `fields=id,name,effective_status`
- `limit=500`

---

## 6. Hooks

### 6.1 useMetaAdsCalendario

**Arquivo:** `src/hooks/useMetaAdsCalendario.ts` (~410 linhas)

**Proposito:** Hook principal da visao "Calendario" do Meta Ads. Combina dados Meta + CRM e calcula 17 KPIs.

**Input:**

```typescript
{
  dateRange: { from: Date, to: Date }
  campaignIds?: string[]  // Filtragem opcional
}
```

**Output:**

```typescript
type UseMetaAdsCalendarioResult = {
  kpis: KpiMetric[]              // 17 KPI cards
  tableRows: MetaAdsTableRow[]   // Agregado por campanha
  dailyRows: MetaAdsDailyTableRow[] // Breakdown diario
  campaignOptions: CampaignOption[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  isEmpty: boolean
  isConfigured: boolean          // Env vars presentes?
}
```

**Fluxo interno:**

1. Constroi periodo atual e periodo anterior (mesmo tamanho)
2. Dispara `Promise.all` com 4 chamadas paralelas:
   - `fetchMetaCampaignInsights(current)`
   - `fetchMetaCampaignInsights(previous)`
   - `fetchCrmForPeriod(current)` (via Supabase)
   - `fetchCrmForPeriod(previous)` (via Supabase)
3. Agrega resultados por campanha
4. Calcula KPIs com variacao percentual vs. periodo anterior
5. Retorna dados formatados para o componente

**KPIs calculados (17 total):**

| # | KPI | Fonte | Formula |
|---|-----|-------|---------|
| 1 | Investimento | Meta | `sum(spend)` |
| 2 | Impressoes | Meta | `sum(impressions)` |
| 3 | CPM | Calculado | `spend / (impressions / 1000)` |
| 4 | Cliques | Meta | `sum(clicks)` |
| 5 | CTR | Calculado | `(clicks / impressions) * 100` |
| 6 | CPC | Calculado | `spend / clicks` |
| 7 | Resultados (Leads) | Meta | `sum(complete_registration)` |
| 8 | CPL / CPR | Calculado | `spend / leads` |
| 9 | Oportunidades | CRM | Leads com `data_oportunidade` |
| 10 | CPO | Calculado | `spend / oportunidades` |
| 11 | Tx. Oportunidade | Calculado | `oportunidades / leads` |
| 12 | Vendas (qtd) | CRM | `count(compras)` |
| 13 | Vendas (valor) | CRM | `sum(compras.valor_total)` |
| 14 | Tx. Conversao | Calculado | `vendas / leads` |
| 15 | ROAS | Calculado | `vendas_valor / spend` |
| 16 | CAC | Calculado | `spend / vendas_qtd` |
| 17 | Tempo Medio | CRM | Media de dias entre lead e venda |

---

### 6.2 useAureaCloudMetrics

**Arquivo:** `src/hooks/useAureaCloudMetrics.ts` (~723 linhas)

**Proposito:** Hook mais completo. Gera o funil de 7 niveis com comparacao multi-periodo.

**Input (opcional):**

```typescript
{
  dateRange?: { from: string, to: string }  // Custom range
  campaignIds?: string[]
}
```

**Periodos calculados automaticamente:**

| Periodo | Inicio | Fim |
|---------|--------|-----|
| `hoje` | 00:00 hoje | 00:00 amanha |
| `ontem` | 00:00 ontem | 00:00 hoje |
| `anteontem` | 00:00 anteontem | 00:00 ontem |
| `mes` | 01 do mes atual | hoje |
| `mesAnterior` | 01 do mes anterior | ultimo dia do mes anterior |

**Funil de 7 niveis:**

```
INVESTIMENTO (Meta: spend)
     |
     v
CLIQUES (Meta: clicks)
     |
     v
RESULTADOS (Meta: complete_registration)
     |
     v
OPORTUNIDADES (CRM: leads com data_oportunidade)
     |
     v
REUNIOES REALIZADAS (CRM: agendamentos com statusReuniao = "realizada")
     |
     v
PROPOSTAS (CRM: imagemProposta)
     |
     v
VENDAS (CRM: compras)
```

**Estrategia de fallback para dados CRM:**

```
1. Tenta: get_aurea_cloud_metrics_fast() (RPC otimizado)
      |
      v (falha?)
2. Tenta: get_aurea_cloud_metrics() (RPC legacy)
      |
      v (falha?)
3. Tenta: Queries diretas nas tabelas (leads, compras, etc.)
```

**Output:**

```typescript
type UseAureaCloudMetricsResult = {
  funil: FunilMetric[]              // Metricas do funil por periodo
  vertical: FunilConsolidadoStep[]  // Funil visual consolidado
  footer: FooterMetric[]            // KPIs do rodape
  hotOpportunities: HotOpportunity[]
  isLoading: boolean
  error: Error | null
}
```

---

### 6.3 useTimelineFilteredCampaignIds

**Arquivo:** `src/hooks/useTimelineFilteredCampaignIds.ts` (~48 linhas)

**Proposito:** Fazer o match entre campanhas internas (timeline_campanhas no Supabase) e campanhas na Meta.

**Logica de match:**

```
Timeline: nome_campanha = "[midia paga] Acelerai"
Meta:     campaign_name = "[midia paga] Acelerai - Conversao"

Match: Meta campaign name .includes(timeline campaign name)
```

**Output:** `string[]` - IDs das campanhas Meta que correspondem as campanhas da timeline.

---

### 6.4 useAureaCloudRealtime

**Arquivo:** `src/hooks/useAureaCloudRealtime.ts` (~200 linhas)

**Proposito:** Subscrever a mudancas em tabelas do Supabase via Realtime e invalidar o cache do TanStack Query.

**Tabelas monitoradas:**

| Tabela | Invalidacao |
|--------|------------|
| `meta_insights_cache` | Imediata |
| `compras` | Debounced 5s |
| `leads` | Debounced 5s |
| `agendamento` | Debounced 5s |
| `imagemProposta` | Debounced 5s |

**Output:**

```typescript
{
  status: "connecting" | "connected" | "disconnected" | "error"
  lastUpdate: Date | null
  isRecentlyUpdated: boolean  // true por 10s apos update
  reconnect: () => void
}
```

**Nota:** So ativo quando `VITE_AUREA_CLOUD_REALTIME_ENABLED=true`.

---

### 6.5 useDashboardMetas

**Arquivo:** `src/hooks/useDashboardMetas.ts`

**Proposito:** Buscar metas mensais de faturamento e investimento por nucleo.

### 6.6 useDashboardMetrics

**Arquivo:** `src/hooks/useDashboardMetrics.ts`

**Proposito:** Buscar metricas consolidadas do dashboard principal.

---

## 7. Componentes UI

### 7.1 MetaAdsVisaoCalendario

**Arquivo:** `src/components/MetaAdsVisaoCalendario.tsx` (~525 linhas)

**Proposito:** Dashboard de calendario do Meta Ads.

**Estrutura do componente:**

```
MetaAdsVisaoCalendario
|
+-- [Verificacao de configuracao]
|   Se !isConfigured -> Exibe alerta com instrucoes
|
+-- [Filtros]
|   +-- DateRangePicker (presets + custom)
|   +-- Campaign MultiSelect Dropdown
|
+-- [KPI Cards Grid]
|   +-- 17 cards em grid responsivo
|   +-- Cada card: label, valor formatado, variacao %, badge "Meta"
|   +-- Cores: verde (positivo), vermelho (negativo), cinza (neutro)
|
+-- [Tabela: Performance por Campanha]
|   +-- Colunas: Campanha, Investimento, Impressoes, CPM, Cliques, CTR, CPC, Leads, CPL
|   +-- Linha de total no rodape
|   +-- Se campanhas filtradas: metricas CRM mostram "-"
|
+-- [Tabela: Detalhamento Diario]
    +-- Mesmas colunas + Data
    +-- Ordenado por data (mais recente primeiro)
```

**Comportamento com filtros:**

Quando o usuario filtra por campanhas especificas, as metricas de CRM (oportunidades, vendas, etc.) mostram "-" porque os dados de CRM nao podem ser filtrados por campanha Meta (nao ha match direto lead <-> campanha).

### 7.2 AureaCloud (pagina)

**Arquivo:** `src/pages/AureaCloud.tsx` (~800+ linhas)

**Tabs disponiveis:**

| Tab | Descricao | Hook utilizado |
|-----|-----------|---------------|
| Comparativo | Comparacao dia-a-dia (hoje vs ontem) | `useAureaCloudMetrics` |
| Consolidado | Funil semanal/mensal | `useAureaCloudMetrics` |
| Calendario | Visao calendario Meta Ads | `useMetaAdsCalendario` (via componente) |
| Timeline Campanhas | Gestao de campanhas internas | `useTimelineCampanhas` |
| UTM Tracker | Performance por UTM | `useUtmTrackerMetrics` |

### 7.3 Dashboard (pagina)

**Arquivo:** `src/pages/Dashboard.tsx`

Consome dados de metas e metricas via `useDashboardMetas` e `useDashboardMetrics`.

---

## 8. Fluxo de Dados

### 8.1 Fluxo: Visao Calendario

```
[Usuario seleciona dateRange + campanhas]
                |
                v
[MetaAdsVisaoCalendario component]
                |
                v
[useMetaAdsCalendario(dateRange, campaignIds)]
                |
    +-----------+-----------+
    |                       |
    v                       v
[Meta Graph API]      [Supabase CRM]
    |                       |
    v                       v
Promise.all([           Promise.all([
  campaignInsights(cur),   crmData(current),
  campaignInsights(prev)   crmData(previous)
])                      ])
    |                       |
    +-----------+-----------+
                |
                v
    [Agregacao por campanha]
                |
                v
    [Calculo de 17 KPIs]
                |
                v
    [Retorno: { kpis, tableRows, dailyRows }]
                |
                v
    [Renderizacao: Cards + Tabelas]
```

### 8.2 Fluxo: Funil Aurea Cloud

```
[AureaCloud page carrega]
          |
          v
[useAureaCloudMetrics(opts?)]
          |
          v
[Constroi 5 periodos: hoje, ontem, anteontem, mes, mesAnterior]
          |
    +-----+-----+
    |             |
    v             v
[Meta API]   [Supabase RPC]
    |             |
    |     +-------+-------+--------+
    |     |       |       |        |
    |     v       v       v        v
    |   fast()  legacy() tables  hot_opps()
    |     |       |       |        |
    |     +---+---+-------+        |
    |         |                    |
    +---------+--------------------+
              |
              v
    [Merge: Meta spend/clicks + CRM leads/vendas]
              |
              v
    [Calculo de funil 7 niveis x 5 periodos]
              |
              v
    [Formatacao: valores, percentuais, variacoes]
              |
              v
    [Retorno: { funil, vertical, footer }]
              |
              v
    [Renderizacao: cards comparativos + funil visual]
```

### 8.3 Fluxo: Match de Campanhas

```
[useTimelineFilteredCampaignIds()]
          |
    +-----+-----+
    |             |
    v             v
[Supabase]    [Meta API]
timeline_     fetchMetaCampaigns()
campanhas
    |             |
    v             v
["[midia paga]  [{id:"123", name:"[midia paga]
  Acelerai"]      Acelerai - Conv"}]
    |             |
    +------+------+
           |
           v
    [Match: metaName.includes(timelineName)]
           |
           v
    [Return: ["123", ...]]
```

### 8.4 Fluxo: Realtime Updates

```
[Supabase Realtime]
     |
     | INSERT/UPDATE/DELETE em tabelas monitoradas
     v
[useAureaCloudRealtime]
     |
     +-- meta_insights_cache -> invalidacao IMEDIATA
     |
     +-- compras/leads/agendamento/imagemProposta
         -> invalidacao DEBOUNCED (5 segundos)
              |
              v
     [queryClient.invalidateQueries(["aurea-cloud-*"])]
              |
              v
     [TanStack Query refetch automatico]
              |
              v
     [UI atualizada com novos dados]
```

---

## 9. Calculos de KPIs

### Metricas Diretas (da Meta API)

| Metrica | Fonte API | Campo |
|---------|-----------|-------|
| Investimento (R$) | insights.spend | `spend` |
| Impressoes | insights.impressions | `impressions` |
| Cliques | insights.clicks | `clicks` |
| Landing Page Views | insights.actions | `action_type = "landing_page_view"` |
| Resultados (Leads) | insights.actions | `action_type = "complete_registration"` |

### Metricas Calculadas

```
CPM  = Investimento / (Impressoes / 1000)
       Custo por mil impressoes

CTR  = (Cliques / Impressoes) * 100
       Taxa de cliques (%)

CPC  = Investimento / Cliques
       Custo por clique

CPL  = Investimento / Leads
       Custo por lead (tambem chamado CPR - Custo por Resultado)

CPO  = Investimento / Oportunidades
       Custo por oportunidade

CAC  = Investimento / Vendas (qtd)
       Custo de aquisicao de cliente

ROAS = Vendas (valor R$) / Investimento
       Retorno sobre investimento em ads

Tx. Oportunidade = Oportunidades / Leads * 100
                   Taxa de conversao lead -> oportunidade (%)

Tx. Conversao = Vendas / Leads * 100
                Taxa de conversao lead -> venda (%)
```

### Variacao Percentual

```
Variacao % = ((Valor Atual - Valor Anterior) / Valor Anterior) * 100

Regras:
- Se valor anterior = 0 e atual > 0: +100%
- Se valor anterior = 0 e atual = 0: 0%
- Se valor anterior > 0 e atual = 0: -100%
```

---

## 10. State Management e Cache

### TanStack Query v5

Toda a integracao usa TanStack Query para gerenciamento de estado server-side.

### Query Keys

| Key | Hook | Descricao |
|-----|------|-----------|
| `["meta-ads-calendario", since, until, campaignIds]` | useMetaAdsCalendario | Dados do calendario |
| `["aurea-cloud-metrics", "direct-v5", start, end, idsKey]` | useAureaCloudMetrics | Funil completo |
| `["meta-campaigns-all"]` | Diversos | Lista de campanhas Meta |
| `["timeline-campanhas"]` | useTimelineCampanhas | Campanhas internas |
| `["aurea-cloud-realtime"]` | useAureaCloudRealtime | Prefixo para invalidacao |
| `["utm-tracker-metrics"]` | useUtmTrackerMetrics | Dados UTM |

### Configuracao de Cache

| Hook | staleTime | refetchInterval | Retry |
|------|-----------|-----------------|-------|
| useMetaAdsCalendario | 5 min | - | 1 |
| useAureaCloudMetrics (realtime ON) | 2 min | 30 min | 1 |
| useAureaCloudMetrics (realtime OFF) | Infinity | - | 1 |
| Meta Campaigns | 5 min | - | default |

### Invalidacao de Cache

**Automatica (Realtime):**
- Triggered por mudancas nas tabelas monitoradas
- Debounce de 5s para evitar excesso de refetch

**Manual:**
- Botao "Atualizar" no dashboard
- `queryClient.invalidateQueries({ queryKey: ["aurea-cloud-metrics"] })`

**Por navegacao:**
- `placeholderData: keepPreviousData` mantem dados antigos durante refetch

---

## 11. Tratamento de Erros

### Camada: API Client (meta.ts)

| Cenario | Comportamento |
|---------|-------------|
| Token ausente | Retorna `{ spend: 0, clicks: 0, results: 0 }` com `console.warn` |
| Token invalido (erro 190) | Throw `Error` com mensagem da API |
| Rate limit | Depende do retry do Meta (nao tratado explicitamente) |
| Paginacao falha | Throw `Error` no page que falhou |
| Network error | Throw `Error` nativo do `fetch` |

### Camada: Hooks

| Cenario | Comportamento |
|---------|-------------|
| RPC fast falha | Fallback para RPC legacy |
| RPC legacy falha | Fallback para queries diretas |
| Queries diretas falham | Retorna zeros para metricas CRM |
| Meta API falha | Retorna zeros para metricas Meta, seta `error` |
| Timeout (30s) | Captura `AbortError`, retorna dados parciais |

### Camada: UI

| Cenario | Comportamento |
|---------|-------------|
| Configuracao ausente | Alerta amarelo com instrucoes de setup |
| Erro de API | Banner vermelho com mensagem de erro |
| Dados vazios | Mensagem "Sem dados no periodo selecionado" |
| Carregando | Skeleton screens em cards e tabelas |

---

## 12. Feature Flags

**Arquivo:** `src/lib/featureFlags.ts`

| Flag | Env Var | Default | Efeito |
|------|---------|---------|--------|
| `AUREA_CLOUD_REALTIME_ENABLED` | `VITE_AUREA_CLOUD_REALTIME_ENABLED` | `false` | Ativa subscricoes Realtime do Supabase e auto-refresh |

**Quando Realtime esta LIGADO:**
- Hook `useAureaCloudRealtime` se subscreve as tabelas
- `staleTime` do `useAureaCloudMetrics` = 2 minutos
- `refetchInterval` = 30 minutos
- Indicador de status de conexao no UI

**Quando Realtime esta DESLIGADO (padrao):**
- Sem subscricoes Realtime
- `staleTime` = Infinity (dados so atualizam com refresh manual)
- Sem indicador de conexao
- Menor consumo de recursos

---

## 13. Referencia de Arquivos

| Arquivo | ~Linhas | Proposito |
|---------|---------|-----------|
| `src/lib/meta.ts` | 280 | Client HTTP da Meta Graph API |
| `src/lib/supabase.ts` | 34 | Inicializacao do client Supabase |
| `src/lib/featureFlags.ts` | 15 | Feature flags do projeto |
| `src/hooks/useMetaAdsCalendario.ts` | 410 | Hook da visao calendario |
| `src/hooks/useAureaCloudMetrics.ts` | 723 | Hook do funil completo |
| `src/hooks/useTimelineFilteredCampaignIds.ts` | 48 | Match campanhas timeline <-> Meta |
| `src/hooks/useAureaCloudRealtime.ts` | 200 | Subscricoes Realtime |
| `src/hooks/useDashboardMetas.ts` | ~50 | Metas do dashboard |
| `src/hooks/useDashboardMetrics.ts` | ~50 | Metricas do dashboard |
| `src/components/MetaAdsVisaoCalendario.tsx` | 525 | Componente do calendario |
| `src/pages/AureaCloud.tsx` | 800+ | Pagina principal Aurea Cloud |
| `src/pages/Dashboard.tsx` | Var. | Dashboard principal |
| `src/types/database.types.ts` | 1000+ | Tipos do Supabase (auto-gerado) |
| `.env.example` | ~10 | Template de variaveis de ambiente |

---

## 14. Troubleshooting

### Problema: Dashboard mostra R$ 0,00 para investimento

**Causas possiveis:**
1. Token Meta expirado -> Renovar no Business Manager
2. Token ausente no `.env` -> Verificar `VITE_META_ACCESS_TOKEN`
3. Ad Account ID incorreto -> Verificar `VITE_META_AD_ACCOUNT_ID`
4. Campanhas sem dados no periodo -> Alterar date range

**Diagnostico:**
```bash
# Verificar se env vars existem (sem revelar valores)
echo "Token: ${VITE_META_ACCESS_TOKEN:+SET}"
echo "Account: ${VITE_META_AD_ACCOUNT_ID:+SET}"
```

Abrir DevTools > Console e procurar por warnings de `meta.ts`.

### Problema: Metricas CRM mostram zero mas Meta funciona

**Causas possiveis:**
1. RPCs do Supabase nao criadas -> Verificar se existem no Supabase
2. RLS bloqueando acesso -> Verificar policies
3. Dados CRM sem `novo_crm = true` -> Verificar registros
4. Canal de entrada diferente -> Leads precisam de `canalentrada = 'Landing Page'`

### Problema: Realtime nao atualiza automaticamente

**Verificar:**
1. `VITE_AUREA_CLOUD_REALTIME_ENABLED=true` no `.env`
2. Realtime habilitado nas tabelas do Supabase (Settings > Realtime)
3. Indicador de status no UI (deve mostrar "connected")

### Problema: Campanhas da timeline nao aparecem no filtro

**Verificar:**
1. Nomes das campanhas na `timeline_campanhas` batem com nomes na Meta
2. O match e por `.includes()` - o nome da timeline deve estar contido no nome da Meta
3. Campanhas Meta devem estar ativas (`effective_status`)

### Problema: Performance lenta no dashboard

**Possiveis otimizacoes:**
1. Verificar se `get_aurea_cloud_metrics_fast` RPC esta criada (evita fallback)
2. Reduzir numero de campanhas selecionadas no filtro
3. Habilitar Realtime para evitar refetch desnecessario
4. Verificar se `staleTime` esta adequado no ambiente

---

## Historico de Mudancas

| Data | Descricao |
|------|-----------|
| 2026-02-25 | Documentacao inicial criada |
| 2026-02-10 | Investigacao de pipeline de dados Meta (spend R$ 0,00) |
| 2026-02 | Refactoring de branding Aurea Cloud e consistencia de componentes |
| 2026-02 | Melhoria no handling de KPIs e metricas de campanhas |

---

> **Mantido por:** Time de Desenvolvimento Lirica Aurea
> **Ultima atualizacao:** 2026-02-25
