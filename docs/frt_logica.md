## FRT (First Response Time) — Lógica por etapas (loogsLeads) — Guia para replicar em outro projeto

Este documento descreve como calcular a métrica **FRT** (tempo de primeira resposta) usando logs de mudança de etapa na tabela **`loogsLeads`**, produzindo:
- **FRT global (média)** + **SLA <= 20 min**
- **FRT individual (média por vendedor)**

### Objetivo
Medir o tempo (em **minutos**) que um lead leva para **sair da etapa-base** após **entrar** nela (primeiro andamento).

---

### Etapa-base (hardcoded)
- **Etapa-base (Oportunidade)**: `a6709949-9857-4b25-965d-b4bf8270426b`

> Observação: o nome antigo da etapa era “Novo Lead”, mas a métrica usa o **ID**.

---

### Hardcut (sobrepõe filtros)
**IMPORTANTE:** para FRT, o início do período é forçado para um instante fixo (independe de filtros do header/cutoff):

- **Início obrigatório (SP)**: `15/01/2026 12:00` (America/Sao_Paulo)
- **Equivalente UTC**: `2026-01-15T15:00:00.000Z`
- **Fim**: “agora” (momento da consulta)

---

### Implementação no projeto (referência prática)
No widget `dashboard_tela`, a lógica está implementada em:
- `public/widgets/dashboard_tela/form.js`
  - **geração dos eventos**: `computeFRTEventsHardcut()`
  - **FRT global (cards/SLA)**: `fetchSLAs()` (usa os eventos retornados)
  - **FRT por vendedor (ranking)**: `fetchRankingData()` (agrega `frtSum/frtCount`)

**Regra adicional no ranking (última mudança):**
- ao agregar o FRT por vendedor, o ranking **ignora** eventos com `diffMinutes <= 1` e soma apenas `diffMinutes > 1`.

**Versão do deploy que contém essa mudança:**
- `dashboard_tela v104`

### Fonte de dados
- **Tabela**: `loogsLeads`
- **Campos usados**:
  - `lead` (UUID do lead)
  - `created_at` (timestamptz do evento)
  - `vendedor_id` (UUID do vendedor no evento)
  - `etapa_anterior` (UUID)
  - `etapa_posterior` (UUID)
  - `descrição` (texto; fallback quando `etapa_*` vier nulo)

- **Tabela fallback (atribuição de vendedor)**: `leads`
  - `lead_id`
  - `vendedorResponsavel`

---

### Como detectar ENTER/EXIT da etapa-base
Para cada registro em `loogsLeads`, determinar:

#### ENTER na etapa-base
- Preferencial (estruturado): `etapa_posterior == ETAPA_BASE_ID`
- Fallback (texto): parse de `descrição` no formato `X → Y` ou `X -> Y`
  - se `Y` (normalizado) ∈ {`novo lead`, `oportunidade`} então `ENTER = true`

#### EXIT da etapa-base
- Preferencial (estruturado): `etapa_anterior == ETAPA_BASE_ID`
- Fallback (texto): parse de `descrição`
  - se `X` (normalizado) ∈ {`novo lead`, `oportunidade`} então `EXIT = true`

**Normalização recomendada**:
- `lower()`
- remover acentos
- colapsar espaços

---

### Pareamento ENTER→EXIT (1 FRT por lead)
Para cada `lead`:
1) ordenar eventos por `created_at` asc
2) ao encontrar o primeiro **ENTER**, salvar:
   - `enteredAt`
   - `enteredVendor` (se `vendedor_id` existir no ENTER)
3) ao encontrar o primeiro **EXIT** **após** esse enter:
   - `exitAt`
   - `diffMin = (exitAt - enteredAt) / 60000`
   - marcar o lead como “done” (não calcular novamente no período)

---

### Guardrails (sanidade)
- Ignorar `diffMin <= 0`
- Ignorar `diffMin >= 43200` (30 dias)

> Nota (apenas no **ranking de vendedores** do widget): além dos guardrails acima, o ranking **ignora FRT ≤ 1 minuto** e considera apenas eventos com `diffMin > 1`, para evitar “FRTs quase-zero” que distorcem a média.

---

### Atribuição do vendedor (prioridade)
Para cada FRT calculado (por lead), definir `sellerId` por prioridade:
1) `vendedor_id` do **EXIT**
2) `enteredVendor` (vendedor capturado no ENTER)
3) `leads.vendedorResponsavel` (lookup na tabela `leads`)

---

### Filtro por vendedor (quando aplicável)
Se houver um vendedor selecionado (`selectedSeller`):
- manter apenas eventos cujo `sellerId == selectedSeller`

---

## Saídas (agregações)

### 1) FRT Global (média + SLA)
Com todos os `diffMin` válidos:
- **média**: `avgFRT = round(sum(diffMin) / count)`
- **SLA <= 20 min**:
  - `within = count(diffMin <= 20)`
  - `slaPct = round(100 * within / count)`

### 2) FRT Individual (por vendedor)
Agrupar por `sellerId`:
- `frtSum += diffMin`
- `frtCount += 1`
- `avgFRT_seller = round(frtSum / frtCount)` quando `frtCount > 0`, senão `--`

Ordenação recomendada (ranking de FRT):
- **ascendente** (menor FRT = melhor)

---

### Pseudocódigo (alto nível)
```text
inputs: hardcutStartUtcIso, nowUtcIso, etapaBaseId, selectedSeller (opcional)

1) buscar logs relevantes:
   loogsLeads where created_at between hardcutStart and now
     and (etapa_anterior=base OR etapa_posterior=base OR descricao menciona aliases)

2) agrupar logs por lead e ordenar por created_at

3) para cada lead:
   achar primeiro ENTER
   achar primeiro EXIT depois do ENTER
   diffMin = (exit-enter)/60000
   aplicar guardrails (0 < diff < 43200)
   sellerId = exit.vendedor_id || enter.vendedor_id || leads.vendedorResponsavel
   se selectedSeller -> filtrar

4) global:
   avgFRT = round(avg(diffMin))
   sla20 = round(100 * avg(diffMin<=20))

5) por vendedor:
   agrupar diffMin por sellerId e calcular avg por grupo (round)
```

