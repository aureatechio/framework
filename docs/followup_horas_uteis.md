## Follow-up por etapas (loogsLeads) com horas úteis — Guia para replicar em outro projeto

Este documento descreve como calcular a métrica de **Follow-up** usando **transições de etapa** na tabela `loogsLeads`, medindo o tempo em **horas úteis** (ignorando 19h–9h e fins de semana).

### Objetivo
- Medir o tempo de follow-up como **tempo útil** entre etapas (consecutivas).
- Considerar apenas a **primeira vez** que o lead entrou em cada etapa de follow-up.

### IDs das etapas (hardcoded)
- **FLW1**: `dde9e8fa-142f-411b-b6f3-6c1f9f6cc0c9`
- **FLW2**: `169eb74f-ee37-4b49-9848-6866fd3b8af9`
- **FLW3**: `f9e89423-7b32-4680-90aa-be7480a5dc0a`

### Fonte de dados
- **Tabela**: `loogsLeads`
- **Campos mínimos**:
  - `lead` (UUID)
  - `created_at` (timestamptz)
  - `etapa_posterior` (UUID)
  - `vendedor_id` (UUID)

### Filtro de período (header)
- Um lead entra no cálculo de FLW1/FLW2/FLW3 **somente se a 1ª entrada naquela etapa** ocorreu **dentro** do período do header (`start..end`).

### Filtro de vendedor (quando aplicável)
- Se houver um vendedor selecionado, filtrar por:
  - `loogsLeads.vendedor_id = selectedSeller`

### Regra de primeira ocorrência
Para cada lead:
- `t1` = 1ª ocorrência de entrada no **FLW1** (`etapa_posterior = FLW1`)
- `t2` = 1ª ocorrência de entrada no **FLW2** (`etapa_posterior = FLW2`)
- `t3` = 1ª ocorrência de entrada no **FLW3** (`etapa_posterior = FLW3`)

### Como calcular os deltas (etapas consecutivas)
- **Delta FLW1**: do **último evento do lead antes de `t1`** → até `t1`
  - `prev_t1 = max(created_at) onde created_at < t1`
  - `diff1 = business_hours(prev_t1, t1)`
- **Delta FLW2**: `diff2 = business_hours(t1, t2)`
- **Delta FLW3**: `diff3 = business_hours(t2, t3)`

### Horas úteis (business hours)
- timezone: `America/Sao_Paulo`
- dias: **seg–sex**
- janela diária: **09:00–19:00**
- tudo fora dessa janela **não conta** (19h–9h + fins de semana)

### Guardrails recomendados
- Ignorar `diff <= 0`
- Ignorar outlier `diffHours >= 720` (30 dias)
- Para SLA: considerar “dentro da meta” quando `diffHours <= 24`

### Agregação final (para exibir)
- `avgFollowHours = round(sumHours / count)` (em horas úteis)
- `slaFollowPct = round(100 * within24 / count)`

### Fluxo recomendado (performance)
1) Buscar **candidatos** no período do header:
   - `loogsLeads` com `etapa_posterior IN (FLW1,FLW2,FLW3)` e `created_at BETWEEN start AND end`
2) Para esses leads, buscar logs com um **lookback** (ex.: 180 dias) para capturar `prev_t1` e as primeiras entradas.
3) Calcular deltas em horas úteis e agregar.

### Pseudocódigo (alto nível)
```text
inputs: start, end, selectedSeller (opcional)

1) candidates = leads que entraram em FLW1/2/3 dentro de [start,end]

2) para cada lead candidate:
   buscar logs do lead (lookback 180d → end)
   t1/t2/t3 = primeira entrada FLW1/2/3
   prev_t1 = último log antes do t1

3) deltas:
   se t1 dentro do header: add businessHours(prev_t1, t1)
   se t2 dentro do header: add businessHours(t1, t2)
   se t3 dentro do header: add businessHours(t2, t3)

4) média e SLA:
   avg = round(sum / count)
   sla = round(100 * within24 / count)
```

