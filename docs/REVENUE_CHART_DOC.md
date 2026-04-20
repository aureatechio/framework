# Documentação: Gráfico "Evolução do Faturamento"

**Arquivo principal:** `public/widgets/dashboard/form.js`
**HTML:** `public/widgets/dashboard/form.html` (linhas 220–246)
**CSS:** `public/widgets/dashboard/form.css`

---

## 1. Visão Geral

O gráfico mostra a **evolução acumulada do faturamento** ao longo do tempo, comparando com a meta e o ano anterior. Usa a biblioteca **ApexCharts** no tipo `area` com eixo X `datetime`.

### Séries do gráfico (até 4 linhas):

| Série | Cor | Tipo de linha | Descrição |
|-------|-----|---------------|-----------|
| **Realizado** | Azul `#3b82f6` | Sólida | Faturamento acumulado no período (compras aprovadas) |
| **Ano Passado** | Vermelho `#ef4444` | Sólida | Faturamento acumulado no mesmo período do ano anterior |
| **Meta** | Verde `#10b981` | Sólida | Meta acumulada (linear ou por ciclos) |
| **Projeção** | Azul claro `#0ea5e9` | Pontilhada | Projeção (run rate) — só nos modos Mês e Ano |

---

## 2. Variáveis de Estado

```
state.revenueChartMode          // 'month' | 'semester' | 'year' — período do gráfico
state.revenueChartZoomEnabled   // true/false — habilita zoom por scroll do mouse
state.revenueChartShowTodayMarker // true/false — exibe caixa flutuante + linha vertical no dia atual
state.revenueChartSeriesVisible // { Realizado: bool, AnoPassado: bool, Meta: bool, Projecao: bool }
state.revenueChartZoom          // { min, max } em ms — range de zoom ativo (null = sem zoom)
state.revenueChartData          // cache do último chartData processado
```

Variáveis globais:
```
let revenueChart = null;        // instância do ApexCharts
let revenueMetaVisible = false; // persiste a escolha do usuário entre renders
```

---

## 3. Fluxo de Dados (fetchRevenue)

**Localização:** `form.js`, linha ~3571

### 3.1 Etapas

```
fetchRevenue()
  ├── 1. Query principal: compras aprovadas no período do HEADER (dateFilter)
  │     → usado para KPIs (faturamento, ticket, vendas, etc.)
  │
  ├── 2. fetchRevenueChartData() — dados do GRÁFICO (período próprio)
  │     ├── 2a. Query compras no período do gráfico (revenueChartMode)
  │     ├── 2b. Busca meta mensal via getGaugeTargetRevenueFromCrm()
  │     ├── 2c. processRevenueData() → gera arrays acumulados
  │     ├── 2d. Query compras ano passado → série "Ano Passado"
  │     └── 2e. Calcula série "Projeção" (run rate)
  │
  ├── 3. Query compras período anterior → para "vs mês anterior" nos KPIs
  ├── 4. Query compras ano passado (range do header) → para "vs ano anterior" nos KPIs
  └── 5. Atualiza KPIs (faturamento, ticket, vendas, conversão, etc.)
```

### 3.2 Período do gráfico vs período do header

**Importante:** O gráfico tem seu próprio controle de período (`revenueChartMode`), **independente** do filtro de data do header (`state.dateFilter`).

| Controle | Quem usa | Valores |
|----------|----------|---------|
| `state.dateFilter` | KPIs, funil, ranking, etc. | today, week, month, year |
| `state.revenueChartMode` | Gráfico de faturamento | month, semester, year |

### 3.3 getRevenueChartRangeByMode(mode)

**Localização:** linha ~3139

| Modo | Range |
|------|-------|
| `month` | 1º dia do mês atual → último dia do mês atual |
| `semester` | 1º dia do semestre (Jan ou Jul) → último dia do semestre |
| `year` | 1 de Janeiro → 31 de Dezembro do ano atual |

### 3.4 Queries ao Supabase

Todas as queries usam a tabela `compras` com estes filtros:

