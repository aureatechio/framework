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

## `wish-board` v200 — 2026-02-02

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: *(será preenchido após deploy)*
- **Manifesto**: *(será preenchido após deploy)*
- **URLs**:
  - HTML: *(será preenchido após deploy)*
  - CSS: *(será preenchido após deploy)*
  - JS: *(será preenchido após deploy)*

### Mudanças (linha a linha)

- `form.js` (renderRanking — linha 5494)
  - Alterada cor da pill "Renovações" de verde (`#10b981`) para azul-turquesa (`#14b8a6`)
  - Melhora contraste visual: evita 3 pills verdes consecutivas
  - Facilita distinção rápida entre Vendas (verde), Renovações (turquesa) e Faturamento (verde)

### Resumo

**Ajuste Visual: Cor da Métrica Renovações**

Alterada a cor do ícone e valor de Renovações de verde esmeralda para azul-turquesa para melhorar a legibilidade e diferenciação visual no ranking de vendedores.

**Antes:** Propostas (azul) | Reuniões (cinza) | Vendas (verde) | Renovações (verde) | Faturamento (verde)
**Depois:** Propostas (azul) | Reuniões (cinza) | Vendas (verde) | Renovações (turquesa) | Faturamento (verde)

---

## `wish-board` v199 — 2026-02-02

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-8c5d494`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v199/git-8c5d494.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v199/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v199/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v199/form.js`

### Mudanças (linha a linha)

- `form.js` (fetchRankingData — linhas 4496-4510)
  - Adicionado campo `renewals: 0` na inicialização do `sellerMap` para rastrear renovações separadamente

- `form.js` (fetchRankingData — linha 4610)
  - Adicionado `tipo_venda` no select da query de compras: `.select('..., tipo_venda')`

- `form.js` (fetchRankingData — linhas 4635-4654)
  - Modificada lógica de contagem de vendas para separar por tipo:
    - `salesCount`: incrementa apenas quando `tipo_venda === 'Venda'`
    - `renewals`: incrementa quando `tipo_venda === 'Renovação'`
  - Faturamento total (`sales`) continua somando ambos os tipos

- `form.js` (renderRanking — linhas 5465-5490)
  - Adicionada quinta pill "Renovações" entre Vendas e Faturamento
  - Ícone: `refresh-cw` (setas circulares)
  - Cor: `#10b981` (verde esmeralda) para diferenciar de Vendas
  - Valor exibido: `r.renewals` (quantidade de renovações)

- `form.js` (renderRanking — linha 5399)
  - Adicionado case `if (key === 'renewals') return toNum(obj.renewals);` na função de ordenação

- `form.html` (dropdown de ordenação — linha 337)
  - Adicionada opção `<option value="renewals">Renovações</option>` após "Vendas"

### Resumo

**Separação de Vendas e Renovações no Ranking de Vendedores**

O ranking de executivos agora distingue entre vendas novas e renovações:

- **Vendas**: Conta apenas compras com `tipo_venda = 'Venda'`
- **Renovações**: Nova métrica para compras com `tipo_venda = 'Renovação'`
- **Faturamento**: Continua somando ambos os tipos (mantém compatibilidade)

**Visualização:**
- Cards de vendedores agora exibem 5 pills: Propostas | Reuniões | Vendas | **Renovações** | Faturamento
- Cada pill usa flex: 1 (divide espaço igualmente)

**Ordenação:**
- Dropdown agora inclui opção "Renovações" para ordenar ranking por quantidade de renovações
- Ordenação: descendente (maior número de renovações primeiro), tiebreaker por avgScore

**Compatibilidade:**
- Totalmente retrocompatível - não afeta dados ou funcionalidades existentes
- Performance: impacto mínimo (uma coluna adicional no select)

---

## `wish-board` v198 — 2026-01-27

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-1a14b58`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v198/git-1a14b58.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v198/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v198/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v198/form.js`

