# Changelog (obrigatório) — `wish-board`

Este arquivo registra **versão a versão** o que foi alterado no elemento publicado no Bubble (**`nome`**) e no Storage (Supabase).

## Regra de manutenção (SOP)

**Sempre que houver deploy** (novo `python deploy.py <versao> wish-board dashboard`), o agente/dev **DEVE**:

1) **Adicionar uma nova entrada no topo** (versão mais recente primeiro).
2) Preencher **manifesto, URLs e code_version** (copiar do output do deploy).
3) Listar as mudanças **arquivo por arquivo**, em itens **granulares (“linha a linha”)**:
   - Um item por alteração objetiva (ex.: “troca ordenação `sales` para `salesCount`”, “adiciona option `revenue` no select”).
   - Sempre indicar o **arquivo** e, quando possível, a **seção/função** afetada.
4) Se houve correção de “nome do elemento” / “widgetKey” / “widget_slug”, registrar explicitamente.
5) Se houve rollback/redeploy de versão, registrar com clareza (o que mudou vs versão anterior).

### Template para novas versões

```md
## `wish-board` vXXX — AAAA-MM-DD

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-...` (ou `ts-...`)
- **Manifesto**: <url>
- **URLs**:
  - HTML: <url>
  - CSS: <url>
  - JS: <url>

### Mudanças (linha a linha)
- `caminho/do/arquivo.ext`
  - item 1
  - item 2
```

---

## `wish-board` v187 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-6940eab`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v187/git-6940eab.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v187/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v187/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v187/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 1972-1982)
  - **Scroll interno funcional**: Revertido para scroll interno (permite elemento à esquerda permanecer estático)
  - Restaurado `height: 100%` e `overflow-y: auto` no `#dashboard-acelerai-v2`
  - Adicionado `display: flex` e `flex-direction: column` no wrapper `[data-cdn-widget="dashboard"]` para garantir layout correto
  - Adicionado `-webkit-overflow-scrolling: touch` para melhorar performance de scroll em dispositivos iOS
  - Adicionado `overscroll-behavior-y: contain` para evitar scroll chain (propagação para o body)

### Resumo
- **Bugfix: Scroll Interno Funcional** - Dashboard agora usa scroll interno otimizado, mantendo elementos laterais estáticos. Requer que o HTML Element pai no Bubble tenha altura definida (ex: `height: 100vh`).

### Nota Técnica
Para funcionamento correto, o container pai no Bubble deve ter altura definida:
```css
/* HTML Element no Bubble */
height: 100vh; /* ou altura fixa como 800px */
```

---

## `wish-board` v186 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-3fb6d40`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v186/git-3fb6d40.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v186/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v186/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v186/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 1972-1981)
  - **Scroll da página**: Corrigido problema de scroll interno no dashboard
  - Removido `height: 100%` e `max-height: 100%` que limitavam o container
  - Alterado `overflow-y: auto` para `overflow: visible` permitindo scroll natural da página
  - Adicionado `min-height: 100vh` no wrapper `[data-cdn-widget="dashboard"]` para garantir altura mínima
  - Alterado `#dashboard-acelerai-v2` para `height: auto` e `overflow: visible`
  - Mantido `overflow-x: hidden` para evitar scroll horizontal indesejado

### Resumo
- **Bugfix: Scroll da Página** - O dashboard agora permite scroll natural da página ao invés de ter um scroll interno. Todo o conteúdo é acessível através do scroll padrão do navegador.

---

## `wish-board` v185 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v185/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v185/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v185/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v185/form.js`

### Mudanças (linha a linha)
- `form.js`
  - **Metas (donuts + tabela)**: percentuais passaram a ser exibidos com **0 casas decimais** (ex.: `6%`) para melhorar legibilidade.
  - **Gráfico “Evolução do Faturamento”**: cor da série **“Projeção”** alterada para azul claro (`#0ea5e9`) mantendo a linha **pontilhada**.
  - **Agência (header)**: adicionado sincronismo e bind do novo seletor (pills) com fallback/compatibilidade via `#agency-select` (oculto).
  - **Agência (bugfix)**: clique no seletor ficou mais robusto (não depende de `closest()`; funciona quando o target é `TextNode`).
- `form.css`
  - **Metas (donut)**: tipografia do valor `%` dentro do donut aumentada (`clamp(...)`) para ficar mais visível.
  - **Gráfico**: dot do chip “Projeção” (`.rev-dot--proj`) alinhado à nova cor azul claro (`#0ea5e9`).
  - **Agência (pills)**: adicionados estilos do segmented control (`.agency-segment` / `.agency-segment-btn`) com variações em dark mode.
- `form.html`
  - **Agência (header)**: dropdown substituído por **3 pills** (Todos | MGS | Aceleraí) e o `<select id="agency-select">` mantido **oculto** para compatibilidade.

---

## `wish-board` v184 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - `formatCurrencyCompact()`: Atualizada a formatação compacta de moeda para exibir sempre **duas casas decimais** (`.00k`, `.00M`) conforme solicitado para o ranking de faturamento.

### Resumo
- **UI: Precisão Decimal no Faturamento do Ranking** - Ajuste na formatação compacta de moeda para incluir duas casas decimais em todo o dashboard, focando na precisão do ranking de executivos.

---

## `wish-board` v183 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Atualizado o **Ranking de Metas** (Executivos) para exibir percentuais com **duas casas decimais** (`.00%`) nos cálculos individuais e globais de propostas e reuniões.
  