```
Tabela: compras
Select: valor_total, data_compra, leadid, vendedoresponsavel

Filtros aplicados (em ordem):
  1. applyApprovedPurchaseFilter()
     → vendaaprovada = true
     → checkout_status = 'pago' OU clicksign_status = 'Assinado'
     → is_test ≠ true (se suportado)

  2. applyCutoffTimestamp(query, 'data_compra')
     → data_compra > cutoff (se habilitado)

  3. .gte('data_compra', start).lte('data_compra', end)
     → filtra pelo range de datas

  4. .eq('vendedoresponsavel', state.selectedSeller)
     → filtra por vendedor (se selecionado)

  5. filterRowsByAgencyViaLeadId()  (pós-fetch)
     → filtra por agência via lookup na tabela leads
```

**Query do ano passado:** Mesmo padrão, mas com datas deslocadas -1 ano e cutoff ajustado via `__shiftIsoYear(cutoff, -1)`.

---

## 4. Processamento dos Dados (processRevenueData)

**Localização:** linha ~3317

**Entrada:** array de compras, startDate, endDate, metaTotalOverride
**Saída:** `{ categories, seriesData, seriesMeta, rawDates, isYearly }`

### 4.1 Detecção de granularidade

```
diffDays = (endDate - startDate) em dias
isYearly = diffDays > 40
```

| Granularidade | Chave do mapa | Exemplo | Quando |
|---------------|---------------|---------|--------|
| **Diária** | `YYYY-MM-DD` | `2026-03-02` | Mês, Semestre curto |
| **Mensal** | `YYYY-MM` | `2026-03` | Semestre, Ano (>40 dias) |

### 4.2 Construção do mapa de datas

1. Cria mapa com **todas** as datas/meses do range, valor inicial = 0
2. Itera as compras e soma `valor_total` na chave correspondente
3. Ordena as chaves cronologicamente
4. Gera arrays **acumulados** (running total):
   - `seriesData[i]` = soma de todos os valores dos dias 1 até i

### 4.3 Cálculo da Meta

A meta pode funcionar em 3 modos:

#### Modo 1: Linear (padrão)
```
stepGoal = metaTotal / totalDeDias
seriesMeta[i] = stepGoal × (i + 1)
```
Resultado: linha reta do 0 até a meta.

#### Modo 2: Monthly Steps (ciclos do CRM)
Usado quando o CRM tem ciclos configurados (ex.: ciclo 1 = dias 1–7, ciclo 2 = dias 8–14, etc.)

```
Cada ciclo tem um percentual da meta.
Dia 1–7: meta × %ciclo1
Dia 8–14: meta × (%ciclo1 + %ciclo2)
...

Transição entre ciclos: rampa suave de 2 dias (SMOOTH_DAYS = 2)
```

Resultado: linha em "degraus suavizados".

#### Modo 3: Cycle Fixed
Quando há `cicloDiaInicio` e `cicloDiaFim`:
- Antes do início do ciclo: meta = 0
- Após o início: meta = metaTotal (linha horizontal)

### 4.4 Série "Ano Passado"

Após `processRevenueData`, uma query separada busca compras do mesmo período do ano anterior.

**Mapeamento de datas:**
- **Modo mensal (isYearly):** mês do ano passado → mesmo mês no ano atual
  - Ex.: `2025-03` → `2026-03`
- **Modo diário:** dia do ano passado → mesmo dia no mês atual
  - Ex.: `2025-03-15` → `2026-03-15`

O resultado é acumulado (running total) para alinhar com o "Realizado".

### 4.5 Série "Projeção" (Run Rate)

Disponível apenas nos modos `month` e `year`.

```
Cálculo:
  1. Identifica o índice do dia/mês atual nos dados
  2. acumuladoHoje = seriesData no ponto atual
  3. taxaMedia = acumuladoHoje / (dias ou meses passados)
  4. projecaoFinal = taxaMedia × (total de dias ou meses)
  5. Série: null até hoje, depois interpolação linear até projecaoFinal

Resultado: linha pontilhada que começa no ponto atual e projeta até o final.
```

---

## 5. Renderização (renderRevenue)

**Localização:** linha ~7236

### 5.1 Preparação dos dados

1. **extendRealizadoToToday:** Garante que a linha "Realizado" vai até o dia atual (mesmo sem vendas no dia). Após hoje, preenche com `null` (linha para).
2. **Padding mínimo:** Se só tem 1 ponto, duplica para que o ApexCharts desenhe (bug fix).
3. **Display categories:** Se >35 pontos diários, mostra label apenas nas quartas-feiras (de 7 em 7).

### 5.2 Configuração do ApexCharts