### Mudanças (linha a linha)
- `form.js` (filtro de agência → campanhas Meta Ads)
  - Atualizado `META_CAMPAIGN_IDS_BY_AGENCY`: allowlist agora cobre `landingPage` **e** `whatsapp` por agência (MGS/Aceleraí). AUREA segue dentro de Aceleraí.
  - `getMetaCampaignIdsByAgency(channelType)`: passou a **normalizar e deduplicar** IDs (String/trim) para evitar duplicatas e garantir consistência quando “Todos” estiver selecionado.
  - `fetchChannelData()` (gasto por canal / WhatsApp): normalização de `idcampanha` vindo da tabela `campanhaTrafego` antes de intersectar com a allowlist (evita mismatch por whitespace/tipos).

- `form.js` (KPI Investimento Mkt / CAC / ROAS)
  - `fetchMarketingSpend()`: o KPI **Investimento Mkt** agora respeita o filtro do header usando `campaign.id IN [allowlist]` (união deduplicada de `landingPage` + `whatsapp`).
  - `fetchMarketingSpend()`: quando há `filtering`, o Meta Insights pode retornar **múltiplas linhas/páginas** — o código agora **paginar e soma** `spend` para obter o total filtrado.
  - `fetchMarketingSpend()`: cache agora varia por agência (`|agency:${state.selectedAgencyId || 'all'}`) para não “reaproveitar” valor de Todos ao trocar para MGS/Aceleraí.
  - Comportamento de “Todos”: passa a refletir **somente a soma das campanhas da allowlist** (MGS + Aceleraí), não o total do ad account.

### Resumo
Correção e padronização do **Investimento em Marketing (Meta Ads)** por agência: o filtro de agência do header passou a refletir corretamente o gasto (e consequentemente CAC/ROAS), com allowlist completa e soma/paginação no Meta Insights.

## `wish-board` v196 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-e504f62`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v196/git-e504f62.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v196/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v196/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v196/form.js`

### Mudanças (linha a linha)
- `form.js` (linha 5852)
  - **HOTFIX CRÍTICO**: Corrigido cache que impedia filtro de agência funcionar
  - Adicionado `|agency:${state.selectedAgencyId || 'all'}` na chave do cache
  - **ANTES**: `const cacheKey = \`campSpend|${startYmd}|${endYmd}|cut:${cutoff?.cutoffYmdLocal || 'none'}\`;`
  - **DEPOIS**: `const cacheKey = \`campSpend|${startYmd}|${endYmd}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}\`;`

### Resumo
**Hotfix Crítico: Cache de Investimento Meta Ads** - Corrige bug da v195 onde o filtro de agência não atualizava o investimento em marketing.

**Problema (v195):**
- Ao clicar em "MGS" no filtro de agência, o valor de "Investimento Mkt" permanecia o mesmo
- Causa: Cache usava apenas data/cutoff como chave, ignorando agência selecionada
- Cache de "Todos" era reutilizado quando usuário mudava para "MGS" ou "Aceleraí"
- Resultado: CAC e ROAS incorretos (usavam investimento de todas agências com vendas filtradas)

**Solução (v196):**
- Cache agora inclui agência na chave: `|agency:mgs` / `|agency:acelerai` / `|agency:all`
- Cada agência tem seu próprio cache independente
- Ao mudar filtro, novo cache é criado com IDs corretos de campanhas Meta
- Investimento, CAC e ROAS agora refletem corretamente a agência selecionada

**Impacto:**
- ✅ Filtro "Todos" → Investimento de todas as agências (soma)
- ✅ Filtro "MGS" → Investimento apenas das 4 campanhas MGS
- ✅ Filtro "Aceleraí" → Investimento apenas das 12 campanhas Aceleraí
- ✅ CAC correto: Investimento filtrado / Vendas filtradas
- ✅ ROAS correto: Faturamento filtrado / Investimento filtrado

### Validação
- Testar clicando em cada filtro (Todos → MGS → Aceleraí) e verificar que "Investimento Mkt" **muda** a cada clique
- No console do navegador: `state.__metaChannelSpendCache.key` deve mostrar `|agency:a57b72c4-...` quando filtro MGS ativo
- Comparar valores com Meta Ads Manager (filtrar por Campaign ID)