### Resumo
- **UI: Precisão Decimal no Ranking de Metas** - Padronização de casas decimais para maior precisão visual no desempenho do time.

---

## `wish-board` v182 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Refinada a precisão do funil: agora os percentuais exibem **sempre duas casas decimais** (`.00%`) conforme solicitado.
  
- `docs/AGENTS_GUIDE.md` (Novo arquivo)
  - Criada a documentação de **Arquitetura de Multi-Agentes** definindo 10 especialidades para futuras manutenções.
  - Estabelecido o protocolo de operação e colaboração entre IAs especializadas.

- `form.html`
  - Adicionado um **atalho discreto** (ícone de bot) no cabeçalho do dashboard que aponta para o `AGENTS_GUIDE.md`.

### Resumo
- **UI & Doc: Precisão Decimal e Guia de Agentes** - Ajuste de casas decimais no funil e implementação da documentação estrutural para governança de IA.

---

## `wish-board` v181 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - **Pivotado o funil para horizontal**: Layout agora é vertical (SVG em cima, dados embaixo).
  - Novo container `.funnel-svg-container` com largura 100% e altura 180px.
  - Nova grid `.funnel-data-grid` com 5 colunas para os dados, separadas por bordas sutis.
  - Tipografia ajustada para o layout horizontal (valores maiores, labels em caixa alta).

- `form.js`
  - Função `renderFunnel()` completamente reescrita para gerar **SVG horizontal curvo**.
  - `viewBox="0 0 500 100"`: largura maior que altura para orientação horizontal.
  - Path SVG que afunila da esquerda para a direita (topo-esquerda -> fundo-direita).
  - Linhas verticais brancas separando as seções do funil.
  - Degradê horizontal azul (da esquerda para direita, opacidade diminuindo).
  - Grid de dados abaixo do SVG com 5 colunas alinhadas às seções.

### Resumo
- **UI: Funil Horizontal SVG** - Transformação do funil vertical para horizontal, seguindo o estilo de referência do gestor.

---

## `wish-board` v180 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Aplicado **filtro de exclusão de diretores** no card de "Reuniões" (função `fetchMeetings`).
  - Agora os 4 indicadores (Acontecendo agora, Mês, Agendadas, Realizadas) não contabilizam reuniões de vendedores com `diretorVendas = true`.
  - Adicionado `vendedor` ao select das queries para possibilitar o filtro.

### Resumo
- **Data: Filtro de Diretores no Card de Reuniões** - Mantém consistência com outras métricas do dashboard (metas, KPIs, funnel) que já excluem diretores.

---

## `wish-board` v179 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Aumentado o contraste das **linhas tracejadas** (de `#e2e8f0` para `#cbd5e1`).
  - Estendida a largura das linhas tracejadas (`x2="250"`) para garantir que cubram todo o elemento, chegando até a coluna de dados.
  - Ajustado o espaçamento do tracejado (`stroke-dasharray="1,1.5"`) para melhor visibilidade.

- `form.css`
  - Adicionado `overflow: visible` ao SVG do funil para permitir que as linhas de demarcação se estendam horizontalmente além do container original.

### Resumo
- **UI: Linhas de Etapas Fortalecidas** - Ajuste de contraste e extensão das linhas tracejadas para cobrir todo o widget de funil.

---

## `wish-board` v178 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Adicionadas **linhas tracejadas cinzas** (`stroke-dasharray="1,1"`) ao fundo do SVG do funil para demarcar cada etapa de forma minimalista.
  - Mantidas as linhas brancas sutis internas ao funil para clareza na divisão das etapas.

### Resumo
- **UI: Linhas Tracejadas no Funil** - Adição de guias visuais tracejadas ao fundo do funil para melhor leitura das etapas, mantendo o estilo clean.

---

## `wish-board` v177 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Visual **minimalista e clean**: removidas sombras pesadas (`filter: none`).
  - Tipografia refinada: valores reduzidos para `24px` e labels para `10px`.
  - Badges de percentual agora usam tons de azul da marca (`--col-primary-light`).
  - Ajustado o espaçamento (`gap: 32px`) para um layout mais arejado.

- `form.js`
  - Nova paleta de cores: **tons de azul** (`#3B82F6`, `#60A5FA`, `#93C5FD`) substituindo o roxo.
  - Degradê suavizado com maior transparência na base para leveza.
  - Curvas do SVG simplificadas para um visual mais limpo.
  - Linhas divisórias tornadas quase imperceptíveis (`stroke-opacity="0.3"`).

### Resumo
- **UI: Funil Minimalista Azul** - Redesign focado em leveza, usando a paleta azul da marca e removendo elementos visuais pesados.

---

## `wish-board` v176 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Refinada a coluna de dados para a **extrema direita** com `text-align: right`.
  - Aumentado o tamanho dos valores e ajustado o espaçamento para maior clareza.
  - Fortalecida a sombra do SVG (`drop-shadow`) para maior destaque visual.

- `form.js`
  - Atualizado o degradê do funil para ser **mais forte no topo** e **quase transparente na base** (`stop-opacity` variando de 1.0 a 0.1).
  - Refinada a curva do SVG para um formato mais acentuado e fluido.
  - Ajustada a opacidade das linhas divisórias para um visual mais limpo e integrado.

### Resumo
- **UI: Refinamento Estético do Funil** - Ajuste de cores, degradê com transparência e reposicionamento dos dados para a direita, alinhando com a identidade visual da página.

---