```
Tipo: area
Eixo X: datetime (timestamps em ms)
Eixo Y: auto-escala otimizada (yMin ~98% do mínimo, yMax ~102% do máximo)
Altura: 340px (desktop) ou 320px (mobile)
Preenchimento: gradient (opacity 0.4 → 0.05)
Curva: smooth (todas as séries)
Toolbar: desabilitada (controles customizados)
Animações: habilitadas
```

### 5.3 Formatação de valores

| Contexto | Formato |
|----------|---------|
| Eixo Y | `R$ 150k`, `R$ 1.2M` |
| Tooltip (mensal) | `R$ 150.000` (sem centavos) |
| Tooltip (anual) | `R$ 1.2M` |
| Focus box | Mesmo do tooltip |

### 5.4 Eixo X — Formatação

| Modo | Formato do label |
|------|-----------------|
| Diário | `dd/mm` (ex.: `02/03`) |
| Mensal (zoom >180 dias) | `mm/aa` (ex.: `03/26`) |

### 5.5 Update vs Recreate

O gráfico **não é destruído e recriado** a cada refresh. Quando já existe (`revenueChart !== null`), usa `updateSeries()` e `updateOptions()` para evitar "piscar" no Bubble.

---

## 6. Controles da Interface

### 6.1 Seletor de período (Mês / Semestre / Ano)

| Botão | ID | Ação |
|-------|----|------|
| Mês | `rev-mode-month` | `state.revenueChartMode = 'month'` → re-fetch |
| Semestre | `rev-mode-semester` | `state.revenueChartMode = 'semester'` → re-fetch |
| Ano | `rev-mode-year` | `state.revenueChartMode = 'year'` → re-fetch |

Ao trocar o modo: reseta zoom, re-executa `fetchRevenue()` completo.

### 6.2 Toggles de séries (Realizado / Ano passado / Meta / Projeção)

| Botão | ID | Ação |
|-------|----|------|
| Realizado | `rev-toggle-realizado` | Mostra/esconde série via `hideSeries()`/`showSeries()` |
| Ano passado | `rev-toggle-lastyear` | Idem |
| Meta | `rev-toggle-meta` | Idem + recalcula eixo Y |
| Projeção | `rev-toggle-projecao` | Idem |

Quando a Meta é toggled, o eixo Y é recalculado para otimizar a escala visual.

### 6.3 Zoom

| Botão | ID | Ação |
|-------|----|------|
| Zoom | `rev-zoom-toggle` | Habilita/desabilita zoom por scroll do mouse |

Zoom também funciona por **drag-to-select** (sempre habilitado).

Quando zoom está ativo:
- A caixa flutuante (focus box) é escondida
- O eixo Y é recalculado para o range visível
- Botão "Reset Zoom" aparece automaticamente

### 6.4 Marcador do dia atual

| Botão | ID | Ação |
|-------|----|------|
| Legenda | `rev-toggle-today` | Mostra/esconde a linha vertical + focus box |

---

## 7. Focus Box (Caixa Flutuante)

Caixa flutuante posicionada sobre o gráfico no dia/mês atual, mostrando:

```
┌─────────────────────┐
│ 02/03               │ ← data do ponto
│ 🔵 Realizado R$ 150k│
│ 🔴 2025     R$ 120k │ ← ano passado
│ 🟢 Meta     R$ 500k │
└─────────────────────┘
```

**Posicionamento:** Calculado via grid do ApexCharts (globals.gridX, gridWidth, etc.) para ficar alinhado ao ponto correto.

**Comportamento:**
- Aparece após o gráfico renderizar (com delay de 120ms)
- Atualiza posição em cada `updated` do chart
- Esconde quando zoom está ativo
- Usa `backdrop-filter: blur(6px)` para efeito glass

---

## 8. Tooltip

O tooltip do hover mostra:

```
Header: "02/03/26 vs 02/03/25"   ← data atual vs mesmo dia do ano passado
Body:
  Realizado: R$ 150.000
  2025:      R$ 120.000
  Meta:      R$ 200.000
  Projeção:  R$ 480.000
```

**Formatação do header:**
- Modo anual: `Mar/26 vs Mar/25`
- Modo diário: `02/03/26 vs 02/03/25`

---

## 9. Annotations (Marcadores visuais)

