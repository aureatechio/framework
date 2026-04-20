# Changelog — `dashboard_tela`

## `dashboard_tela` v251 — 2026-03-19

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-35b5222`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v251/git-35b5222.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v251/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v251/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v251/form.js`

### Mudanças

- `public/widgets/dashboard_tela/form.js`
  - **`applyNotImportedLeadFilter`** (L1896): Alinhado com dashboard principal — agora usa `.or()` para incluir leads importados com tags Meta (`import leads meta`, `Meta Leads Fev/2026`) em vez de excluir todos os CSV imports
  - **`countLeadsByCanal`** (L6054): Adicionado `applyAgencyFilterToLeadQuery(q)` para respeitar filtro de agência na contagem de leads por canal, igualando ao dashboard principal

---

## `dashboard_tela` v250 — 2026-03-12

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-8f1fab0`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v250/git-8f1fab0.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v250/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v250/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v250/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.html`
  - **L455**: Título "Performance por Canal" agora flex com badge `channel-period-badge` "Mês Atual"
  - **L456**: Grid de canais alterado de `md-grid-cols-4` → `md-grid-cols-2` (layout 2x2)
  - **L460-464**: Seção pipeline: título agora flex com `stage-dwell-subtitle` span; container trocado de `pipeline-diagram-scroll` → `stage-dwell-table-scroll`

- `public/widgets/dashboard_tela/form.css`
  - Adicionado `.channel-period-badge` (pill azul light/dark)
  - Adicionado bloco completo `.stage-dwell-*`: table-scroll, table, th/td, sticky-col, seller, avatar, seller-name, time-pill (5 cores light/dark), pill--empty
  - CSS antigo do pipeline mantido (dead code, limpeza futura)

- `public/widgets/dashboard_tela/form.js`
  - **State**: Adicionado `dwellStageColumns: []`
  - **Constantes**: `STAGE_DWELL_MAX_HOURS`, `KNOWN_STAGE_ORDER`, `AVATAR_PALETTE`
  - **Helpers**: `formatDwellTime(hours)`, `getSellerInitials(name)`, `sortStageColumns(stageNames)`
  - **`fetchStageDwellTimes()`**: Nova função — busca `loogsLeads`, calcula tempos por (vendedor, etapa), atualiza caches globais `state.sellerNameById`/`state.sellerImgById`
  - **`renderStageDwellTable()`**: Nova função — tabela HTML com sticky col, pills color-coded, avatares com iniciais
  - **Wiring**: `fetchPipelineData()` substituído por `fetchStageDwellTimes()` em ambos call sites
  - Funções antigas mantidas como dead code

### Resumo
Mesmas mudanças do wish-board v250: Performance por Canal 4→2 cols + badge, Tempos por Etapa reescrito como tabela de tempos reais do kanban CRM.

---