## `wish-board` v175 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Removidos estilos de trapézios da v174.
  - Adicionado container para **funil SVG vertical curvo** (`.funnel-svg-container`).
  - Ajustada altura e alinhamento da coluna de dados para sincronizar com o SVG.
  - Implementado efeito de `drop-shadow` no SVG para profundidade.

- `form.js`
  - Função `renderFunnel()` completamente reescrita para gerar um **SVG vertical dinâmico**.
  - O funil agora possui uma silhueta curva (usando `path` com curvas de Bézier) que afunila de cima para baixo.
  - Adicionadas linhas divisórias brancas internas no SVG para separar as etapas.
  - Implementado degradê linear vertical (Roxo -> Azul -> Ciano) inspirado no estilo Codex.
  - Alinhamento perfeito entre o visual do funil (esquerda) e os dados (direita).

### Resumo
- **UI: Funil Vertical Curvo SVG** - Evolução visual do funil para um formato fluido e moderno, alinhado à esquerda com dados à direita.

---

## `wish-board` v174 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Implementado design de **funil vertical real** usando connected trapezoids.
  - Adicionadas classes `.funnel-v-segment` com `clip-path: polygon()` para efeito de afunilamento.
  - Refinado layout horizontal: funil à esquerda e coluna de dados (valor, %, label) à direita.
  - Paleta de cores em degradê roxo/púrpura mantida e aprimorada.

- `form.js`
  - Função `renderFunnel()` atualizada para calcular as larguras de topo e base de cada segmento do trapézio, garantindo que as fatias se conectem perfeitamente.
  - Implementado alinhamento à esquerda com dados à direita conforme solicitado.

### Resumo
- **UI: Funil Vertical Real** - Transformação do gráfico de barras em um funil verdadeiro com formato de trapézio, alinhado à esquerda.

---

## `wish-board` v173 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Adicionados novos estilos para funil visual real com degradê roxo/púrpura
  - Classes: `.funnel-visual-wrapper`, `.funnel-shape`, `.funnel-segment`, `.funnel-segment-bar`, `.funnel-data-column`, `.funnel-data-row`, `.funnel-data-value`, `.funnel-data-pct`, `.funnel-data-label`
  - Paleta de cores: `#4c1d95` → `#6d28d9` → `#8b5cf6` → `#a78bfa` → `#c4b5fd`
  - Layout responsivo para mobile

- `form.js`
  - Função `renderFunnel()` reescrita para gerar funil visual com barras decrescentes alinhadas à esquerda
  - Dados (valor, percentual, label) exibidos à direita do funil

### Resumo
- **UI: Funil de Vendas Visual** - Novo design do funil com barras decrescentes em degradê roxo/púrpura, alinhadas à esquerda, similar à imagem de referência.

---

## `wish-board` v172 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - `countProposalRowsForRange`: Corrigido para também excluir propostas de diretores (não apenas deduplicar por lead). Agora a lógica está 100% alinhada com `fetchMetasData`.

### Resumo
- **KPIs Topo: Correção de Filtro de Propostas** - O card "Propostas" agora exclui propostas de diretores, alinhando com o número mostrado no ranking de metas.

---

## `wish-board` v171 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - `countMeetingRowsForRange`: Agora exclui reuniões de vendedores que são diretores (`diretorVendas = true`), alinhando com o filtro do ranking de metas.
  - `countProposalRowsForRange`: Agora conta **leads únicos** (deduplica por `id_lead`), não o número total de propostas. Alinhado com o comportamento do ranking de metas.

### Resumo
- **KPIs Topo: Filtros Unificados** - Os cards de "Propostas" e "Reuniões" no topo da página agora usam os mesmos filtros do ranking de metas:
  - Propostas: conta apenas leads únicos (1 proposta por lead)
  - Reuniões: exclui reuniões de diretores

---

## `wish-board` v170 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Ajustado `fmtMoneyFull` para garantir arredondamento antes da formatação.
  - Atualizado o formatador do tooltip do gráfico de faturamento para usar números inteiros (sem decimais) no modo mensal, mantendo decimais apenas no modo anual.

### Resumo
- **UI: Ajuste de Tooltip** - Tooltip do gráfico mensal agora exibe apenas números inteiros, conforme solicitado.

---

## `wish-board` v169 — 2026-01-22

### Mudanças (linha a linha)
- `form.html`
  - Removidos os sufixos "(LEADS ÚNICOS)" e "(EX DIRETORES)" dos títulos das metas de propostas e reuniões para um visual mais limpo no cabeçalho.

### Resumo
- **UI: Simplificação de Títulos** - Títulos das metas principais agora estão mais diretos e limpos.

---

## `wish-board` v168 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Atualizado filtro de vendas aprovadas: agora considera apenas registros com `vendaaprovada: true` (removido o tratamento de valores nulos como aprovados).

### Resumo
- **Precisão em Vendas** - O dashboard agora segue uma regra estrita de considerar apenas vendas explicitamente marcadas como aprovadas no banco de dados.

---

## `wish-board` v167 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Alterada a cor da estrela do KWAY Score no ranking para dourado (`#eab308`).
- `form.html`
  - Invertida a posição das seções: Ranking & Metas agora aparecem acima do Funil de Vendas.
  - Ajustado o espaçamento superior da seção de Ranking para manter o respiro visual.

### Resumo
- **UI: Reorganização e Refinamento** - Ranking e Metas voltaram para o topo da seção de performance, e a estrela do ranking agora possui um tom dourado mais elegante.

---

## `wish-board` v166 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Alterada a cor da estrela do KWAY Score no ranking para amarelo (`#facc15`) e aumentada levemente sua opacidade.
- `form.html`
  - Adicionada margem superior (`margin-top: 24px`) à seção do Funil de Vendas para abaixá-la levemente.

