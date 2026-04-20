## Métrica FRT (First Response Time) — `dashboard_tela`

Este documento descreve, de forma **não técnica** e **técnica**, como o widget `dashboard_tela` calcula a métrica **FRT** (tempo de primeira resposta) tanto no **total** (SLA do dashboard) quanto por **executivo** (ranking/pipeline).

Arquivos relevantes:
- `public/widgets/dashboard_tela/form.js`
- `public/widgets/dashboard_tela/form.html`
- `public/widgets/dashboard_tela/form.css`

---

### 1) Visão não técnica (para negócio)

#### 1.1 O que é FRT neste dashboard
O FRT mede **quanto tempo leva para um lead “recém-chegado” avançar pela primeira vez**.

Na prática, o dashboard considera que o lead “chegou” quando ele entrou na etapa **“Oportunidade”** (nome antigo: “Novo Lead”) e considera que houve “primeira resposta” quando ele **sai dessa etapa pela primeira vez**.

#### 1.2 FRT Total (visão geral do time)
Importante (regra hardcoded):
- Para **FRT**, o início do período é forçado para **15/01/2026 12:00 (America/Sao_Paulo)**, independentemente do filtro de datas escolhido no header.
No dashboard, o FRT:
- identifica os leads que **saíram da etapa “Oportunidade”**;
- calcula, para cada lead, o tempo em minutos entre “entrada em Oportunidade” e “primeira saída de Oportunidade”;
- mostra a **média do FRT** (em minutos) no card de SLA;
- calcula também um **SLA**: % de leads cujo FRT ficou **≤ 20 minutos**.

Interpretação:
- **quanto menor**, melhor (o time respondeu mais rápido);
- **SLA** (≤ 20 min) alto indica consistência na primeira resposta.

#### 1.3 FRT Individual (por executivo)
O dashboard faz o mesmo cálculo lead a lead e depois:
- atribui cada lead ao **executivo responsável** do lead;
- calcula a **média do FRT** para cada executivo no período;
- exibe essa média nas visões de ranking/pipeline (e pode ordenar por FRT, onde **menor é melhor**).

---

### 2) Definição técnica (regra formal)

#### 2.1 Definição de “entrada” e “saída” de Oportunidade (antigo “Novo Lead”)
O código usa a tabela de logs `loogsLeads` e a tabela `etapa`:

- **EtapaBaseId** = ID fixo da etapa **“Oportunidade”**: `a6709949-9857-4b25-965d-b4bf8270426b`.
  (Esse ID foi consultado no Supabase e colocado como constante no código para evitar drift por renome de etapa.)

- **Hardcut FRT (sobrepõe filtros)**:
  - início obrigatório: **15/01/2026 12:00 America/Sao_Paulo**
  - equivalente em UTC: `2026-01-15T15:00:00.000Z`
  - fim: “agora” (momento da consulta)

- **Saída da etapa-base** (por lead): o primeiro registro (menor `created_at`) em `loogsLeads` onde:
  - `etapa_anterior = EtapaBaseId`
  - `lead` não nulo
  - `created_at` dentro do período do header (start..end)

- **Entrada na etapa-base** (por lead): o primeiro registro (menor `created_at`) em `loogsLeads` onde:
  - `etapa_posterior = EtapaBaseId`
  - `lead` não nulo
  - *no SLA total*: `created_at` também dentro do período (start..end)

- **Fallback de entrada**: se não existir “entrada via log”, o código usa `leads.created_at` como entrada.

#### 2.2 Fórmula do FRT por lead
Para cada lead com entrada e saída válidas:

\[
FRT_{lead} = \frac{dataHoraSaidaEtapaBase - dataHoraEntradaEtapaBase}{60\,000}
\]

Onde o resultado é em **minutos**.

#### 2.3 Guardrails (exclusões)
O código descarta casos em que:
- `diffMinutes <= 0` (tempo negativo/zero)
- `diffMinutes >= 43200` (>= 30 dias), para evitar outliers ou dados inconsistentes.

---

### 3) Como o FRT Total é calculado (SLA do dashboard)

Local: `fetchSLAs()` em `public/widgets/dashboard_tela/form.js`.

#### 3.1 Agregações
O SLA total mantém:
- `frtTotalMinutes`: soma dos `diffMinutes` aceitos
- `frtCount`: quantidade de leads válidos
- `frtWithin`: quantidade de leads com `diffMinutes <= 20`

#### 3.2 Resultado exibido
- **Média (minutos)**:
  - `avgFRT = round(frtTotalMinutes / frtCount)` (se `frtCount > 0`, senão 0)
- **SLA (percentual)**:
  - `slaFRT = round((frtWithin / frtCount) * 100)` (se `frtCount > 0`, senão 0)

#### 3.3 Regra extra importante (fallback de entrada)
Se **não existe log de entrada** na etapa-base (“Oportunidade”) para o lead (`entryByLead[leadId]` não existe), o código só considera o lead se:
- `leads.created_at` estiver dentro do período `start..end`.

Isso evita “puxar” leads antigos como entrada e inflar o tempo.

---

### 4) Como o FRT Individual é calculado (por executivo no ranking/pipeline)

Local: `fetchRankingData()` em `public/widgets/dashboard_tela/form.js`.

#### 4.1 Atribuição por executivo
O cálculo por lead é atribuído ao executivo via:
- `leads.vendedorResponsavel`

O acumulador por vendedor mantém:
- `frtSum`
- `frtCount`

#### 4.2 Resultado exibido por vendedor
Para cada vendedor:
- `avgFRT = round(frtSum / frtCount)` quando `frtCount > 0`, senão `'-'`

Observação:
- No ranking individual, o código calcula **média**, mas **não calcula o SLA ≤ 20min por vendedor**.

---

### 5) Diferenças práticas entre Total e Individual (por que podem divergir)

Mesmo com a mesma “ideia”, total e individual podem divergir por detalhes de filtro:

- **SLA total** aplica `gte/lte start..end` também no log de **entrada** (`qEntry`).
- **Ranking individual** monta o `qEntry` com `applyCutoffTimestamp`, mas pode não aplicar o mesmo recorte `start..end` em todos os trechos; isso pode puxar uma entrada mais antiga para alguns leads.
- O SLA total tem regra extra de fallback: se não há log de entrada, só aceita se `lead.created_at` está dentro do período.

Impacto:
- Em alguns cenários, o FRT individual pode ficar maior/menor que o total por causa de entradas fora do range ou ausência de logs.

---

### 6) Regras de interpretação

- FRT é uma métrica onde **menor é melhor**.
- A “meta” usada pelo card de SLA (visual) para FRT é **20 minutos**.

---

### 7) Recomendações (se você quiser deixar a métrica mais consistente)

- **Uniformizar os filtros de data** do `qEntry` no ranking para bater com o SLA total (aplicar `gte/lte start..end` no mesmo padrão).
- Implementar também **SLA ≤ 20min por vendedor** (não só média), para comparar consistência.
- Se o time quiser medir “primeira resposta humana” (não só mudança de etapa), a definição precisaria mudar (ex.: usar eventos de contato/atividade).

