# Velocimetro (Gauge) - Dashboard Principal

> Componente: `public/widgets/dashboard/form.js` + `form.html`
> Ultima atualizacao: 2026-02-19

---

## Visao Geral

O Velocimetro e um radialBar (ApexCharts) que mostra o progresso do faturamento atual contra a **meta mensal** definida no CRM. Exibe tambem uma comparacao de tendencia contra o periodo anterior.

### Elementos visuais (HTML)

| Elemento ID | Funcao |
|---|---|
| `gauge-chart` | Container do grafico ApexCharts (radialBar) |
| `gauge-month-label` | Subtitulo: "Meta de [Mes]" ou "Meta do periodo" |
| `gauge-percentage` | Texto central: porcentagem atingida (ex: "75%") |
| `gauge-trend` | Badge de tendencia: "+12.3% vs media mes ant." |
| `gauge-trend-icon` | Icone: `trending-up` ou `trending-down` (Lucide) |
| `gauge-current` | Faturamento atual formatado (ex: "R$ 150.00k") |
| `gauge-target` | Meta formatada (ex: "R$ 200.00k") ou "--" se nao elegivel |
| `gauge-missing` | "Faltam R$ 50.00k" ou "Meta atingida!" |
| `gauge-status` | Status badge: success/warning/danger com texto |

---

## Fluxo de Dados

```
fetchRevenue()
  |
  +--> getGaugeTargetRevenueFromCrm()     --> Meta mensal (CRM)
  |       |
  |       +--> fetchCrmMetasRpc()          (vendedor selecionado)
  |       +--> fetchCrmMetaGeralMes()      (fallback global)
  |       +--> getMonthlyTarget()          (fallback final: params/constante)
  |
  +--> compras (periodo atual)             --> currentRevenue
  +--> compras (periodo anterior)          --> prevRevenue
  |
  +--> PRORRATEIO (filtro "month")         --> gaugePrevRevenue
  |       prevRevenue * (diasDecorridos / diasMesAnterior)
  |
  +--> renderGauge(pct, current, target, prevProrated, missing)
```

---

## Meta do Velocimetro

### Fonte de dados (prioridade)

1. **RPC `crm_get_metas_vendedores`** -> `meta_mensal_final` (quando ha vendedor selecionado)
2. **Tabela `crm_metas_geral_mes`** -> `meta_geral` (por mes, sem vendedor)
3. **Fallback**: `monthlyTarget` dos params do widget ou constante `TARGET_REVENUE_MONTHLY`

### Regra de periodo

- **Filtro "month"**: usa a meta do mes **inteiro** (sem prorrateio)
- **Demais filtros**: `computeProratedTargetForRange(monthlyTarget, start, end)` — prorrateio proporcional ao numero de dias no range

### Vendedor nao elegivel

Quando `vendedores.elegivel_rotacao = false`, a meta e exibida como `--` (`state.gaugeHideTarget = true`), mas o calculo interno de percentual continua funcionando.

**Codigo** (`form.js:541-568`):
```javascript
async function getGaugeTargetRevenueFromCrm() {
  const { mes, ano, refDateYmd } = getCrmMetaContext();
  if (state.selectedSeller) {
    const elegivel = await fetchSellerRotacaoEligibility(state.selectedSeller);
    state.gaugeHideTarget = (elegivel === false);
    const rpc = await fetchCrmMetasRpc(mes, ano, refDateYmd);
    const row = rpc.byVendedorId[state.selectedSeller];
    const metaVendedor = __toNumber(row?.meta_mensal_final);
    if (metaVendedor > 0) return metaVendedor;
  }
  state.gaugeHideTarget = false;
  const metaGeral = await fetchCrmMetaGeralMes(mes);
  if (metaGeral > 0) return metaGeral;
  return getMonthlyTarget(); // fallback
}
```

---

## Comparacao "vs media mes anterior" (CORRECAO)

### Problema anterior

A comparacao do velocimetro usava `prevRevenue` diretamente — o faturamento **total** do mes anterior (ex: Janeiro inteiro = 31 dias). Comparar contra `currentRevenue` (mes parcial, ex: 19 dias de Fevereiro) gerava uma variacao **sempre negativa** e enganosa.

### Solucao: prorrateio proporcional

Quando o filtro e "month", o faturamento do mes anterior e **prorateado** pelo numero de dias ja decorridos no mes atual:

```
gaugePrevRevenue = prevRevenue * (daysElapsed / prevMonthDays)
```

**Exemplo concreto:**
- Janeiro total: R$ 200k (31 dias) -> media diaria = R$ 6.451,61/dia
- Hoje: 19 de Fevereiro, faturamento = R$ 150k
- Prorrateio Jan: R$ 200k * (19/31) = R$ 122.580,65
- Comparacao: (150k - 122.6k) / 122.6k = **+22.4%** (correto!)
- Sem prorrateio seria: (150k - 200k) / 200k = **-25%** (enganoso)

**Codigo** (`form.js:3923-3934`):
```javascript
const gaugeCurrentRevenue = currentRevenue;
let gaugePrevRevenue;
if (state.dateFilter === 'month' && prevRevenue > 0) {
  const now = new Date();
  const daysElapsed = now.getDate();
  const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  gaugePrevRevenue = prevRevenue * (daysElapsed / prevMonthDays);
} else {
  gaugePrevRevenue = prevRevenue;
}
```

### Label dinamico

O texto do badge de tendencia muda conforme o filtro:
- **Filtro "month"**: `"+12.3% vs media mes ant."`
- **Outros filtros**: `"+12.3% vs periodo anterior"`

**Codigo** (`form.js:6646-6647`):
```javascript
const trendLabel = (state.dateFilter === 'month')
  ? '% vs media mes ant.'
  : '% vs periodo anterior';
trendTextEl.textContent = (isPositive ? '+' : '') +
  Math.abs(trendVariation).toFixed(1) + trendLabel;
```

---

## renderGauge() - Referencia

**Assinatura** (`form.js:6565`):
```javascript
function renderGauge(gaugePct, currentRevenue, targetRevenue, prevRevenue, missing)
```

### Secoes da funcao

| Secao | Descricao |
|---|---|
| Titulo | Define "Meta de [Mes]" ou "Meta do periodo" |
| Chart | Cria radialBar (ApexCharts) com arco -100 a 100 graus |
| Percentage | Texto central com % arredondado |
| Trend | Badge verde/vermelho com variacao vs periodo anterior |
| Values | "R$ atual / R$ meta" |
| Missing | "Faltam R$ X" ou "Meta atingida!" |
| Status | Badge colorido: success (>=90%), warning (>=70%), danger (<70%) |

### Regras do Status Badge

| Condicao | Variante | Icone | Texto |
|---|---|---|---|
| pct >= 100% | `success` | `check-circle-2` | "Meta alcancada!" |
| pct >= 90% | `success` | `trending-up` | "X% da meta" |
| pct >= 70% | `warning` | `alert-triangle` | "X% da meta" |
| pct < 70% | `danger` | `alert-circle` | "X% da meta" |

---

## Dependencias

- **ApexCharts**: grafico radialBar
- **Lucide Icons**: icones de tendencia e status
- **Supabase**: tabelas `compras`, `crm_metas_geral_mes`, `vendedores`; RPC `crm_get_metas_vendedores`
- **State**: `dateFilter`, `selectedSeller`, `theme`, `gaugeHideTarget`