### Resumo
- **UI: Ajustes de Estilo** - Estrela do ranking agora é amarela e o funil foi reposicionado com mais respiro no topo.

---

## `wish-board` v165 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Reduzido o padding vertical das etapas do funil (`.funnel-step`) de 10px para 6px.
  - Diminuído o tamanho das fontes de rótulos, valores e badges do funil.
  - Reduzida a altura das barras do funil de 22px para 12px para um visual mais leve.
- `form.html`
  - Reposicionada a seção "Funil de Vendas" para o topo do bloco de performance (acima de Ranking e Metas).
  - Removida a seção de "Taxas de Conversão" e "Performance por Canal" conforme solicitado.

### Resumo
- **UI: Funil Otimizado e Reposicionado** - O funil de vendas agora é a primeira visão da seção de performance, com um design muito mais compacto e limpo.

---

## `wish-board` v164 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Refinada a estrela do KWAY Score no ranking: removido o preenchimento (fill) e ajustada a espessura da linha (stroke-width) e opacidade para um visual mais leve e "clean".

### Resumo
- **UI: Refinamento Estético** - Estrela do score agora é apenas um contorno sutil, reduzindo o peso visual no ranking de executivos.

---

## `wish-board` v163 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Atualizada lógica de contagem de reuniões: agora a métrica principal (KPI e Ranking) soma reuniões "Realizadas" e "Agendadas" (basicamente todas as não-canceladas).
  - Removida a distinção interna que separava agendadas de realizadas para simplificar o número total.

### Resumo
- **Métrica Unificada** - O número de reuniões agora reflete o total de compromissos (Realizados + Agendados), totalizando 93 para os vendedores ativos.

---

## `wish-board` v162 — 2026-01-22

### Mudanças (linha a linha)
- `form.html`
  - Adicionado sufixo "(EX DIRETORES)" ao título da Meta de Reuniões para clareza sobre o filtro aplicado.

### Resumo
- **UI: Transparência** - Título da meta de reuniões agora indica explicitamente a exclusão de diretores, justificando o número exibido.

---

## `wish-board` v161 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Simplificada a exibição da meta de reuniões para mostrar apenas um número (reuniões realizadas), sem a divisão realizadas/agendadas.
  - Reduzido o padding e tamanhos gerais dos cards do ranking de executivos para um layout mais compacto.
  - Ajustadas fontes, ícones e espaçamentos internos para melhor densidade visual.

### Resumo
- **UI: Ranking Ultra Compacto** - Cards de executivos ainda menores, com menos padding e fontes reduzidas.
- **KPI Simples** - Meta de reuniões agora exibe apenas o número de reuniões realizadas (vendedores não-diretores).

---

## `wish-board` v160 — 2026-01-22

### Mudanças (linha a linha)
- `form.html`
  - Restaurado o scroll no ranking de executivos com altura máxima de 520px.
  - Revertido o `items-start` no grid de ranking.
- `form.js`
  - Alterada a exibição de reuniões no KPI: agora exibe "Realizadas" em destaque com "/Agendadas" em tamanho menor ao lado (ex: `93/99`).

### Resumo
- **UI: Ranking com Scroll** - O ranking de executivos agora tem scroll novamente, mantendo a altura controlada.
- **KPI Compacto** - Meta de reuniões exibe realizadas/agendadas de forma concatenada e compacta.

---

## `wish-board` v159 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Corrigida a contagem de reuniões: agora a verificação de status "realizada" é case-insensitive, capturando corretamente todos os registros.
  - Atualizada a função `renderMetasSection` para exibir o formato `Realizadas / Agendadas` no KPI de reuniões.
  - Corrigido bug visual no Ranking de Executivos onde o cabeçalho do primeiro colocado podia aparecer em branco.
  - Atualizado o ranking para contabilizar apenas reuniões "Realizadas", mantendo consistência com as outras métricas.
- `form.html`
  - Removida a altura fixa do container de ranking e ajustado o grid para `items-start`, eliminando o espaço em branco excessivo quando há poucos itens.

### Resumo
- **Precisão de Dados** - Correção na contagem de reuniões (93 realizadas detectadas agora) e exibição do total agendado vs realizado.
- **Correção Visual** - Cabeçalho do ranking restaurado e layout mais compacto e flexível, sem espaços vazios desnecessários.

---

## `wish-board` v158 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Reduzido o preenchimento (padding) e margens (margins) nos cards do Ranking de Executivos para torná-los mais compactos.
  - Ajustado o tamanho dos avatares e badges no ranking.
  - Reduzido o tamanho das fontes e ícones nas métricas e rodapé dos cards de ranking.

### Resumo
- **UI: Ranking Compacto** - Cards de executivos agora ocupam menos espaço vertical, reduzindo o espaço em branco no dashboard.

---

## `wish-board` v157 — 2026-01-22

### Mudanças (linha a linha)
- `form.js` & `form.html`
  - Removido o sufixo "(Leads Únicos)" do subtítulo da seção de Performance Individual, mantendo-o apenas no título principal das metas.

### Resumo
- **UI: Simplificação** - Subtítulo da performance do time agora está mais limpo, sem o aviso de leads únicos.

---

## `wish-board` v156 — 2026-01-22

### Mudanças (linha a linha)
- `form.css`
  - Adicionado estilo para a tag `<small>` dentro de `.meta-kpi-title` e `.section-subtitle` para tornar o texto "(LEADS ÚNICOS)" menor, mais discreto (70% de opacidade) e melhor alinhado.
