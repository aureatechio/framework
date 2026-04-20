# Funil do Dashboard — Documentacao de Calculo

> Referencia: `public/widgets/dashboard/form.js` — funcao `fetchFunnelData()` (linha ~6809)

---

## Visao Geral

O funil possui **6 etapas sequenciais**, renderizadas como barras horizontais com SVG gradiente. Cada etapa mostra:
- Valor absoluto
- Conversao sequencial (etapa atual / etapa anterior)
- Conversao global (etapa atual / Leads Captados)

---

## Etapas do Funil

### 1. Leads Captados
| Item | Detalhe |
|---|---|
| **Tabela** | `leads` |
| **Campo contado** | `lead_id` (count exact, head) |
| **Filtro principal** | `novo_crm = true` |
| **Periodo** | `data_oportunidade >= start` AND `data_oportunidade < end` |
| **Cutoff** | `applyCutoffTimestamp` em `data_oportunidade` |
| **Vendedor** | `vendedorResponsavel = selectedSeller` (se selecionado) |
| **Agencia** | `applyAgencyFilterToLeadQuery` |
| **Exclui importados** | Nao (diferente das taxas de conversao) |

### 2. Oportunidades
| Item | Detalhe |
|---|---|
| **Tabela** | `leads` |
| **Campo contado** | `lead_id` (count exact, head) |
| **Filtro principal** | `empresa IS NOT NULL` AND `empresa != ''` |
| **Periodo** | `created_at >= start` AND `created_at <= end` |
| **Cutoff** | `applyCutoffTimestamp` em `created_at` |
| **Vendedor** | `vendedorResponsavel = selectedSeller` |
| **Agencia** | `applyAgencyFilterToLeadQuery` |
| **Exclui importados** | `applyNotImportedLeadFilter` |

### 3. Prioridade
| Item | Detalhe |
|---|---|
| **Tabela** | `leads` |
| **Campo contado** | `lead_id` (count exact, head) |
| **Filtro principal** | `passou_prioridade = true` |
| **Periodo** | `created_at >= start` AND `created_at <= end` |
| **Cutoff** | `applyCutoffTimestamp` em `created_at` |
| **Vendedor** | `vendedorResponsavel = selectedSeller` |
| **Agencia** | `applyAgencyFilterToLeadQuery` |
| **Exclui importados** | `applyNotImportedLeadFilter` |

### 4. Propostas
| Item | Detalhe |
|---|---|
| **Tabela** | `imagemProposta` |
| **Campo contado** | **Leads unicos** (`id_lead`) — nao conta propostas duplicadas por lead |
| **Periodo** | `created_at >= start` AND `created_at <= end` |
| **Cutoff** | `applyCutoffTimestamp` em `created_at` |
| **Vendedor** | `id_vendedor = selectedSeller` OR `id_vendedor IS NULL` (fallback) |
| **Agencia** | `filterRowsByAgencyViaLeadId` (filtra via leadId) |
| **Exclui diretores** | Sim — propostas com `id_vendedor` em lista de diretores/internos sao removidas |

**Logica de fallback para vendedor:**
1. Se a proposta tem `id_vendedor` → usa direto (exclui se for diretor)
2. Se `id_vendedor` e null → busca `vendedorResponsavel` na tabela `leads` pelo `lead_id`
3. Contagem final: Set de leads unicos agrupados por vendedor

### 5. Reunioes
| Item | Detalhe |
|---|---|
| **Tabela** | `agendamento` |
| **Campos** | `leadId, vendedor, score_final, tipo_agendamento` |
| **Periodo** | `data >= meetingsRange.startYmd` AND `data <= meetingsRange.endYmd` (usa `getMeetingsDateRange`) |
| **Canceladas** | Excluidas via `applyMeetingNotCanceledFilter` |
| **Vendedor** | `vendedor = selectedSeller` |
| **Agencia** | `filterRowsByAgencyViaLeadId` (filtra via leadId) |
| **Exclui diretores** | Sim — `vendedor` na lista de diretores/internos |
| **Validade** | Somente reunioes que passam em `isValidMeeting` (score preenchido OU tipo Ligacao) |

**Nota:** O range de datas para reunioes pode diferir do range geral (usa `getMeetingsDateRange` em vez de `getDateRange`).

### 6. Vendas
| Item | Detalhe |
|---|---|
| **Tabela** | `compras` |
| **Campo contado** | Linhas totais (nao deduplica por lead) |
| **Filtro principal** | `applyApprovedPurchaseFilter` (somente compras aprovadas) |
| **Periodo** | `data_compra >= start` AND `data_compra <= end` |
| **Cutoff** | `applyCutoffTimestamp` em `data_compra` E `created_at` (duplo cutoff) |
| **Vendedor** | `vendedoresponsavel = selectedSeller` |
| **Agencia** | `filterRowsByAgencyViaLeadId` (filtra via leadid) |
| **leadid** | `leadid IS NOT NULL` |

---

## Filtros Globais Compartilhados

| Filtro | Descricao | Aplicado em |
|---|---|---|
| `applyAgencyFilterToLeadQuery` | Filtra leads pela agencia selecionada (direto na query) | Leads Captados, Oportunidades, Prioridade |
| `filterRowsByAgencyViaLeadId` | Filtra rows pos-query pela agencia do lead associado | Propostas, Reunioes, Vendas |
| `applyNotImportedLeadFilter` | Remove leads importados | Oportunidades, Prioridade (NAO em Leads Captados) |
| `applyCutoffTimestamp` | Aplica cutoff temporal para consistencia | Todas as etapas |
| **Diretores/Internos** | Exclui IDs de `vendedores` com `diretorVendas=true` ou `usuarioInterno=true` | Propostas, Reunioes |

---

## Calculo de Conversoes

```
Para cada etapa i (0 = Leads Captados):

  Conversao Sequencial = (etapa[i].valor / etapa[i-1].valor) * 100   // 2 casas decimais
  Conversao Global     = (etapa[i].valor / etapa[0].valor) * 100     // 2 casas decimais, clamped 0-100

  Para i = 0: ambas = 100%
```

---

## Taxas de Conversao (secao separada)

> Funcao `fetchConversionRates()` (linha ~6977)

Calcula 3 taxas independentes, todas sobre o **denominador unico**: total de leads captados por `created_at` no periodo (com `applyNotImportedLeadFilter`).

| Taxa | Numerador | Descricao |
|---|---|---|
| **Taxa Lead** | Leads com `vendedorResponsavel IS NOT NULL` | % de leads que receberam um vendedor |
| **Taxa Reuniao** | Leads unicos com agendamento valido | % de leads que tiveram reuniao (usa `filterCapturedLeadIds` para garantir que o lead foi captado no periodo) |
| **Taxa Proposta** | Leads unicos com proposta em `imagemProposta` | % de leads que receberam proposta (mesma logica de fallback de vendedor) |

**Nota:** O denominador das taxas usa `created_at` e `applyNotImportedLeadFilter`, enquanto o funil usa `data_oportunidade` para Leads Captados. Isso pode gerar pequenas divergencias nos numeros.

---

## Divergencias Conhecidas

| Ponto | Funil | Taxas de Conversao |
|---|---|---|
| Campo de data para leads | `data_oportunidade` | `created_at` |
| Filtro de importados | Nao aplica em Leads Captados | `applyNotImportedLeadFilter` |
| Filtro `novo_crm` | `novo_crm = true` | Nao aplica |

---

*Atualizado em: 2026-03-23*
