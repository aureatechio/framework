# Changelog — `dashboard_tela`

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
