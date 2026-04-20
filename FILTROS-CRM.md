# FILTROS-CRM — Regras de Filtragem Exatas por Visão

> Gerado a partir do código-fonte dos widgets `dashboard/form.js` e `dashboard_tela/form.js`.
> Apenas o que existe no código — sem suposições.

---

## 1. Leads Ativos de um Vendedor

### Leads Captados (novos no CRM)

| Item | Detalhe |
|------|---------|
| **Tabela** | `leads` |
| **Filtro principal** | `novo_crm = true` |
| **Período** | `data_oportunidade >= start AND data_oportunidade < end` |
| **Vendedor** | `vendedorResponsavel = selectedSeller` |
| **Cutoff** | `applyCutoffTimestamp` em `data_oportunidade` |
| **Agência** | `applyAgencyFilterToLeadQuery` |

### Leads Prioridade (em negociação ativa)

| Item | Detalhe |
|------|---------|
| **Tabela** | `leads` |
| **Filtro principal** | `passou_prioridade = true` |
| **Período** | `data_oportunidade >= start AND data_oportunidade <= end` |
| **Vendedor** | `vendedorResponsavel = selectedSeller` |
| **Cutoff** | `applyCutoffTimestamp` em `data_oportunidade` |
| **Agência** | `applyAgencyFilterToLeadQuery` |
| **Exclui importados** | `applyNotImportedLeadFilter` |

### Filtro de exclusão de importados (`applyNotImportedLeadFilter`)

```
OR(
  csv_import IS NULL,
  csv_import != true,
  is_external_imported = true,
  tag_lead = 'import leads meta',
  tag_lead = 'Meta Leads Fev/2026'
)
```

Leads com `csv_import = true` são excluídos, **exceto** se tiverem `is_external_imported = true` ou tags de importação Meta.

### Funil de qualificação (6 estágios)

| Estágio | Filtro |
|---------|--------|
| 1. Captados | `novo_crm = true` |
| 2. Oportunidades | `possui_cnpj = true` |
| 3. Prioridade | `passou_prioridade = true` |
| 4. Reunião | cruzamento com `agendamento` |
| 5. Proposta | cruzamento com `imagemProposta` |
| 6. Venda | cruzamento com `compras` (aprovadas) |

---

## 2. Vendas Realizadas (Compras Válidas)

### Tabela: `compras`

### Filtro de aprovação (`applyApprovedPurchaseFilter`)

```javascript
vendaaprovada = true
AND (checkout_status = 'pago' OR clicksign_status = 'Assinado')
AND is_test != true   // quando coluna existe
```

### Classificação de status

| Cenário | Contabiliza no faturamento? |
|---------|---------------------------|
| `vendaaprovada = true` + `checkout_status = 'pago'` | **SIM** |
| `vendaaprovada = true` + `clicksign_status = 'Assinado'` | **SIM** |
| `vendaaprovada = true` + ambos | **SIM** |
| `vendaaprovada = true` + sem pagamento/assinatura | **NAO** (em aprovacao) |
| `vendaaprovada = false` ou `NULL` | **NAO** |
| `is_test = true` | **NAO** |

### Filtro Pipeline (diferente de faturamento)

```javascript
// Pipeline: apenas vendaaprovada=true, SEM exigir checkout/clicksign
vendaaprovada = true
AND is_test != true
```

### Filtro de teste (`applyNotTestPurchaseFilter`)

```javascript
is_test IS NOT true
```

### Campos utilizados

| Campo | Tipo | Valores |
|-------|------|---------|
| `vendaaprovada` | boolean | `true` = aprovada |
| `checkout_status` | string | `'pago'` = pagamento realizado |
| `clicksign_status` | string | `'Assinado'` = contrato assinado |
| `is_test` | boolean | `true` = compra de teste (excluída) |
| `valor_total` | decimal | valor da venda |
| `data_compra` | timestamp | data usada para período (NÃO `created_at`) |
| `vendedoresponsavel` | string | UUID do vendedor |
| `statuscompra` | string | exibido na UI, **NÃO usado nos filtros** |

