## Tempo da Proposta (SLA 6h) — Filtro e cálculo — `dashboard_tela`

Este documento descreve como o widget **`dashboard_tela`** calcula a métrica **Tempo da Proposta** (SLA **6 horas**) após a mudança mais recente.

> Versão com esta lógica: **`dashboard_tela v108`**.

---

### Objetivo da métrica
Medir, para cada lead, **quanto tempo (em horas úteis)** leva para ele **receber a primeira proposta** depois de **entrar em uma etapa específica** do funil.

---

### Etapa âncora (início do relógio)
- **Etapa ID (hardcoded)**: `a22c3ad3-6093-4c57-a633-da16a5b4514c`
- **Fonte**: tabela `loogsLeads`
- **Condição de entrada na etapa**: `loogsLeads.etapa_posterior = <ETAPA_ID>`

#### Definição de \(t0\)
- \(t0\) = **primeiro** `loogsLeads.created_at` em que o lead entrou nessa etapa (primeira ocorrência).

Importante:
- Consideramos **somente a primeira vez** que o lead entra na etapa, para não “resetar” o relógio.
- O lead só entra na métrica se \(t0\) ocorreu **dentro do período do header** (`start..end` do filtro atual).

---

### Proposta (fim do relógio)
- **Fonte**: tabela `imagemProposta`
- **Chave do lead**: `imagemProposta.id_lead`

#### Definição de \(t1\)
- \(t1\) = **primeiro** `imagemProposta.created_at` do lead tal que `created_at > t0`.

Observação:
- \(t1\) **pode ocorrer depois do fim do período** do header. O período do header decide a elegibilidade pelo \(t0\); a proposta pode chegar depois.

---

### Cálculo do tempo (horas úteis)

O delta é calculado em **horas úteis**, usando a mesma função/parametrização do widget:
- `__businessMinutesBetweenWeekdaysMs(t0Ms, t1Ms, __BUSINESS_HOURS_CFG) / 60`

#### Configuração do “horário útil”
Vem do Header do Bubble via `params.businessHours` (e já afeta também FRT/Follow-up):

```js
params: {
  businessHours: {
    start: "2026-01-15T09:00:00.000Z",
    end:   "2026-01-15T19:00:00.000Z",
    exclude_weekends: true
  }
}
```

- `start/end`: definem a janela diária (o código usa HH:MM via UTC).
- `exclude_weekends=true` (padrão): conta só seg–sex.
- `exclude_weekends=false`: conta seg–dom.

---

### Guardrails (sanidade)
Após calcular \( \Delta \) em horas úteis:
- Ignora se \(t1 \le t0\)
- Ignora se `diffHours >= 720` (30 dias), para evitar outliers

---

### SLA (meta)
- Um lead está **dentro do SLA** se `diffHours <= 6`.

Agregação exibida no dashboard:
- `avgProp = round(sum(diffHours) / count)`
- `slaPropPct = round(100 * count(diffHours <= 6) / count)`

---

### Filtro por vendedor (quando `selectedSeller` está setado)
O widget atribui/filtra a autoria do evento (lead) pela seguinte prioridade:
1) `imagemProposta.id_vendedor` (se existir na proposta)
2) `loogsLeads.vendedor_id` do log de entrada na etapa (t0)
3) `leads.vendedorResponsavel` (fallback)

Se `selectedSeller` estiver definido, só entram no cálculo os eventos cuja autoria final (sellerId) corresponda ao vendedor selecionado.

---

### Onde está no código
Arquivo: `public/widgets/dashboard_tela/form.js`

- Função: `fetchSLAs()`
- Bloco: `// --- 3. Tempo Proposta ---`
- Constante da etapa: `PROPOSAL_STAGE_ID = 'a22c3ad3-6093-4c57-a633-da16a5b4514c'`

