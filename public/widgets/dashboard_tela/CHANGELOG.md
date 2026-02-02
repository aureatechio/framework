# Changelog — `dashboard_tela`

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