### Nota Técnica
Este hotfix complementa a v195 que implementou `META_CAMPAIGN_IDS_BY_AGENCY` e `getMetaCampaignIdsByAgency()`. A v195 já filtrava IDs corretamente, mas o cache impedia que novos dados fossem buscados ao mudar agência.

---

## `wish-board` v195 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-c17c50f`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v195/git-c17c50f.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v195/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v195/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v195/form.js`

### Mudanças (linha a linha)
- `form.js` (linhas 987-1052)
  - **Constante META_CAMPAIGN_IDS_BY_AGENCY adicionada**: Mapeamento de agência → IDs de campanhas Meta (Facebook)
  - MGS: 4 campanhas Landing Page mapeadas (`120239567789980521`, `120239566956730521`, `120239566738920521`, `120239495678940521`)
  - Aceleraí: 12 campanhas Landing Page mapeadas (incluindo AUREA `120239333024630521`)
  - Arrays vazios para WhatsApp (sem IDs específicos por agência ainda)

- `form.js` (linhas 1053-1089)
  - **Função getMetaCampaignIdsByAgency() adicionada**: Helper que retorna IDs de campanhas filtrados por `state.selectedAgencyId`
  - Quando `selectedAgencyId` está vazio: retorna TODOS os IDs (todas agências)
  - Quando `selectedAgencyId` = MGS: retorna apenas IDs da MGS
  - Quando `selectedAgencyId` = Aceleraí: retorna apenas IDs da Aceleraí

- `form.js` (função `fetchChannelData`, linhas ~5850-5872)
  - **Landing Page**: Substituído ID fixo `['120239333024630521']` por `getMetaCampaignIdsByAgency('landingPage')`
  - **WhatsApp**: Mantida query de `campanhaTrafego`, mas adicionada intersecção com IDs mapeados por agência
  - Lógica: Se `idsWPPByAgency` tem itens, filtra apenas IDs que estão no mapeamento; caso contrário usa todos

### Resumo
**Filtro de Agência para Campanhas Meta Ads** - O filtro de agência no header (MGS / Aceleraí / Todos) agora filtra corretamente:
- ✅ Investimento em marketing (gastos Meta Ads) por agência
- ✅ CAC calculado corretamente: Investimento filtrado / Vendas filtradas
- ✅ ROAS calculado corretamente: Faturamento filtrado / Investimento filtrado
- ✅ Performance por Canal (Landing Page e WhatsApp) segregada por agência

**Antes (INCORRETO):**
- Filtro MGS mostrava: Investimento TODAS agências / Vendas só MGS = CAC inflado ❌
- Filtro Aceleraí mostrava: Faturamento só Aceleraí / Investimento TODAS agências = ROAS deflacionado ❌

**Depois (CORRETO):**
- Filtro MGS mostra: Investimento só MGS / Vendas só MGS = CAC correto ✅
- Filtro Aceleraí mostra: Faturamento só Aceleraí / Investimento só Aceleraí = ROAS correto ✅

### Impacto nos KPIs
- **Investimento Mkt**: Agora reflete apenas gastos da agência selecionada
- **CAC**: Agora calcula corretamente (investimento e vendas da mesma agência)
- **ROAS**: Agora calcula corretamente (faturamento e investimento da mesma agência)
- **Performance por Canal**: Landing Page e WhatsApp mostram dados segregados por agência

### Validação Recomendada
1. Testar filtro "Todos" → Investimento deve ser soma de todas agências
2. Testar filtro "MGS" → Verificar que apenas 4 campanhas são contabilizadas
3. Testar filtro "Aceleraí" → Verificar que 12 campanhas (incluindo AUREA) são contabilizadas
4. Comparar valores com Meta Ads Manager para validar correção

---

## `wish-board` v194 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-7e2ba76`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v194/git-7e2ba76.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v194/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v194/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v194/form.js`