- `form.html` & `form.js`
  - Envolvido o sufixo "(Leads Únicos)" na tag `<small>` para aplicar o novo estilo discreto.

### Resumo
- **UI: Refinamento de Texto** - O aviso de leads únicos agora é menor e mais discreto, mantendo o foco nos títulos principais.
- **Data: Métrica de Reuniões** - Consulta ao banco de dados realizada para validar o total de reuniões agendadas vs realizadas.

---

## `wish-board` v155 — 2026-01-22

### Mudanças (linha a linha)
- `form.html`
  - Adicionado sufixo "(LEADS ÚNICOS)" ao título principal da Meta de Propostas para manter consistência com o ranking.

### Resumo
- **Consistência de Métrica** - Título da meta principal agora também indica explicitamente que a contagem é baseada em leads únicos.

---

## `wish-board` v154 — 2026-01-22

### Mudanças (linha a linha)
- `form.js` & `form.html`
  - Atualizado subtítulo da Performance Individual para indicar explicitamente a contagem de "Leads Únicos".

### Resumo
- **Transparência na Métrica** - Adicionado o sufixo "(Leads Únicos)" no ranking de performance para reforçar que a contagem não considera leads repetidos para o mesmo vendedor.

---

## `wish-board` v153 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Adicionado filtro para excluir vendedores com perfil de diretores (`diretorVendas: true`) da listagem de performance e do cálculo de metas.
  - Atualizada a renderização da tabela de performance para incluir classes de cores nos percentuais.
- `form.css`
  - Adicionadas classes `.metas-progress-pct--blue` e `.metas-progress-pct--green` para que a cor do texto do percentual corresponda à cor da barra de progresso.

### Resumo
- **Filtro de Diretores** - Vendedores marcados como diretores agora são excluídos da visão de performance do time.
- **Cores nos Percentuais** - O texto de porcentagem agora utiliza a mesma cor da barra (azul para propostas, verde para reuniões).

---

## `wish-board` v152 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Refatorada busca de metas globais: agora prioriza a tabela `crm_metas_geral_mes` para propostas e reuniões.
  - Adicionada lógica de fallback para soma de metas individuais caso a tabela geral esteja vazia.
- `form.css`
  - Alterada a cor do percentual de propostas para azul (`#meta-propostas-trend`).
  - Adicionada classe `.metas-team-title-container` para dar mais respiro (margem superior e inferior) aos títulos da performance individual.
  - Melhorada a hierarquia visual dos títulos da seção de metas.
- `form.html`
  - Envolvidos títulos de performance individual em `.metas-team-title-container`.
  - Atualizado texto do subtítulo para "Progresso proporcional dos -- vendedores".

### Resumo
- **Metas Globais Consolidadas** - Agora o dashboard lê as metas gerais diretamente da tabela `crm_metas_geral_mes`.
- **Ajuste de Cores** - Propostas agora usam azul para diferenciar visualmente de reuniões (verde).
- **Melhoria de Diagramação** - Mais espaçamento na seção de performance para reduzir a densidade visual.

---

## `wish-board` v151 — 2026-01-22

### Mudanças (linha a linha)
- `form.js`
  - Removida coluna `cargo` da query de `vendedores` (coluna inexistente causava erro de busca).
  - Refatorada busca de metas individuais: agora consulta diretamente a tabela `crm_metas_vendedor_mes` em vez de depender de RPC.
  - Corrigido mapeamento de colunas de meta (`meta_mensal_propostas` e `meta_mensal_reunioes`).
  - Adicionado `state.metasData` para armazenar metas globais e por vendedor.
  - Implementada função `fetchMetasData()` para buscar metas do Supabase.
  - Implementada função `renderMetasSection()` para atualizar a UI com os dados de metas e progresso.
  - Integrada busca de metas no fluxo principal de `fetchData` e `init`.
- `form.css`
  - Aumentado tamanho das fontes em diversos elementos da dashboard (KPIs, Tabela de Performance, nomes de vendedores).
  - Ajustado padding e gaps para reduzir espaços vazios e melhorar a diagramação.
  - Adicionadas ~300 linhas de estilos para a nova seção de Metas (KPI cards, Donuts, Tabela de Performance).
- `form.html`
  - Removidos estilos inline dos cards de meta para centralizar no CSS.
  - Seção 5 renomeada para "RANKING & METAS".
  - Adicionada nova seção `#metas-section` com cards de KPI e donuts de progresso para Propostas e Reuniões.
  - Adicionada tabela `#metas-team-table` para performance individual do time.
  - Funil de vendas movido para nova seção 7.

### Resumo
- **Fix: Dados Zerados** - Corrigido erro SQL na tabela de vendedores e melhorada a extração de metas do banco.
- **Melhoria Visual** - Fontes maiores e layout mais compacto conforme solicitado.
- **Nova seção de Metas** - Visualização de progresso global e individual para Propostas e Reuniões.

---

## `wish-board` v148 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/148/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/148/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/148/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/148/form.js`

### Mudanças (linha a linha)
- `form.js`
  - Linha ~6261: Fonte da FocusBox aumentada (título 13px, valores 12px) e espaçamentos internos reduzidos.
  - Linha ~6186: Padding e bordas da FocusBox ajustados para visual mais compacto.

### Resumo
- **Melhoria estética na FocusBox** - Fonte maior e layout mais denso.

---

## `wish-board` v147 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/147/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/147/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/147/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/147/form.js`

