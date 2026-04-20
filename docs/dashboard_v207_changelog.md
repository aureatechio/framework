# Dashboard v207 — Changelog de Modificações

## 1. Card "Reuniões Hoje" — Espaçamento (CSS + HTML)

### form.css
- Removeu `margin-bottom: 12px` do `.meeting-card`, ajustou padding para `12px 14px`, gap para `14px`
- Adicionou `.meeting-card.created-today` (tema roxo: `rgba(139,92,246,...)` + dark mode)

### form.html
- Container de reuniões: `gap-2` → `gap-3`
- Título: `mb-4` → `mb-2`

---

## 2. KPI "Oportunidades" — Mudança de query (v204)

**Antes:** `leads WHERE vendedorResponsavel IS NOT NULL` (~49k)
**Agora:** `loogsLeads WHERE etapa_posterior = ETAPA_OPORTUNIDADE_ID`, contando leads DISTINTOS

```js
const ETAPA_OPORTUNIDADE_ID = 'a6709949-9857-4b25-965d-b4bf8270426b';

let q = sbClient
  .from('loogsLeads')
  .select('lead, vendedor_id')
  .eq('etapa_posterior', ETAPA_OPORTUNIDADE_ID)
  .not('lead', 'is', null);
q = applyCutoffTimestamp(q, 'created_at').gte('created_at', start).lte('created_at', end);
if (state.selectedSeller) q = q.eq('vendedor_id', state.selectedSeller);
const { data } = await q;
let rows = await filterRowsByAgencyViaLeadId((data || []), (r) => r && r.lead);
const uniqueLeads = new Set(rows.map(r => r && r.lead).filter(Boolean));
return uniqueLeads.size;
```

---

## 3. Metas fixas por vendedor (v205)

```js
const DEFAULT_META_PROPOSTAS = 160;  // era 100
const DEFAULT_META_REUNIOES = 80;    // era 50
```

---

## 4. Meta global = soma das individuais (v206)

**Removido:** fetch de `crm_metas_geral_mes`
**Agora:** global = soma dos `sellerMap[].metaPropostas` e `sellerMap[].metaReunioes`

---

## 5. Meta global só soma vendedores com elegivel_rotacao (v206)

Adicionado `elegivel_rotacao` ao SELECT de vendedores:

```js
.select('id, nome, perfil_img, diretorVendas, elegivel_rotacao')
```

sellerMap armazena:

```js
elegivelRotacao: s.elegivel_rotacao !== false,
```

Soma global condicional:

```js
if (s.elegivelRotacao) {
  globalPropostasMeta += s.metaPropostas;
  globalReunioesMeta += s.metaReunioes;
}
```

---

## 6. KPI Propostas — COUNT total sem deduplicar (v207)

**Antes:** Contava leads ÚNICOS com proposta (dedup por `id_lead`, fallback `vendedorResponsavel`)
**Agora:** COUNT total de `imagemProposta` por `id_vendedor`

### KPI card

```js
let qProps = sbClient
  .from('imagemProposta')
  .select('id, id_vendedor, id_lead');
qProps = applyCutoffTimestamp(qProps, 'created_at')
  .gte('created_at', rangeStartIso)
  .lte('created_at', rangeEndIso);
if (state.selectedSeller) {
  qProps = qProps.eq('id_vendedor', state.selectedSeller);
}
const { data: propsRaw } = await qProps;
let props = await filterRowsByAgencyViaLeadId((propsRaw || []), (p) => p && p.id_lead);
props = (props || []).filter(p => p && p.id_vendedor && !directorIds.includes(p.id_vendedor));
return props.length;
```

### Ranking metas

```js
let proposalsQuery = sbClient
  .from('imagemProposta')
  .select('id, id_vendedor, id_lead');
// ... mesmo range e cutoff

const proposalCountBySeller = {};
proposals.forEach(p => {
  if (p.id_vendedor) {
    const sid = String(p.id_vendedor);
    proposalCountBySeller[sid] = (proposalCountBySeller[sid] || 0) + 1;
  }
});

Object.keys(sellerMap).forEach(sid => {
  sellerMap[sid].propostas = proposalCountBySeller[sid] || 0;
});
```

---

## 7. KPI Reuniões — Remove filtro de canceladas, mantém score IA + Ligação (v207)

**Removido:** `applyMeetingNotCanceledFilter(q)` (não filtra mais por `statusReuniao`)
**Mantido:** `isValidMeeting` (score_final preenchido OU tipo_agendamento = Ligação)

### KPI card

```js
let q = sbClient
  .from('agendamento')
  .select('leadId, vendedor, score_final, tipo_agendamento')
  .not('leadId', 'is', null);
q = applyCutoffDateYmd(q, 'data').gte('data', startYmd).lte('data', endYmd);
if (state.selectedSeller) q = q.eq('vendedor', state.selectedSeller);
const { data } = await q;
const rows = await filterRowsByAgencyViaLeadId((data || []), (r) => r && r.leadId);
let filteredRows = (rows || []).filter(r => !directorIds.includes(r.vendedor));
filteredRows = filteredRows.filter(isValidMeeting);
return filteredRows.length;
```

### Ranking metas

```js
let meetingsQuery = sbClient
  .from('agendamento')
  .select('vendedor, leadId, score_final, tipo_agendamento')
  .not('leadId', 'is', null);
// ... mesmo range e cutoff, SEM applyMeetingNotCanceledFilter

meetings.forEach(m => {
  if (m.vendedor && sellerMap[m.vendedor]) {
    if (!isValidMeeting(m)) return;
    sellerMap[m.vendedor].reunioes++;
  }
});
```

### Card lateral, Acontecendo agora, Criadas hoje

Mesmo filtro: `isValidMeeting` (score IA ou Ligação), sem filtrar por canceladas.

---

## 8. Exclusão de vendedores — Inclui usuarioInterno (v207)

**Antes:** `directorIds` só tinha diretores (`diretorVendas=true`)
**Agora:** Inclui diretores E usuários internos:

```js
const { data: excluded } = await sbClient
  .from('vendedores')
  .select('id')
  .or('diretorVendas.eq.true,usuarioInterno.eq.true');
directorIds = (excluded || []).map(d => d.id).filter(Boolean);
```

Aplicado em 3 pontos: KPI cards, card lateral de reuniões, e pipeline.

---

## Resumo de filtros finais

| Componente | Tabela | Filtros |
|---|---|---|
| **Oportunidades (KPI)** | `loogsLeads` | `etapa_posterior = OPORTUNIDADE_ID`, leads distintos, exclui diretores+internos |
| **Propostas (KPI + Metas)** | `imagemProposta` | COUNT total por `id_vendedor`, exclui diretores+internos |
| **Reuniões (KPI + Metas + Card)** | `agendamento` | `isValidMeeting` (score IA ou Ligação), sem filtro de canceladas, exclui diretores+internos |
| **Meta global** | — | Soma metas apenas de vendedores com `elegivel_rotacao = true` |
| **Metas individuais** | `crm_metas_vendedor_mes` | Fallback: propostas=160, reuniões=80 |