### 9.1 Linha vertical (xaxis annotation)
- Linha tracejada (`strokeDashArray: 3`) na posição do dia/mês atual
- Cor: `rgba(148,163,184,0.55)`
- Esconde quando zoom ativo

### 9.2 Pontos (point annotations)
- Bolinhas coloridas nos pontos do dia atual para cada série visível
- Tamanho: 6px com borda branca de 2px
- Cores: azul (Realizado), vermelho (Ano passado), verde (Meta)

---

## 10. Escala do Eixo Y

### 10.1 Cálculo automático

```
1. Coleta todos os valores de todas as séries VISÍVEIS
2. minVal = menor valor
3. maxVal = maior valor
4. step = 10^(floor(log10(maxVal)) - 1)
5. yMin = floor(minVal × 0.98 / step) × step  (arredonda para baixo)
6. yMax = ceil(maxVal × 1.02 / step) × step    (arredonda para cima)
```

Quando o Realizado é todo zero mas a Meta existe → Meta é mostrada automaticamente para evitar gráfico "vazio".

### 10.2 Escala no zoom

Quando zoom está ativo, recalcula yMin/yMax considerando apenas os pontos visíveis no range de zoom. Usa margem de 10% no mínimo e 5% no máximo.

---

## 11. Responsividade

- Desktop (≥1200px): altura 340px, card ocupa 3 colunas do grid (`xl-col-span-3`)
- Mobile (<1200px): altura 320px
- Labels do eixo X: esconde overlapping automaticamente
- Para >35 pontos diários: mostra label só nas quartas (de 7 em 7)

---

## 12. Dark Mode

Detectado via `state.theme === 'dark'`:

| Elemento | Light | Dark |
|----------|-------|------|
| Grid | `#f1f5f9` | `#334155` |
| Labels | `#64748b` | `#94a3b8` |
| Focus box bg | `rgba(255,255,255,0.96)` | `rgba(15,23,42,0.92)` |
| Focus box text | `#0f172a` | `#e2e8f0` |
| Tooltip theme | `light` | `dark` |

---

## 13. Fluxo de Refresh

```
Evento                          → Ação
─────────────────────────────────────────────
Troca filtro de data (header)   → fetchData() → fetchRevenue() → renderRevenue()
Troca vendedor                  → fetchData() → fetchRevenue() → renderRevenue()
Troca agência                   → fetchData() → fetchRevenue() → renderRevenue()
Troca modo do gráfico (M/S/A)  → fetchRevenue() → renderRevenue()
Toggle série                    → hideSeries/showSeries + recalcula eixo Y
Zoom/drag                       → updateOptions (xaxis/yaxis) internamente
Reset zoom                      → restaura xaxis/yaxis originais
Realtime (compras/agendamento)  → scheduleRefresh() → fetchData() → fetchRevenue()
Visibility observer             → renderRevenue(state.revenueChartData)
```

---

## 14. Diagrama Simplificado

```
                    ┌──────────────────────────────────┐
                    │     Controles do Gráfico          │
                    │  [Mês] [Sem] [Ano]               │
                    │  [●Real] [●LY] [●Meta] [●Proj]  │
                    │  [🔍Zoom] [📝Legenda]            │
                    └────────────┬─────────────────────┘
                                 │ click
                                 ▼
                    ┌─────────────────────────┐
                    │   fetchRevenue()         │
                    │                          │
                    │ ┌──────────────────────┐ │
                    │ │ fetchRevenueChartData │ │
                    │ │  1. Query compras     │ │
                    │ │  2. Busca meta CRM    │ │
                    │ │  3. processRevenueData│ │
                    │ │  4. Query ano passado │ │
                    │ │  5. Calc projeção     │ │
                    │ └──────────┬───────────┘ │
                    └────────────┼─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ state.revenueChartData   │
                    │  .categories  ['01/03',.]│
                    │  .seriesData  [0,10k,..] │
                    │  .seriesMeta  [0,16k,..] │
                    │  .seriesLastYear [0,8k]  │
                    │  .seriesProjecao [null,..]│
                    │  .rawDates ['2026-03-01']│
                    │  .isYearly  false         │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   renderRevenue()        │
                    │                          │
                    │  1. Extend até hoje       │
                    │  2. Monta séries          │
                    │  3. Calcula eixo Y        │
                    │  4. Cria/atualiza Apex    │
                    │  5. Focus box + anotações │
                    └──────────────────────────┘
```