### Mudanças (linha a linha)
- `form.js`
  - Linha ~6210: Funções `fmtMoneyCompact` e `fmtMoneyFull` criadas.
  - FocusBox no modo mensal volta a exibir números inteiros (ex: `R$ 492.740`).

### Resumo
- **Números inteiros na FocusBox mensal** - Melhor legibilidade para valores menores.

---

## `wish-board` v146 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/146/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/146/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/146/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/146/form.js`

### Mudanças (linha a linha)
- `form.js`
  - Linha ~6214: Moeda abreviada agora usa ponto como separador (ex: `R$ 22.1M`).
  - Linha ~6059: Formatter do eixo Y ajustado para usar ponto.

### Resumo
- **Padronização de separador decimal** - Uso de ponto em valores abreviados.

---

## `wish-board` v143 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v143/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.js`

### Mudanças (linha a linha)
- `form.js`
  - Card "Performance por Canal": campo "gasto" agora exibe 2 casas decimais (ex.: `R$ 45,00k` em vez de `R$ 45k`)
  - Linha ~5600: substituído `formatCurrencyCompact(ch.gasto)` por formatação inline com `.toFixed(2)` e separador decimal brasileiro (vírgula)

---

## `wish-board` v145 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v145/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v145/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v145/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v145/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6374-6384: Tooltip anual agora usa nome do mes (Dez/26 vs Dez/25)
  - Linha 6210-6217: Funcao `fmtMoney` agora usa formato compacto (R$ 22,1M em vez de R$ 22.151.845,00)
  - Linha 6247-6264: FocusBox reformatada com layout flexbox mais compacto e fonte menor

### Resumo
- **Tooltip anual com nome do mes** - "Dez/26 vs Dez/25"
- **FocusBox mais compacta** - Valores em formato abreviado (R$ 22,1M) e layout ajustado

---

## `wish-board` v144 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v144/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v144/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v144/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v144/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6374-6393: Funcao `formatTooltipHeaderByIndex` atualizada com novo formato
    - Anual: "01/26 vs 01/25" (mm/yy vs mm/yy-1)
    - Mensal/diario: "13/01/26 vs 13/01/25" (dd/mm/yy vs dd/mm/yy-1)

### Resumo
- **Tooltip com data completa** - Agora mostra a data completa em ambos os anos para facilitar comparacao

---

## `wish-board` v143 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v143/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v143/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6087-6109: Nova funcao `computeZoomYRange(zoomMin, zoomMax)` que calcula yMin otimizado baseado no Realizado
    - yMin = 90% do minimo do Realizado no range de zoom
    - yMax = 105% do maximo de todas as series
  - Handlers `selection` e `zoomed` atualizados para usar `computeZoomYRange`

### Resumo
- **Escala Y otimizada ao zoom** - O eixo Y agora comeca proximo ao valor minimo do Realizado, permitindo visualizar a variacao/crescimento mesmo quando Meta/Ano passado tem valores muito maiores

---

## `wish-board` v142 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v142/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v142/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v142/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v142/form.js`

### Mudancas (linha a linha)
- `form.js`
  - **ROLLBACK da v141**: Removidas funcoes `needsDualAxis` e `buildDualYAxis`
  - Handlers `selection` e `zoomed` restaurados para usar eixo Y unico

### Resumo
- Revertido eixo Y secundario automatico - grafico volta a usar um unico eixo Y para todas as series

---

## `wish-board` v141 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v141/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v141/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v141/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v141/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6087-6175: Novas funcoes para eixo Y secundario:
    - `needsDualAxis(zoomMin, zoomMax)` - detecta se Realizado < 30% das outras series no range de zoom
    - `buildDualYAxis(zoomMin, zoomMax)` - constroi array de eixos Y com Realizado no eixo direito
  - Linha 6505-6610: Handlers `selection` e `zoomed` atualizados para usar eixo dual quando necessario

### Resumo das correcoes
- **Eixo Y secundario automatico** - Quando Realizado e muito menor que Meta/Ano passado ao dar zoom, um eixo Y separado (lado direito, azul) aparece para mostrar a variacao do Realizado

---

## `wish-board` v140 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v140/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v140/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v140/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v140/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6348-6367: Funcao `formatTooltipHeaderByIndex` reformatada para ser mais compacta
    - Modo anual: "Jan/26 vs 25" em vez de "01/2026<br/>Ano passado: 01/2025"
    - Modo diario: "22/01/26 vs 25" em vez de "22/01/2026<br/>Ano passado: ..."
  - Linha 6215-6227: FocusBox reformatada com grid layout para melhor alinhamento dos valores

### Resumo das correcoes
- **Tooltip mais compacto** - Header em uma unica linha sem quebra (ex: "Jan/26 vs 25")
- **FocusBox com melhor diagramacao** - Layout em grid com valores alinhados a direita

---

## `wish-board` v139 — 2026-01-22

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v139/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v139/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v139/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v139/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6064-6071: Nova funcao `getXAxisFormat(zoomMin, zoomMax, isYearlyDefault)` que calcula formato do eixo X baseado no range
    - Range > 180 dias: formato mensal (mm/yy)
    - Range 60-180 dias: formato semanal
    - Range < 60 dias: formato diario (dd/mm)
  - Linha 6553-6567: Formatter do xaxis atualizado para usar `getXAxisFormat` e ajustar dinamicamente
  - Linha 6407-6467: Handlers `selection` e `zoomed` agora atualizam xaxis com novo formatter baseado no range selecionado
  - Linha 6513-6551: Handler `beforeResetZoom` restaura formatter original do xaxis

