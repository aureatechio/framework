# Changelog — `dashboard_tela`

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
