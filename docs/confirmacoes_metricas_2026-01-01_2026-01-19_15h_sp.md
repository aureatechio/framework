# Confirmações de métricas — 01/01/2026 a 19/01/2026 15:00 (São Paulo)

Período confirmado: **01/01/2026 00:00 até 19/01/2026 15:00 (horário de São Paulo)**.

Conversão usada:
- **São Paulo (UTC-03)**: `2026-01-19 15:00:00-03`
- **UTC**: `2026-01-19 18:00:00Z`

Nos SQLs abaixo, para evitar ambiguidade:
- `created_at` em `public.leads` é **timestamp sem timezone** → comparei como horário local (SP): `>= '2026-01-01 00:00:00' AND <= '2026-01-19 15:00:00'`
- `created_at`/`data_compra` em outras tabelas são **timestamptz** → comparei em UTC: `>= '2026-01-01T03:00:00Z' AND <= '2026-01-19T18:00:00Z'`

Agências (fonte: `public.agencias`):
- **Aceleraí**: `75f34688-c054-4519-a445-e350fe146870`
- **MGS**: `a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9`

Etapa “Oportunidade” (fonte: `public.etapa`):
- **Oportunidade**: `a6709949-9857-4b25-965d-b4bf8270426b`

Funil considerado para “Oportunidades” (fonte: `public.etapa.funil`):
- **Funil**: `d2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a`
- **Critério**: `etapa.index >= 1` (via join em `leads.etapaVendedorFunil`)

---

## Resumo (valores)

| Agência | Leads | Oportunidades | Qualificação (%) | Propostas (rows) | Vendas | Valor das Vendas |
|---|---:|---:|---:|---:|---:|---:|
| Aceleraí | 2626 | 2222 | 84,62 | 325 | 32 | 471.020,00 |
| MGS | 245 | 245 | 100,00 | 20 | 0 | 0,00 |

---

## SQL consolidado (todas as métricas)

```sql
with params as (
  -- Corte: 19/01/2026 15:00 (America/Sao_Paulo) == 19/01/2026 18:00Z
  select
    timestamp '2026-01-01 00:00:00' as ini_ts,
    timestamp '2026-01-19 15:00:00' as fim_ts,
    timestamptz '2026-01-01T03:00:00Z' as ini_tz,
    timestamptz '2026-01-19T18:00:00Z' as fim_tz
),
agencias_alvo as (
  select id as agencia_id, nome as agencia_nome
  from public.agencias
  where id in (
    '75f34688-c054-4519-a445-e350fe146870',
    'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9'
  )
),
leads_aggr as (
  select
    l.agencia as agencia_id,
    count(*) as leads,
    count(*) filter (
      where e.funil = 'd2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a'
        and e.index >= 1
    ) as oportunidades
  from public.leads l
  left join public.etapa e on e.id = l."etapaVendedorFunil"
  join agencias_alvo a on a.agencia_id = l.agencia
  join params p on true
  where l.created_at >= p.ini_ts
    and l.created_at <= p.fim_ts
  group by l.agencia
),
propostas_aggr as (
  select
    l.agencia as agencia_id,
    count(*) as propostas
  from public."imagemProposta" ip
  join public.leads l on l.lead_id = ip.id_lead
  join agencias_alvo a on a.agencia_id = l.agencia
  join params p on true
  where ip.created_at >= p.ini_tz
    and ip.created_at <= p.fim_tz
  group by l.agencia
),
vendas_aggr as (
  select
    l.agencia as agencia_id,
    count(*) filter (where c.vendaaprovada = true) as vendas,
    coalesce(sum(c.valor_total) filter (where c.vendaaprovada = true),0) as valor_vendas
  from public.compras c
  join public.leads l on l.lead_id = c.leadid
  join agencias_alvo a on a.agencia_id = l.agencia
  join params p on true
  where c.data_compra >= p.ini_tz
    and c.data_compra <= p.fim_tz
  group by l.agencia
)
select
  a.agencia_nome,
  a.agencia_id,
  coalesce(la.leads,0) as leads,
  coalesce(la.oportunidades,0) as oportunidades,
  round((coalesce(la.oportunidades,0)::numeric / nullif(coalesce(la.leads,0),0)) * 100, 2) as qualificacao_pct,
  coalesce(pa.propostas,0) as propostas,
  coalesce(va.vendas,0) as vendas,
  coalesce(va.valor_vendas,0) as valor_vendas
from agencias_alvo a
left join leads_aggr la on la.agencia_id = a.agencia_id
left join propostas_aggr pa on pa.agencia_id = a.agencia_id
left join vendas_aggr va on va.agencia_id = a.agencia_id
order by a.agencia_nome;
```