### Mudanças (linha a linha)
- `form.js` (linha 5458)
  - **HOTFIX CRÍTICO**: Corrigido erro de sintaxe que quebrava o carregamento do dashboard
  - Removida aspa extra: `.not('id_lead', 'is', null');` → `.not('id_lead', 'is', null);`
  - Erro introduzido acidentalmente na v193 ao fazer edição manual

### Resumo
- **Hotfix Crítico: SyntaxError** - Dashboard estava quebrado desde v193 devido a erro de sintaxe. Corrigido imediatamente com deploy de emergência.

### Nota
Este hotfix corrige erro crítico da v193. A funcionalidade de filtro de diretores nas Propostas (v193) permanece ativa e funcional após a correção.

---

## `wish-board` v193 — 2026-01-26 ⚠️ QUEBRADO

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-8d143a8`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v193/git-8d143a8.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v193/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v193/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v193/form.js`

### Mudanças (linha a linha)
- `form.js` (função `fetchFunnelData`, seção Propostas)
  - **Filtro de diretores adicionado**: Substituída lógica simples pela lógica completa do KPI
  - **Verificação diretores diretos**: Adiciona `if (directorIds.includes(p.id_vendedor)) return;`
  - **Verificação diretores fallback**: Adiciona `if (directorIds.includes(l.vendedorResponsavel)) return;`
  - **Estrutura de dados**: Usa `proposedLeadIdsBySeller` para agrupar por vendedor antes de excluir diretores
  - **Fallback aprimorado**: Busca `vendedorResponsavel` e verifica se é diretor antes de incluir

### Resumo
- **Bugfix: Inconsistência Propostas (Funil vs KPI)** - Segunda correção de inconsistência. Propostas no funil não excluíam diretores, mas KPI sim. Agora ambos excluem diretores mantendo comportamento consistente.

### Análise Completa de Inconsistências (v192 + v193)

| Etapa do Funil | v191 | v192 | v193 |
|----------------|------|------|------|
| Leads Captados | ✅ OK | ✅ OK | ✅ OK |
| Leads Qualificados | ✅ OK | ✅ OK | ✅ OK |
| **Propostas** | ❌ Incluía diretores | ❌ Incluía diretores | ✅ Exclui diretores |
| **Reuniões** | ❌ Incluía diretores | ✅ Exclui diretores | ✅ Exclui diretores |
| Vendas | ✅ OK | ✅ OK | ✅ OK |

**Conclusão**: Todas as etapas do funil agora têm comportamento consistente com os KPIs superiores.

---

## `wish-board` v192 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-9dc0c07`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v192/git-9dc0c07.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v192/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v192/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v192/form.js`

### Mudanças (linha a linha)
- `form.js` (função `fetchFunnelData`)
  - **Filtro de diretores adicionado**: Busca IDs de diretores no início da função (linhas após 5421)
  - **Query de reuniões**: Adiciona campo `vendedor` ao select da tabela `agendamento` (linha 5493)
  - **Exclusão de diretores**: Filtra reuniões removendo diretores antes da contagem (linhas 5498-5500)
  - Aplicado mesmo filtro que já existia no KPI de reuniões para manter consistência

### Resumo
- **Bugfix: Inconsistência Funil vs KPI de Reuniões** - Corrigido problema onde o funil de vendas mostrava número diferente de reuniões comparado ao KPI superior quando filtro de vendedor estava selecionado. O funil agora exclui reuniões de diretores, igual ao KPI.

### Contexto Técnico
**Problema identificado:**
- KPI de reuniões (cards superiores): Excluía reuniões de diretores desde sempre
- Funil de vendas: **NÃO** excluía reuniões de diretores

**Resultado:**
- Com filtro "Todos": Números alinhados (ambos excluíam diretores)
- Com filtro "Diretor": KPI mostrava 0, funil mostrava reuniões do diretor (inconsistência)

**Solução aplicada:**
- Funil agora exclui reuniões de diretores independente do filtro selecionado
- Ambos (KPI e Funil) agora têm comportamento consistente

---