### Resumo das correcoes
- **Labels do eixo X ajustam ao zoom** - Ao selecionar 2 meses no modo anual, agora mostra dd/mm em vez de mm/yy repetido

---

## `wish-board` v138 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v138/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v138/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v138/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v138/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6398-6429: Handlers `selection` e `zoomed` agora passam yaxis completo com formatter ao fazer zoom (corrige valores sem formatacao como "8000000.00000000000")
  - Linha 6438-6475: Handler `beforeResetZoom` usa `buildRevenueYAxis` para restaurar yaxis completo com formatter
  - Linha 6140-6159: FocusBox reposicionada para `right: 12px` em vez de centralizada (evita corte na lateral direita)
  - FocusBox maxWidth reduzido de 320px para 260px

### Resumo das correcoes
- **Eixo Y mantem formatacao ao zoom** - Valores agora mostram "R$ 8,0M" em vez de numeros brutos
- **FocusBox nao corta mais** - Posicionada no canto direito com margem segura

---

## `wish-board` v137 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v137/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v137/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v137/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v137/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 6390-6418: Handler `selection` agora recalcula yaxis (min/max undefined) para ajustar escala vertical ao zoom + esconde focusBox
  - Linha 6420-6448: Handler `zoomed` mesmo tratamento - recalcula yaxis e esconde focusBox
  - Linha 6450-6475: Handler `beforeResetZoom` restaura yaxis original baseado nas series visiveis e mostra focusBox novamente
  - Linha 6133-6138: Funcao `ensureFocusBox` agora verifica se ha zoom ativo e esconde a caixa
  - Linha 6274: Funcao `buildFocusLineAnnotation` retorna vazio quando zoom ativo
  - Linha 6296: Funcao `buildFocusPointAnnotations` retorna vazio quando zoom ativo

### Resumo das correcoes
- **Escala vertical ajusta ao zoom** - yaxis recalculado automaticamente ao fazer drag-to-zoom
- **Legenda esconde ao zoom** - focusBox (caixa com valores do dia) desaparece quando ha zoom ativo, evitando corte visual

---

## `wish-board` v136 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v136/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v136/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v136/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v136/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 939: `Meta: false` alterado para `Meta: true` - serie Meta agora inicia selecionada por padrao
  - Linha 6548-6560: Zoom por selecao (drag-to-zoom) agora sempre habilitado, scroll wheel controlado pelo toggle
  - Linha 6390-6410: Removida verificacao `revenueChartZoomEnabled` dos handlers de selection/zoomed para permitir drag-to-zoom sempre
- `form.css`
  - Linha 227-262: Chips do grafico redesenhadas - mais leves, sem borda, padding menor, transicao suave
  - Linha 264-272: Dots das series reduzidos de 8px para 6px, removido shadow
  - Adicionada classe `.icon-only` para chips de icone (Zoom/Legenda)
- `form.html`
  - Linha 230: Botao Meta agora inicia com classe `active`
  - Linha 233-234: Botoes Zoom e Legenda substituidos por icones (`zoom-in` e `text`) com classe `icon-only`

### Resumo das melhorias
- **Meta selecionada por padrao** no grafico de faturamento
- **Chips mais clean** - design minimalista sem bordas
- **Drag-to-zoom automatico** - arraste para selecionar periodo e fazer zoom
- **Icones em Zoom/Legenda** - visual mais limpo

---

## `wish-board` v135 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v135/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v135/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v135/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v135/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 2741-2743: Atualizado comentario para refletir que TODOS os filtros (week/month/semester/year) agora incluem futuro
  - Linha 2763-2770: Adicionado caso `semester` em `getMeetingsDateRange` - estende ate o fim do mes atual
  - Linha 2771-2775: Adicionado caso `year` em `getMeetingsDateRange` - estende ate 31/12 do ano
  - **Bug fix**: Reunioes no filtro "Semestre" e "Ano" agora incluem reunioes futuras agendadas (antes mostravam menos que o "Mes")

---

## `wish-board` v134 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v134/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v134/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v134/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v134/form.js`

### Mudancas (linha a linha)
- `form.js`
  - Linha 3381-3382: Adicionado comentario explicativo e `const meetingsRange = getMeetingsDateRange(state.dateFilter)` para unificar calculo de reunioes com o card lateral
  - Linha 3383-3400: Funcao `countMeetingRowsForRange` agora recebe `startYmd` e `endYmd` diretamente (em vez de ISO timestamps)
  - Linha 3459-3471: Chamada de `countMeetingRowsForRange` alterada para usar `meetingsRange.startYmd` e `meetingsRange.endYmd`, incluindo reunioes futuras ate o fim do mes
  - Linha 3462-3470: Calculo do periodo anterior para comparativo "vs mes anterior" ajustado para usar mes completo
  - **Resultado**: KPI de Reunioes agora mostra o mesmo valor que o card lateral "Mes" (inclui reunioes futuras agendadas)
- `form.js` (cabecalho)
  - Adicionado bloco de comentarios no topo com referencias a documentacao (AGENTS_GUIDE.md, PROJECT_DOC.md, CHANGELOG.md, docs de regras especificas)
- `form.html`
  - Adicionado comentario HTML no topo com referencias a documentacao
- `form.css`
  - Adicionado bloco de comentarios no topo com referencias a documentacao e tokens CSS

---

## `wish-board` v133 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v133/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v133/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v133/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v133/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Ranking (Propostas): deduplica propostas para contar **1 proposta por lead por vendedor** (usa `Set` por vendedor).
  - Canais (LP): gasto por canal “Landing Page” passa a usar campanha específica `120239333024630521` ao buscar spend (Meta).