## `dashboard_tela` v129 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-9df5bb3`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v129/git-9df5bb3.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v129/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v129/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v129/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 6738-6785**: Adicionada nova projeção baseada nos últimos 15 dias
    - Calcula média diária dos últimos 15 dias de vendas
    - Projeta faturamento futuro baseado nessa média
    - Cria nova série "Projeção 15d" com dados projetados
    - Aplica apenas em modo diário (filtros mês/semestre)
  - **Linhas 7125-7133**: Atualizada configuração de cores e stroke do gráfico
    - Adiciona cor azul (#2563eb) para série "Projeção 15d"
    - Configura linha pontilhada (dashArray: 6) para a nova projeção
    - Mantém linha reta (straight) ao invés de suave (smooth)
  - **Linha 7269**: Atualizada busca de séries para excluir "Projeção 15d"

### Resumo

Implementação de linha azul pontilhada de projeção de faturamento baseada na média dos últimos 15 dias.

**Funcionalidade:**
- **Cálculo**: Calcula a média diária das vendas dos últimos 15 dias (ou menos se não houver 15 dias de dados)
- **Projeção**: Projeta o faturamento futuro do dia atual até o final do período usando essa média
- **Visual**: Linha azul (#2563eb) pontilhada que complementa a projeção existente (azul claro)
- **Contexto**: Fornece visão de curto prazo baseada em tendência recente vs. projeção geral baseada em todo o período

**Exemplo:**
- Se vendas dos últimos 15 dias = R$ 150k (média de R$ 10k/dia)
- E faltam 20 dias no período
- Projeção 15d = Faturamento atual + (R$ 10k × 20 dias)

**Diferença entre projeções:**
- **Projeção** (azul claro): Baseada em todos os dias do período até hoje
- **Projeção 15d** (azul escuro pontilhado): Baseada apenas nos últimos 15 dias (tendência recente)

---

## `dashboard_tela` v128 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-f850375`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v128/git-f850375.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v128/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v128/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v128/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 6817-6832**: Corrigida função `getDefaultIdx()` para calcular posição do marcador "hoje" em modo mensal:
    - Antes: Sempre retornava 0 (janeiro) quando não era modo diário
    - Depois: Calcula índice correto baseado no mês atual (YYYY-MM)
    - Adiciona fallback inteligente usando `currentMonth` se a busca no array falhar
    - Exemplo: Em fevereiro, marcador agora aparece em fevereiro ao invés de janeiro

### Resumo

Hotfix crítico para corrigir o posicionamento do marcador "hoje" no gráfico de faturamento em modo semestral (mensal). O problema ocorria porque:

1. **Problema**: O gráfico em modo semestral (jan-jul) usa formato mensal (isYearly=true), com `rawDates` contendo `["2026-01", "2026-02", ..., "2026-07"]`
2. **Bug**: A função `getDefaultIdx()` só calculava o índice correto para modo diário, retornando sempre 0 (janeiro) para modo mensal
3. **Sintoma**: Marcador "hoje" aparecia sempre em janeiro, mesmo estando em fevereiro

**Solução implementada:**
- Detecta se é modo mensal vs diário
- Para modo mensal: busca chave no formato YYYY-MM (ex: "2026-02")
- Para modo diário: mantém busca no formato YYYY-MM-DD (ex: "2026-02-02")
- Fallback inteligente usando `new Date().getMonth()` se a busca falhar

**Resultado:**
- Em fevereiro: marcador aparece em fevereiro ✅
- Em março: marcador aparece em março ✅
- E assim por diante...

---

## `dashboard_tela` v127 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-f19fdda`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v127/git-f19fdda.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v127/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v127/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v127/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 3150-3154**: Alterado modo semestral para período fixo janeiro-julho:
    - Antes: `new Date(y, m, 1)` até `new Date(y, m + 6, 0)` - próximos 6 meses dinâmicos a partir do mês atual
    - Depois: `new Date(y, 0, 1)` até `new Date(y, 7, 0)` - período fixo de 01/janeiro a 31/julho (7 meses)
    - Exemplo: Em qualquer mês de 2026, sempre mostra jan/2026 a jul/2026

### Resumo

Ajuste importante no comportamento do modo semestral do gráfico de faturamento. Agora usa um **período fixo** de janeiro a julho (7 meses) ao invés de um período dinâmico de 6 meses a partir do mês atual.

**Motivação:**
- Alinha com o semestre comercial/fiscal padrão
- Traz vendas desde o início do ano (janeiro)
- Permite acompanhamento consistente da meta anual
- Todos os usuários veem o mesmo período, independente do mês em que acessam

**Comportamento:**
- Janeiro: jan-jul
- Fevereiro: jan-jul ✅
- Março: jan-jul
- Julho: jan-jul
- Agosto: jan-jul (mostra período já finalizado)

Este é o comportamento padrão esperado para um gráfico de evolução de faturamento alinhado ao calendário fiscal/comercial.

---

## `dashboard_tela` v126 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-2b04fa2`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v126/git-2b04fa2.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v126/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v126/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v126/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 3150-3154**: Alterado cálculo do modo semestral para mostrar próximos 6 meses:
    - Antes: `new Date(y, m - 5, 1)` - iniciava 6 meses atrás (últimos 6 meses)
    - Depois: `new Date(y, m, 1)` - inicia no mês atual
    - Antes: `new Date(y, m + 1, 0)` - terminava no último dia do mês atual
    - Depois: `new Date(y, m + 6, 0)` - termina no último dia do 6º mês futuro
    - Exemplo: Em fev/2026, antes mostrava set/2025-fev/2026, agora mostra fev/2026-jul/2026

### Resumo

Mudança importante no comportamento do gráfico de faturamento em modo semestral. Agora mostra os **próximos 6 meses** (incluindo o mês atual) ao invés dos últimos 6 meses. Isso é mais adequado para um gráfico de "Evolução do Faturamento" com meta, pois permite visualizar:

1. **Posição atual**: Onde está o faturamento hoje
2. **Meta futura**: Onde precisa chegar nos próximos meses
3. **Projeção**: Tendência de crescimento para atingir a meta

**Exemplo:**
- **Antes (últimos 6 meses)**: Set/2025 → Fev/2026 (dados históricos)
- **Depois (próximos 6 meses)**: Fev/2026 → Jul/2026 (evolução e meta futura)

---

## `dashboard_tela` v125 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-979afb2`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v125/git-979afb2.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v125/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v125/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v125/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 3194-3195**: Simplificado cálculo do `lastYear` para sempre usar ano atual - 1:
    - Antes: `return new Date(lastYearMonthStart).getFullYear()` - pegava o ano da data inicial do range deslocado
    - Depois: `new Date().getFullYear() - 1` - sempre retorna ano atual - 1
    - Exemplo: Em fev/2026 com filtro semestral (set/2025 a fev/2026), mostrava "2024" (incorreto), agora mostra "2025" (correto)

### Resumo

Hotfix para corrigir o label da linha "Ano Passado" no gráfico de faturamento. O cálculo anterior usava o ano da data inicial do range deslocado, o que causava confusão em modo semestral/anual. Agora sempre mostra o ano correto: ano atual - 1 (2025 quando estamos em 2026).

---

## `dashboard_tela` v124 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-fd10ffd`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v124/git-fd10ffd.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v124/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v124/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v124/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 2261-2273**: Adicionada sincronização automática do `revenueChartMode` com `dateFilter`:
    - Quando o filtro do header é alterado para `month`, `semester` ou `year`, o gráfico de faturamento é automaticamente ajustado para o mesmo modo
    - Os botões do gráfico (Mês/Semestre/Ano) são atualizados visualmente para refletir a seleção
  - **Linha 3257**: Removido fallback problemático que usava `dataCurrRows` (baseado no filtro do header) quando `monthRowsFiltered` estava vazio:
    - Antes: `let chartLeads = (monthRowsFiltered && monthRowsFiltered.length) ? monthRowsFiltered : (dataCurrRows || []);`
    - Depois: `let chartLeads = monthRowsFiltered || [];`
    - Garante que o gráfico sempre use dados do `chartRange` correto (baseado em `revenueChartMode`)

### Resumo

Correção crítica para sincronizar o gráfico de faturamento com o filtro do header. Anteriormente, os dois controles eram completamente independentes:

**Problema anterior:**
- Filtro do header em "Semestre" (6 meses de dados)
- Gráfico de faturamento em "Mês" (1 mês de dados)
- Resultado: Linhas "Realizado" e "Ano Passado" mostravam dados de apenas 1 mês ao invés de 6 meses

**Solução implementada:**
1. **Sincronização automática**: Quando o usuário muda o filtro do header para Semestre/Ano/Mês, o gráfico de faturamento automaticamente muda para o mesmo modo
2. **Dados consistentes**: O gráfico sempre busca dados do período correto usando `chartRange` (sem fallback para dados do header)
3. **UX melhorada**: Os botões do gráfico são atualizados visualmente para refletir a sincronização

Agora, quando o dashboard carrega com filtro semestral (v121), tanto o gauge quanto o gráfico de faturamento mostram dados dos últimos 6 meses de forma consistente.

---

## `dashboard_tela` v123 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-08b7bf6`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v123/git-08b7bf6.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v123/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v123/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v123/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linhas 3735-3737**: Atualizado comentário para refletir que gauge agora respeita filtro de data
  - **Linha 3738**: Renomeada variável para `targetRevenueMonthly` para clareza
  - **Linhas 3741-3751**: Adicionada lógica para ajustar meta baseada no filtro selecionado:
    - `semester`: meta mensal x 6
    - `year`: meta mensal x 12
  - **Linhas 3754-3755**: Simplificada lógica para usar `currentRevenue`/`prevRevenue` que já respeitam o filtro
  - **Linhas 3743-3780 (removidas)**: Removida lógica antiga que forçava busca mensal independente do filtro
  - **Linhas 6454-6471**: Adicionada atualização dinâmica do label do gauge:
    - Semestre: "Meta Semestral (6 meses)"
    - Ano: "Meta Anual (2026)"
    - Mês: "Meta de [Mês Atual]"

### Resumo

Correção importante para fazer o velocímetro/gauge respeitar o filtro de período selecionado. Anteriormente, o gauge SEMPRE mostrava dados mensais, independente do filtro (comentário explícito: "SEMPRE MENSAL"). Agora:

1. **Dados corretos**: Quando filtro está em "Semestre", o gauge mostra faturamento dos últimos 6 meses
2. **Meta ajustada**: Meta mensal é multiplicada por 6 (semestre) ou 12 (ano) automaticamente
3. **Label dinâmico**: O texto acima do gauge atualiza para refletir o período (ex: "Meta Semestral (6 meses)")

Isso resolve o problema reportado onde o gauge iniciava zerado quando o filtro era semestral, pois estava comparando faturamento de 6 meses com meta de 1 mês apenas.

---

## `dashboard_tela` v122 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-a09b795`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v122/git-a09b795.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v122/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v122/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v122/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linha 4877**: Comentada chamada `renderGauge()` sem parâmetros durante inicialização do skeleton - Evita que o velocímetro apareça zerado (0%) antes dos dados serem carregados

### Resumo

Hotfix para corrigir velocímetro/gauge de meta iniciando em 0%. Removida a renderização inicial do gauge durante o skeleton/loading. Agora o velocímetro só aparece quando os dados reais são carregados via `fetchDataWithStamp()`, mostrando a porcentagem real da meta desde o início.

---

## `dashboard_tela` v121 — 2026-02-02

- **Nome (Bubble)**: `dashboard_tela`
- **widget_slug (repo)**: `dashboard_tela`
- **Code version**: `git-6654ca9`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/dashboard_tela/v121/git-6654ca9.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v121/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v121/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/dashboard_tela/v121/form.js`

### Mudanças (linha a linha)

- `public/widgets/dashboard_tela/form.js`
  - **Linha 842**: Alterado `dateFilter` de `'month'` para `'semester'` - Filtro principal do dashboard agora inicia em modo semestral (últimos 6 meses)
  - **Linha 846**: Alterado `revenueChartMode` de `'month'` para `'semester'` - Gráfico de faturamento agora inicia em modo semestral

- `public/widgets/dashboard_tela/form.html`
  - **Linha 115**: Removida classe `active` do botão "Mês" do filtro principal
  - **Linha 116**: Adicionada classe `active` ao botão "Semestre" do filtro principal - Botão "Semestre" agora aparece destacado por padrão
  - **Linha 221**: Removida classe `active` do botão "Mês" do gráfico de faturamento
  - **Linha 222**: Adicionada classe `active` ao botão "Semestre" do gráfico de faturamento - Botão "Semestre" do gráfico agora aparece destacado por padrão

### Resumo

Alterado o filtro de período inicial do dashboard_tela de "Mês" para "Semestre". Agora, ao carregar o dashboard, tanto o filtro principal quanto o gráfico de faturamento iniciam automaticamente exibindo dados dos últimos 6 meses (modo semestral). Esta mudança proporciona uma visão mais ampla dos dados ao abrir o dashboard, conforme solicitado pela gestão.

### Primeira Release

Esta é a primeira versão publicada do `dashboard_tela` no CDN. O widget é uma evolução do `wish-board` (dashboard original) com melhorias e otimizações. Versões anteriores do desenvolvimento estavam referenciadas na documentação como v109, mas esta é a primeira release oficial versionada.