## `wish-board` v191 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-50bc6b2`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v191/git-50bc6b2.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v191/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v191/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v191/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 1968-1974)
  - **Scroll de página inteira**: Mudado de scroll interno para scroll natural da página
  - `[data-cdn-widget="dashboard"]`: Removido `height: 100%`, `display: flex`, `flex-direction: column`
  - `[data-cdn-widget="dashboard"]`: Adicionado `min-height: 100vh` para altura mínima
  - `#dashboard-acelerai-v2`: Removido `height: 100%`, `overflow-y: auto`, `overflow-x: hidden`, `-webkit-overflow-scrolling`, `overscroll-behavior-y`
  - `#dashboard-acelerai-v2`: Alterado para `height: auto` permitindo crescimento natural com o conteúdo

### Resumo
- **Feature: Scroll de Página Inteira** - Após múltiplas tentativas com scroll interno (v186-v190), mudança definitiva para scroll natural da página inteira por decisão do usuário. A página agora rola normalmente usando o scroll do navegador.

### Contexto
Após 6 versões testando scroll interno (v186-v190), identificamos que o scroll interno não atendia as necessidades do projeto. O scroll de página inteira oferece melhor compatibilidade e experiência de usuário.

---

## `wish-board` v190 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-a38f9b9`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v190/git-a38f9b9.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v190/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v190/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v190/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 51-54, 1973-1979)
  - **Padding ajustado**: Movido `padding: 24px 20px` da regra base (linha 52) para a regra de scroll específica do `#dashboard-acelerai-v2` (linha 1975)
  - Isso evita conflito entre `height: 100%` e `padding`, permitindo que eventos de scroll wheel funcionem corretamente sobre todo o conteúdo

### Resumo
- **Bugfix: Mouse Wheel Scroll** - Ajuste de padding para permitir que scroll wheel funcione sobre o conteúdo, não apenas arrastando a scrollbar.

---

## `wish-board` v189 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-54a93c9`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v189/git-54a93c9.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v189/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v189/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v189/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 1297-1299)
  - **Scrollbars tornadas visíveis**: Removidas linhas que ocultavam globalmente todas as scrollbars dentro do dashboard
  - Removido: `#dashboard-acelerai-v2 ::-webkit-scrollbar { display: none; }`
  - Removido: `#dashboard-acelerai-v2 { -ms-overflow-style: none; scrollbar-width: none; }`
  - **Impacto**: Scrollbars agora são visíveis e acessíveis em:
    - Scroll principal do dashboard
    - Ranking de executivos (#ranking-list)
    - Tabela de metas (#metas-team-table)
    - Pipeline timeline (.pipeline-diagram-scroll)

### Resumo
- **Bugfix Crítico: Scrollbars Invisíveis** - Todas as scrollbars estavam ocultas globalmente, tornando o scroll inacessível mesmo quando configurado. Agora scrollbars são visíveis e funcionais.

### Nota Técnica
Este foi o problema que causou a falha das versões v186-v188. Mesmo com `overflow-y: auto` configurado corretamente, as scrollbars estavam sendo ocultadas por CSS global.

---

## `wish-board` v188 — 2026-01-26

- **Nome (Bubble)**: `wish-board`
- **widget_slug (repo)**: `dashboard`
- **Code version**: `git-3c2dd78`
- **Manifesto**: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/_deploy_manifests/wish-board/v188/git-3c2dd78.json`
- **URLs**:
  - HTML: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v188/form.html`
  - CSS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v188/form.css`
  - JS: `https://awqtzoefutnfmnbomujt.supabase.co/storage/v1/object/public/cdn-assets/wish-board/v188/form.js`

### Mudanças (linha a linha)
- `form.css` (linhas 51-55)
  - **Conflito de overflow resolvido**: Removidas propriedades `height: auto` e `overflow: visible` da regra base do `#dashboard-acelerai-v2`
  - Isso permite que as regras de scroll interno (linhas 1972-1982) funcionem corretamente sem conflito

### Resumo
- **Bugfix: Conflito de Overflow** - Removido conflito CSS que impedia o scroll interno de funcionar corretamente. O scroll agora deve funcionar em todo o dashboard, incluindo gráfico de faturamento.

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