> **Nota histórica (v168):** antes o filtro aceitava `vendaaprovada = NULL` como aprovada. Desde v168 exige `vendaaprovada = true` explicitamente.

---

## 3. Reunioes Realizadas

### Tabela: `agendamento`

### Definição de "realizada" (`isDailyReportRealized`)

Uma reunião é considerada **realizada** quando:

| Tipo | Condição |
|------|----------|
| **Ligação** (`tipo_agendamento = 'a23a700b-673e-4e7f-afed-8f0eb56c1455'`) | Sempre conta como realizada |
| **Meet/Presencial** (qualquer outro tipo) | `score_final` preenchido (não `null`, não `undefined`, não `''`) |

```javascript
function isDailyReportRealized(row) {
  if (row.tipo_agendamento === LIGACAO_TIPO_ID) return true;
  return row.score_final !== null && row.score_final !== undefined && row.score_final !== '';
}
```

### Filtro de cancelamento (`applyMeetingNotCanceledFilter`)

```
statusReuniao IS NULL OR statusReuniao != 'Cancelada'
```

- Valor exato de cancelamento: `'Cancelada'` (case-sensitive, com trim)
- `NULL` é tratado como válido (não cancelada)
- **NÃO existe** valor `'Realizada'` usado como filtro — a realização é determinada pelo `score_final`

### Reunião válida para métricas (`isValidMeeting`)

```javascript
function isValidMeeting(row) {
  if (row.tipo_agendamento === LIGACAO_TIPO_ID) return true;
  if (row.score_final !== null && row.score_final !== undefined && row.score_final !== '') return true;
  return false;
}
```

Reuniões sem `score_final` e que não são ligação **NÃO entram nas métricas**.

### Filtro de agendadas

```javascript
statusReuniao = 'agendado'  // usado para contar reuniões pendentes
```

### Campos utilizados

| Campo | Tipo | Valores relevantes |
|-------|------|--------------------|
| `statusReuniao` | string | `'Cancelada'`, `'agendado'`, `NULL` |
| `score_final` | mixed | preenchido = realizada (para meets) |
| `tipo_agendamento` | UUID | `'a23a700b-...'` = Ligação |
| `data` | date | formato `YYYY-MM-DD` |
| `vendedor` | string | UUID do vendedor |

---

## 4. Performance do Mes (Faturamento Realizado)

### Fonte de dados

| Item | Detalhe |
|------|---------|
| **Tabela** | `compras` |
| **Campo de valor** | `valor_total` (somado via `parseCurrency`) |
| **Campo de data** | `data_compra` (NÃO `created_at`) |
| **Acumulação** | Running total (soma acumulada dia a dia) |

### Filtros aplicados (nesta ordem)

1. `applyApprovedPurchaseFilter()` — `vendaaprovada = true` AND (`checkout_status = 'pago'` OR `clicksign_status = 'Assinado'`) AND `is_test != true`
2. `applyCutoffTimestamp(query, 'data_compra')` — cutoff de data
3. `.gte('data_compra', start).lte('data_compra', end)` — período selecionado
4. `.eq('vendedoresponsavel', selectedSeller)` — vendedor (se selecionado)
5. `filterRowsByAgencyViaLeadId()` — agência (post-fetch via leads)

### O que entra e o que NÃO entra

| Cenário | Entra no faturamento? |
|---------|----------------------|
| Aprovada + paga | **SIM** |
| Aprovada + assinada | **SIM** |
| Aprovada + pendente (sem pago/assinado) | **NAO** |
| Não aprovada | **NAO** |
| Compra de teste | **NAO** |

**Vendas pendentes NÃO entram no faturamento realizado.**

### Comparação mensal

- Mês atual: MTD (dia 1 até hoje)
- Mês anterior: mesmo range de dias (dia 1 até mesmo dia do mês anterior)

