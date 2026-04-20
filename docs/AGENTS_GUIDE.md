# Guia de Multi-Agentes — Widget `wish-board`

Este documento define a arquitetura de agentes especializados para o desenvolvimento e manutenção do widget `wish-board`. Futuras IAs devem seguir este protocolo para garantir consistência e eficiência.

## 1. Introdução e Propósito

O widget `wish-board` é um dashboard complexo de CRM integrado ao Supabase e Bubble. Dada a sua densidade de lógica de dados e refinamento de UI, utilizamos uma abordagem de multi-agentes para segmentar responsabilidades e permitir operações simultâneas em diferentes domínios.

## 2. Arquitetura de Agentes (10 Agentes)

### 1. Arquiteto de Dados (Supabase)
- **Especialidade:** SQL, Estrutura de Tabelas, RPCs.
- **Domínio:** `vendedores`, `leads`, `imagemProposta`, `agendamento`, `compras`.
- **Referência:** `fetchMetasData`, `fetchFunnelData`.

### 2. Especialista em Métricas e KPIs
- **Especialidade:** Lógica de negócio, cálculos de conversão, SLAs.
- **Domínio:** FRT, Ciclo de Vendas, Taxas de Conversão.
- **Referência:** `docs/frt_logica.md`, `docs/tempo_proposta_filtro.md`.

### 3. Designer de UI/UX (CSS & Layout)
- **Especialidade:** Flexbox, Grid, Variáveis CSS, Animações.
- **Domínio:** Diagramação, espaçamentos, tipografia, Dark Mode.
- **Referência:** `public/widgets/dashboard/form.css`.

### 4. Engenheiro de Visualização (SVG & Charts)
- **Especialidade:** ApexCharts, SVG dinâmico, Path manipulation.
- **Domínio:** Gráfico de Receita, Funil SVG horizontal/vertical.
- **Referência:** `renderRevenueChart`, `renderFunnel`.

### 5. Integrador de Filtros e Contexto
- **Especialidade:** Manipulação de datas, filtros globais, estados.
- **Domínio:** `getDateRange`, `applyCutoffTimestamp`, `selectedSeller`.
- **Referência:** `docs/horario_util_dinamico_params.md`.

### 6. Especialista em Performance Individual
- **Especialidade:** Rankings, scores, tabelas de desempenho.
- **Domínio:** Ranking de Executivos, Progresso de Metas.
- **Referência:** `renderRanking`, `renderMetasSection`.

### 7. Agente de Deployment e Versão
- **Especialidade:** Script `deploy.py`, manifestos JSON, CHANGELOG.
- **Domínio:** Controle de versões (v151+), CDN assets.
- **Referência:** `deploy.py`, `CHANGELOG.md`.

### 8. Especialista em Lógica de Vendas
- **Especialidade:** Status de compras, filtros de aprovação.
- **Domínio:** `vendaaprovada = true`, filtros de agência via Lead ID.
- **Referência:** `applyApprovedPurchaseFilter`.

### 9. Agente de QA e Lints
- **Especialidade:** Identificação de bugs, erros de linter, validação visual.
- **Domínio:** Consistência de dados entre cards e listas.
- **Referência:** `read_lints`.

### 10. Documentador e Guardião do Projeto
- **Especialidade:** Documentação técnica, READMEs, Guias de Agentes.
- **Domínio:** `PROJECT_DOC.md`, `AGENTS_GUIDE.md`.
- **Referência:** Este documento.

## 3. Protocolo de Operação

1. **Identificação:** Antes de iniciar qualquer tarefa, identifique quais agentes são necessários.
2. **Invocação:** Use o pensamento do modelo para "chamar" as especialidades.
3. **Colaboração:** Se uma tarefa envolve dados e UI, o *Arquiteto de Dados* deve definir a estrutura antes do *Designer de UI* renderizar.
4. **Validação:** O *Agente de QA* deve sempre verificar inconsistências (ex: divergência entre card e lista).

## 4. Regras para Futuras IAs

- **LEIA ESTE GUIA** antes de qualquer modificação estrutural.
- **Mantenha a modularidade** das funções no `form.js`.
- **Siga os tokens CSS** definidos no topo do `form.css`.
- **Atualize o CHANGELOG.md** e o `PROJECT_DOC.md` em cada nova versão.
- **Não remova comentários de segmentação** no código.

## 5. Referências Cruzadas

- `PROJECT_DOC.md`: Visão geral da arquitetura.
- `CHANGELOG.md`: Histórico detalhado de evoluções.
- `docs/frt_logica.md`: Detalhes sobre First Response Time.