---

## `wish-board` v132 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v132/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v132/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v132/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v132/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Gráfico (Evolução do Faturamento): ajusta espaçamento das labels do eixo X (padding inferior + offsetY) para evitar “legendas cortadas”.

---

## `wish-board` v131 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v131/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v131/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v131/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v131/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.html`
  - Gráfico (Evolução do Faturamento): troca o toggle “Hoje” para **“Legenda”** (toggle do marcador do dia atual).
- `public/widgets/dashboard/form.css`
  - Gráfico (Evolução do Faturamento): ajustes de padding/overflow nas “chips” do header para evitar corte visual.

---

## `wish-board` v130 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v130/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v130/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v130/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v130/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.css`
  - Gráfico (Evolução do Faturamento): corrige “chip do mês cortando” (alinhamento do container + overflow horizontal).

---

## `wish-board` v129 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v129/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v129/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v129/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v129/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.html`
  - Gráfico (Evolução do Faturamento): organiza header actions em grupos (período / linhas / zoom+marcador) e remove botão “Reset”.
- `public/widgets/dashboard/form.css`
  - Gráfico (Evolução do Faturamento): deixa as pills mais “chips” (minimalistas) com bolinhas de cor por série.
  - Card do gráfico: ajusta layout/altura para evitar overflow vertical no Bubble.
- `public/widgets/dashboard/form.js`
  - Gráfico (Evolução do Faturamento): mantém estado das séries, modo e zoom; desativar “Zoom” também reseta a visão.

---

## `wish-board` v128 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v128/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v128/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v128/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v128/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Gráfico (Evolução do Faturamento): adiciona controles por estado (`state.revenueChartMode`, séries visíveis, zoom, marcador do dia).
  - Gráfico: habilita zoom por scroll e seleção (X-axis) quando “Zoom” estiver ligado; persiste min/max selecionados.
  - Gráfico: adiciona modo `month/semester/year` (calendário) com agregação diária/mensal e alinhamento de “Ano passado”.
- `public/widgets/dashboard/form.html`
  - Gráfico: adiciona pills de controle (`Mês/Semestre/Ano`, `Realizado/Ano passado/Meta`, `Zoom`, `Hoje/Legenda`).

---

## `wish-board` v127 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v127/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v127/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v127/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v127/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Velocímetro: refina regra de exibição “Meta do período” vs “Meta de <Mês>” e compara “vs período anterior”.

---

## `wish-board` v126 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v126/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v126/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v126/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v126/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Velocímetro (meta geral): ajusta busca em `crm_metas_geral_mes` para usar `mes` (independente do ano) e pegar o registro mais recente.

---

## `wish-board` v125 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v125/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v125/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v125/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v125/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Velocímetro: mantém meta mensal do CRM e prorrateia para períodos maiores/menores quando aplicável.

---

## `wish-board` v124 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v124/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v124/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v124/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v124/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.html`
  - Card “Reuniões”: adiciona IDs de label para suportar troca dinâmica do texto (ex.: “Hoje/Semana/Mês/Ano/…”).
- `public/widgets/dashboard/form.js`
  - Card “Reuniões”: labels passam a ser dinâmicas conforme o filtro do header (Total do período / Agendadas / Realizadas).

---

## `wish-board` v123 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v123/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v123/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v123/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v123/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Velocímetro: quando vendedor selecionado não é elegível à rotação, meta exibida como `--` (mantém cálculo interno para o percentual).

---

## `wish-board` v122 — 2026-01-21

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v122/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v122/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v122/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v122/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Compras: adiciona filtro best-effort `is_test is not true` (não quebra se a coluna não existir).
  - Velocímetro: passa a seguir o filtro de data do header (inclui prorrateio de meta quando aplicável).
  - Reuniões (card lateral): passa a seguir o filtro de data do header (Total/Agendadas/Realizadas).

## `wish-board` v99 — 2026-01-20

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v99/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v99/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Ranking: mantém **Vendas** como **quantidade** (`salesCount`) na pill.
  - Ranking: cria uma **nova pill “Faturamento”** separada da pill “Vendas” (mostra `formatCurrencyCompact(r.sales)`).
  - Ranking: remove “Fat” do rodapé (evita duplicidade, já que o faturamento subiu para as pills).

---

## `wish-board` v98 — 2026-01-20

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v98/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v98/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v98/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v98/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Ranking: move o faturamento para ficar **mais visível** (primeira tentativa) — exibindo junto ao bloco de Vendas.
  - Ranking: remove “Fat” do rodapé para não duplicar informação.

> Nota: na sequência, o layout foi refinado para “dois cards separados” em `v99`.

---

## `wish-board` v97 — 2026-01-20

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-2a15075`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v97/git-2a15075.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v97/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v97/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v97/form.js`

### Mudanças (linha a linha)
- `public/widgets/dashboard/form.js`
  - Ranking: adiciona `salesCount` no `sellerMap` e incrementa **+1 por compra aprovada** (`compras`) para representar **quantidade de vendas**.
  - Ranking: mantém `sales` como **faturamento (R$)** (soma de `compras.valor_total`).
  - Ranking: no sort, `sales` passa a ordenar por `salesCount` e `revenue` por `sales` (faturamento).
  - Ranking: UI “Vendas” passa a exibir `salesCount` (inteiro).
  - Cutoff do ranking: garante regra **apenas em `compras.data_compra`** (não aplicar cutoff em `created_at` para suportar compras “backdated”).
