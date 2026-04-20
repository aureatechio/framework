# Confirmações de métricas — 01/01/2026 a 19/01/2026

Período confirmado: **01/01/2026 até 19/01/2026 (inclusive)**.

Nos SQLs abaixo, para evitar ambiguidade, usei **corte no dia 2026-01-19 (inclusive)**:

- `created_at` (timestamp sem timezone): `>= '2026-01-01' AND <= '2026-01-19 23:59:59.999'`
- `created_at/data_compra` (timestamptz): `>= '2026-01-01T00:00:00Z' AND <= '2026-01-19T23:59:59.999Z'`

Agências (fonte: `public.agencias`):
- **Aceleraí**: `75f34688-c054-4519-a445-e350fe146870`
- **MGS**: `a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9`

Funil considerado para “Oportunidades” (fonte: `public.etapa.funil`):
- **Funil**: `d2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a`
- **Critério**: `etapa.index >= 1` (via join em `leads.etapaVendedorFunil`)

---

## Resumo (valores)

| Agência | Leads | Oportunidades | Qualificação (%) | Propostas (rows) | Vendas | Valor das Vendas |
|:--|--:|--:|--:|--:|--:|--:|
| Aceleraí | 2657 | 2230 | 83,93 | 349 | 32 | 471.020,00 |
| MGS | 245 | 245 | 100,00 | 20 | 0 | 0,00 |

---

## Aceleraí

### Leads (qtd)

```sql
select count(*) as leads
from public.leads
where agencia = '75f34688-c054-4519-a445-e350fe146870'
  and created_at >= timestamp '2026-01-01'
  and created_at <= timestamp '2026-01-19 23:59:59.999';
```

**Resultado**: 2657

### Oportunidades (qtd) — regra solicitada

```sql
select count(*) as oportunidades
from public.leads l
join public.etapa e on e.id = l."etapaVendedorFunil"
where l.agencia = '75f34688-c054-4519-a445-e350fe146870'
  and l.created_at >= timestamp '2026-01-01'
  and l.created_at <= timestamp '2026-01-19 23:59:59.999'
  and e.funil = 'd2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a'
  and e.index >= 1;
```

**Resultado**: 2230

### Qualificação (%)

```sql
with base as (
  select
    count(*) as leads,
    count(*) filter (
      where e.funil = 'd2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a'
        and e.index >= 1
    ) as oportunidades
  from public.leads l
  left join public.etapa e on e.id = l."etapaVendedorFunil"
  where l.agencia = '75f34688-c054-4519-a445-e350fe146870'
    and l.created_at >= timestamp '2026-01-01'
    and l.created_at <= timestamp '2026-01-19 23:59:59.999'
)
select
  leads,
  oportunidades,
  round((oportunidades::numeric / nullif(leads,0)) * 100, 2) as qualificacao_pct
from base;
```

**Resultado**: 83,93%

### Propostas (qtd) — `imagemProposta`

```sql
with p as (
  select
    timestamptz '2026-01-01T00:00:00Z' as ini,
    timestamptz '2026-01-19T23:59:59.999Z' as fim
)
select count(*) as propostas_rows
from public."imagemProposta" ip
join public.leads l on l.lead_id = ip.id_lead
join p on true
where l.agencia = '75f34688-c054-4519-a445-e350fe146870'
  and ip.created_at >= p.ini
  and ip.created_at <= p.fim;
```

**Resultado**: 349

### Vendas (qtd) e Valor das Vendas — `compras` aprovadas

Regra de “aprovada”: `vendaaprovada = true`.

```sql
with p as (
  select
    timestamptz '2026-01-01T00:00:00Z' as ini,
    timestamptz '2026-01-19T23:59:59.999Z' as fim
)
select
  count(*) filter (where c.vendaaprovada = true) as vendas,
  coalesce(sum(c.valor_total) filter (where c.vendaaprovada = true),0) as valor_vendas
from public.compras c
join public.leads l on l.lead_id = c.leadid
join p on true
where l.agencia = '75f34688-c054-4519-a445-e350fe146870'
  and c.data_compra >= p.ini
  and c.data_compra <= p.fim;
```

**Resultado**:
- Vendas: 32
- Valor: 471.020,00

---

## MGS

### Leads (qtd)

```sql
select count(*) as leads
from public.leads
where agencia = 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
  and created_at >= timestamp '2026-01-01'
  and created_at <= timestamp '2026-01-19 23:59:59.999';
```

**Resultado**: 245

### Oportunidades (qtd) — regra solicitada

```sql
select count(*) as oportunidades
from public.leads l
join public.etapa e on e.id = l."etapaVendedorFunil"
where l.agencia = 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
  and l.created_at >= timestamp '2026-01-01'
  and l.created_at <= timestamp '2026-01-19 23:59:59.999'
  and e.funil = 'd2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a'
  and e.index >= 1;
```

**Resultado**: 245

### Qualificação (%)

```sql
with base as (
  select
    count(*) as leads,
    count(*) filter (
      where e.funil = 'd2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a'
        and e.index >= 1
    ) as oportunidades
  from public.leads l
  left join public.etapa e on e.id = l."etapaVendedorFunil"
  where l.agencia = 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
    and l.created_at >= timestamp '2026-01-01'
    and l.created_at <= timestamp '2026-01-19 23:59:59.999'
)
select
  leads,
  oportunidades,
  round((oportunidades::numeric / nullif(leads,0)) * 100, 2) as qualificacao_pct
from base;
```

**Resultado**: 100,00%

### Propostas (qtd) — `imagemProposta`

```sql
with p as (
  select
    timestamptz '2026-01-01T00:00:00Z' as ini,
    timestamptz '2026-01-19T23:59:59.999Z' as fim
)
select count(*) as propostas_rows
from public."imagemProposta" ip
join public.leads l on l.lead_id = ip.id_lead
join p on true
where l.agencia = 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
  and ip.created_at >= p.ini
  and ip.created_at <= p.fim;
```

**Resultado**: 20

### Vendas (qtd) e Valor das Vendas — `compras` aprovadas

```sql
with p as (
  select
    timestamptz '2026-01-01T00:00:00Z' as ini,
    timestamptz '2026-01-19T23:59:59.999Z' as fim
)
select
  count(*) filter (where c.vendaaprovada = true) as vendas,
  coalesce(sum(c.valor_total) filter (where c.vendaaprovada = true),0) as valor_vendas
from public.compras c
join public.leads l on l.lead_id = c.leadid
join p on true
where l.agencia = 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
  and c.data_compra >= p.ini
  and c.data_compra <= p.fim;
```

**Resultado**:
- Vendas: 0
- Valor: 0,00