### Meta (goal)

| Modo | Cálculo |
|------|---------|
| Linear (padrão) | `metaTotal / totalDias` — linha reta |
| Monthly Steps (ciclos) | Meta % por ciclo (ex: dias 1-7 = 20%) — linha em degraus |
| Cycle Fixed | Meta fixa após início do ciclo — linha horizontal |

---

## 5. Leads Quentes / Priorizados

### Definição

O sistema **NÃO usa temperatura, indexTemperatura, ou escala quente/morno/frio**.

Leads "quentes" = **Leads Prioridade**: `leads.passou_prioridade = true`

### Tabela: `leads`

### Filtro completo

```javascript
leads.passou_prioridade = true
+ applyNotImportedLeadFilter()     // exclui CSV imports
+ applyCutoffTimestamp('data_oportunidade')
+ data_oportunidade >= start AND data_oportunidade <= end
+ vendedorResponsavel = selectedSeller  // se selecionado
+ applyAgencyFilterToLeadQuery()
```

### Conversão Prioridade (KPI)

```
Conversão = (Vendas de leads com passou_prioridade=true) / (Total de vendas) × 100
```

Cruza `leadid` das compras aprovadas com `leads.passou_prioridade = true`.

### Posição no funil

Prioridade é o **3o estágio** do funil:
1. Captados (`novo_crm = true`)
2. Oportunidades (`possui_cnpj = true`)
3. **Prioridade** (`passou_prioridade = true`)

---

## 6. Propostas Enviadas

### Tabela: `imagemProposta`

### Filtro principal

**NÃO existe filtro por `statusProposta` ou qualquer campo de status.** Toda proposta criada no período é contada.

```javascript
// Query base
sbClient.from('imagemProposta')
  .select('id, id_vendedor, id_lead')
  .gte('created_at', rangeStartIso)
  .lte('created_at', rangeEndIso)
```

### Filtros aplicados

| Filtro | Detalhe |
|--------|---------|
| **Período** | `created_at >= start AND created_at <= end` |
| **Vendedor** | `id_vendedor = selectedSeller` (se selecionado) |
| **Agência** | `filterRowsByAgencyViaLeadId` (post-fetch via `id_lead`) |
| **Exclui diretores** | `id_vendedor NOT IN directorIds` |
| **Deduplicação** | 1 proposta por `id_lead` (via `Set`) |

### O que NÃO é filtrado

- **NÃO filtra por status** — não há campo de status usado
- **NÃO diferencia** entre proposta enviada, rascunho, ou qualquer outro estado
- O label "Propostas Enviadas" na UI é apenas texto — a lógica conta **todas** as propostas criadas

### Tooltip do KPI

> "Propostas comerciais enviadas no período. Critérios: Conta 1 proposta por lead (sem duplicar). Qualquer proposta gerada no período."

---

## Resumo Geral — Campos-chave por Visão

| Visão | Tabela | Campo-chave | Valor |
|-------|--------|-------------|-------|
| Leads captados | `leads` | `novo_crm` | `true` |
| Leads prioridade | `leads` | `passou_prioridade` | `true` |
| Oportunidades | `leads` | `possui_cnpj` | `true` |
| Vendas (faturamento) | `compras` | `vendaaprovada` + `checkout_status` / `clicksign_status` | `true` + `'pago'` / `'Assinado'` |
| Vendas (pipeline) | `compras` | `vendaaprovada` | `true` |
| Reuniões realizadas | `agendamento` | `score_final` (meets) ou `tipo_agendamento` (ligação) | preenchido / UUID específico |
| Reuniões canceladas | `agendamento` | `statusReuniao` | `'Cancelada'` |
| Propostas | `imagemProposta` | `created_at` (sem filtro de status) | período |
| Excluir testes | `compras` | `is_test` | `true` (excluído) |
| Excluir imports | `leads` | `csv_import` | `true` (excluído, com exceções) |
