
// Widget wrapper para rodar via loader (Bubble + CDN framework)
// - Não altera o comportamento do dashboard; só controla o momento de execução e carrega dependências.
;(function () {
  const WIDGET_KEY = "wish-board";

  function loadScriptOnce(url) {
    if (!url) return Promise.resolve();
    window.__wishBoardScriptPromises = window.__wishBoardScriptPromises || {};
    if (window.__wishBoardScriptPromises[url]) return window.__wishBoardScriptPromises[url];

    window.__wishBoardScriptPromises[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });

    return window.__wishBoardScriptPromises[url];
  }

  async function ensureDeps() {
    // Mantemos as mesmas URLs do dashboard original
    await loadScriptOnce("https://unpkg.com/lucide@latest");
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/apexcharts");
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
  }

  function runDashboardMain() {
    (function() {
      // --- SUPABASE CONFIG ---
      const SUPABASE_URL = 'https://awqtzoefutnfmnbomujt.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY';
      
      let sbClient = null;
      let realtimeChannel = null;
      let realtimeCleanupRegistered = false;
      let conversionChart = null;
      let revenueChart = null;
      let revenueMetaVisible = false; // persistir escolha do usuário entre renders

      // --- META ADS (Marketing Spend) ---
      // ATENÇÃO: token exposto no frontend conforme solicitado.
      const META_GRAPH_VERSION = 'v20.0';
      const META_AD_ACCOUNT_ID = 'act_843937229337573';
      const META_ACCESS_TOKEN = 'EAASGBRlEgBwBQGFUAaRob6p1yhZCfLL9szluxABxeXFYmmpz0Gankr47BZBKFD8TAkBharYfGwck69wMZC8okMGjoIfZAP8VcirRD6Eu2uBQ4PqJHj7NYKuBz83F2rvRhb4D32iCC0Iar2URocbEEw1dZCf4GFamZBnVz4OLt49k3ejs1UFx2eMondXTlCApOe';
      const META_SPEND_CACHE_MS = 5 * 60 * 1000; // 5 min

      // --- BUBBLE PARAM (PLACEHOLDER) ---
      // No Bubble, substitua o valor abaixo pelo id do vendedor logado (uuid).
      // Exemplo: const LOGGED_SELLER_ID = "3448191a-909f-4ffb-b629-ec3df7104b6b";
      const LOGGED_SELLER_ID = "3448191a-909f-4ffb-b629-ec3df7104b6b";

      // Controle de acesso (UI-level): líder vê global; vendedor comum vê só o próprio.
      let access = {
        sellerId: null,
        sellerName: null,
        isLeader: false,
        ready: false
      };

      // --- REGRAS DE NEGÓCIO (METAS) ---
      const TARGET_REVENUE_MONTHLY = 2100000; // R$ 2.1M
      
      // --- PIPELINE (Targets + limites de outlier) ---
      const PIPELINE_TARGETS = {
        atendimentoMin: 60,          // 60min
        meetingToProposalHours: 24,  // 24h
        proposalToCloseDays: 7       // 7d
      };
      const PIPELINE_LIMITS = {
        atendimentoMaxMin: 30 * 24 * 60,          // 30 dias
        meetingToProposalMaxHours: 30 * 24,       // 30 dias
        proposalToCloseMaxDays: 90,               // 90 dias
        proposalLookbackDays: 120                 // buffer para achar "última proposta" antes do fechamento
      };

      // --- PARAMS (Bubble -> widget) ---
      // Padrão: receber via `params` no Header do Bubble (loader chama init(root, params)).
      // Fallback: objeto global setado pelo wrapper do widget.
      const WISH_BOARD_PARAMS = (typeof window !== 'undefined' && window.__WISH_BOARD_PARAMS__) ? window.__WISH_BOARD_PARAMS__ : {};

      function getMonthlyTarget() {
        const raw = (WISH_BOARD_PARAMS && WISH_BOARD_PARAMS.monthlyTarget !== undefined)
          ? WISH_BOARD_PARAMS.monthlyTarget
          : null;
        const v = typeof raw === 'number' ? raw : parseFloat(String(raw || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(v) && v > 0 ? v : TARGET_REVENUE_MONTHLY;
      }

      // --- ETAPAS (cache) ---
      const __etapaIdCache = {};

      async function getEtapaIdByName(name) {
        if (!sbClient || !name) return null;
        if (__etapaIdCache[name]) return __etapaIdCache[name];
        try {
          const { data } = await sbClient
            .from('etapa')
            .select('id, name')
            .eq('name', name)
            .limit(1)
            .single();
          const id = data && data.id ? data.id : null;
          if (id) __etapaIdCache[name] = id;
          return id;
        } catch (e) {
          return null;
        }
      }

      const chunkArray = (arr, size = 500) => {
        const out = [];
        for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // --- DATA CUT-OFF (corte) ---
      // Regra: se applyCutoff=true e cutoffDate válido, filtra *todas* as queries (exceto vendedores) para ignorar dados antigos.
      // Semântica confirmada: estrito ">" (não inclui o instante do corte).
      // Timezone: interpretar como local (Date(...) no browser) e derivar:
      // - cutoffInstantIso: ISO para colunas timestamp (created_at, dataFechamento, etc.)
      // - cutoffYmdLocal: YYYY-MM-DD para colunas tipo date-string (agendamento.data)
      function parseCutoff(params) {
        try {
          const enabled = !!(params && params.applyCutoff === true && params.cutoffDate);
          if (!enabled) return { enabled: false, cutoffInstantIso: null, cutoffYmdLocal: null };
          const d = new Date(params.cutoffDate); // interpreta em timezone local quando não há TZ explícito
          if (!d || isNaN(d.getTime())) return { enabled: false, cutoffInstantIso: null, cutoffYmdLocal: null };

          const pad2 = (n) => String(n).padStart(2, '0');
          const cutoffYmdLocal = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          const cutoffInstantIso = d.toISOString();
          return { enabled: true, cutoffInstantIso, cutoffYmdLocal };
        } catch (e) {
          return { enabled: false, cutoffInstantIso: null, cutoffYmdLocal: null };
        }
      }

      const cutoff = parseCutoff(WISH_BOARD_PARAMS);

      function applyCutoffTimestamp(query, column) {
        if (!cutoff.enabled || !cutoff.cutoffInstantIso || !query) return query;
        try { return query.gt(column, cutoff.cutoffInstantIso); } catch (e) { return query; }
      }

      function applyCutoffDateYmd(query, column) {
        if (!cutoff.enabled || !cutoff.cutoffYmdLocal || !query) return query;
        try { return query.gt(column, cutoff.cutoffYmdLocal); } catch (e) { return query; }
      }

      // --- MEETINGS FILTER (statusReuniao) ---
      // Regra de produto: incluir agendadas + ocorridas; excluir canceladas.
      function isMeetingCanceled(statusRaw) {
        return String(statusRaw || '').trim() === 'Cancelada';
      }

      function applyMeetingNotCanceledFilter(query) {
        // Importante: .neq não inclui NULL; como NULL não é “Cancelada”, incluímos via OR.
        try { return query.or('statusReuniao.is.null,statusReuniao.neq.Cancelada'); } catch (e) { return query; }
      }

      // DATA (Estado Global)
      let state = {
        dateFilter: 'month', // today, week, month, year
        selectedSeller: null, // null = todos
        marketingInvestment: 120000,
        marketingInvestmentPrev: 0,
        __metaSpendCache: null,
        __metaSpendCachePrev: null,
        channelInvestments: { landing: 5000, whatsapp: 2000, outbound: 0, social: 0 },
        theme: 'light',
        rankingTab: 'executives', // executives | meetings
        rankingData: [],
        rankingSort: 'score', // score | proposals | meetings | sales | frt | cycle
        conversionRates: [0, 0, 0], // [taxaLead, taxaProposta, taxaReuniao]
        channelData: [], // { name, leads, revenue, roi, icon, color, active }
        sellerNameById: {}, // cache para exibir nome do executivo nas reuniões
        meetingsTab: { upcoming: [], past: [], total: 0 },
        meetingsById: {}, // lookup para modal
        pipelineRows: [], // [{ id, name, eff, avgs:{...}, times:{...} }]
        kpis: [
           { t:"Faturamento", v:"R$ --", i:"dollar-sign", bg:"icon-bg-blue", vs1: {v:0, l:"vs mês anterior", up:true}, vs2: {v:0, l:"vs meta", up:true}, vs3: {v:0, l:"vs ano ant", up:true} },
           { t:"Conversão Global", v:"--", i:"refresh-cw", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"Vendas Realizadas", v:"--", i:"shopping-cart", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"Ticket Médio", v:"R$ --", i:"trending-up", bg:"icon-bg-blue", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"Leads Ativos", v:"--", i:"users", bg:"icon-bg-gray", vs1: { v: 0, l: "vs mês anterior", up: false }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"Leads Captados", v:"--", i:"user-plus", bg:"icon-bg-blue", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"Investimento Mkt", v:"R$ --", i:"target", bg:"icon-bg-orange", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"CAC", v:"R$ --", i:"credit-card", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: false }, vs2: { v: 0, l: "vs méd. pond.", up: false }, vs3: { v: 0, l: "vs 2024", up: false } },
           { t:"ROAS", v:"--", i:"bar-chart-3", bg:"icon-bg-purple", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } }
        ]
      };

      // --- BASELINE 2024 (mocado) - RELAÇÕES ---
      // Fonte: números consolidados informados pelo Mauro (2024).
      // Usamos apenas para comparação "vs 2024" (badges vs3), escalando por dias do range do header.
      // Observação: aqui "Leads Captados" (KPI) mapeia para "Leads Recebidos" do consolidado.
      // "Leads Ativos" (KPI) não existe no consolidado; mapeamos para "Oportunidades" como proxy (qualificados).
      const MOCK_2024_TOTALS = (() => {
        const year = 2024;

        // Totais anuais
        const investimento = 4374366; // R$
        const visitantes = 1375;
        const leadsRecebidos = 194515;
        const oportunidades = 29365;
        const reunioes = 1;
        const propostas = 36974;
        const vendas = 1632;
        const faturamento = 24375886.24; // R$

        // Derivados anuais (referência)
        const convPct = leadsRecebidos > 0 ? (vendas / leadsRecebidos) * 100 : 0;
        const ticket = vendas > 0 ? (faturamento / vendas) : 0;
        const cac = vendas > 0 ? (investimento / vendas) : 0;
        const roas = investimento > 0 ? (faturamento / investimento) : 0;

        return {
          year,
          investimento,
          visitantes,
          leadsRecebidos,
          oportunidades,
          reunioes,
          propostas,
          vendas,
          faturamento,
          convPct,
          ticket,
          cac,
          roas,
        };
      })();

      // --- BASELINE 2025 (mocado) - YTD (média ponderada do ano) ---
      // Fonte: Funil Consolidado 2025 (01/01 até "hoje" do print).
      // Usamos apenas para o comparativo "Méd." (vs2) dos KPIs.
      // Observação de mapeamento:
      // - Leads Captados (KPI) -> Leads Recebidos (consolidado)
      // - Leads Ativos (KPI) -> Oportunidades (proxy/qualificados)
      const MOCK_2025_YTD_TOTALS = (() => {
        const year = 2025;
        const investimento = 3949968; // R$
        const visitantes = 1244;
        const leadsRecebidos = 150778;
        const oportunidades = 32272;
        const reunioes = 3922;
        const propostas = 30614;
        const vendas = 1765;
        const faturamento = 21956721.91; // R$

        const convPct = leadsRecebidos > 0 ? (vendas / leadsRecebidos) * 100 : 0;
        const ticket = vendas > 0 ? (faturamento / vendas) : 0;
        const cac = vendas > 0 ? (investimento / vendas) : 0;
        const roas = investimento > 0 ? (faturamento / investimento) : 0;

        return {
          year,
          investimento,
          visitantes,
          leadsRecebidos,
          oportunidades,
          reunioes,
          propostas,
          vendas,
          faturamento,
          convPct,
          ticket,
          cac,
          roas,
        };
      })();

      // RangeDays INCLUSIVO (evita variações por timezone/DST usando apenas a parte YYYY-MM-DD do ISO)
      function getInclusiveRangeDays(startIso, endIso) {
        try {
          const toNoonLocal = (iso) => {
            const ymd = String(iso || '').slice(0, 10); // YYYY-MM-DD
            const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10));
            if (!y || !m || !d) return null;
            return new Date(y, (m - 1), d, 12, 0, 0, 0);
          };
          const s = toNoonLocal(startIso);
          const e = toNoonLocal(endIso);
          if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
          const diffDays = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
          return Math.max(1, diffDays + 1);
        } catch (e) {
          return 1;
        }
      }

      // Baseline 2024 equivalente ao range do header (pro-rata por dias)
      function getBaseline2024ForRange(rangeDays) {
        const daysIn2024 = 366; // 2024 bissexto
        const factor = Math.max(0, Math.min(1, (Number(rangeDays) || 0) / daysIn2024));

        const investimento = MOCK_2024_TOTALS.investimento * factor;
        const faturamento = MOCK_2024_TOTALS.faturamento * factor;
        const captados = MOCK_2024_TOTALS.leadsRecebidos * factor;
        const vendas = MOCK_2024_TOTALS.vendas * factor;
        const leadsAtivosProxy = MOCK_2024_TOTALS.oportunidades * factor;

        const convPct = captados > 0 ? (vendas / captados) * 100 : 0;
        const ticket = vendas > 0 ? (faturamento / vendas) : 0;
        const cac = vendas > 0 ? (investimento / vendas) : 0;
        const roas = investimento > 0 ? (faturamento / investimento) : 0;

        return {
          year: MOCK_2024_TOTALS.year,
          factor,
          investimento,
          faturamento,
          captados,
          vendas,
          leadsAtivosProxy,
          convPct,
          ticket,
          cac,
          roas,
        };
      }

      // Baseline 2025 YTD equivalente ao range do header (média ponderada do ano por dias decorridos)
      function getBaseline2025YtdForRange(rangeDays, nowRef = null) {
        try {
          const now = nowRef instanceof Date ? nowRef : new Date();
          const year = now.getFullYear();
          const startOfYear = new Date(year, 0, 1, 12, 0, 0, 0);
          const endOfToday = new Date(year, now.getMonth(), now.getDate(), 12, 0, 0, 0);
          const daysElapsed = Math.max(1, Math.round((endOfToday.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          // fator do período vs dias decorridos do ano (clamp 0..1 para não extrapolar)
          const factor = Math.max(0, Math.min(1, (Number(rangeDays) || 0) / daysElapsed));

          const investimento = MOCK_2025_YTD_TOTALS.investimento * factor;
          const faturamento = MOCK_2025_YTD_TOTALS.faturamento * factor;
          const captados = MOCK_2025_YTD_TOTALS.leadsRecebidos * factor;
          const vendas = MOCK_2025_YTD_TOTALS.vendas * factor;
          const leadsAtivosProxy = MOCK_2025_YTD_TOTALS.oportunidades * factor;

          const convPct = captados > 0 ? (vendas / captados) * 100 : 0;
          const ticket = vendas > 0 ? (faturamento / vendas) : 0;
          const cac = vendas > 0 ? (investimento / vendas) : 0;
          const roas = investimento > 0 ? (faturamento / investimento) : 0;

          return {
            year: MOCK_2025_YTD_TOTALS.year,
            factor,
            daysElapsed,
            investimento,
            faturamento,
            captados,
            vendas,
            leadsAtivosProxy,
            convPct,
            ticket,
            cac,
            roas,
          };
        } catch (e) {
          // fallback seguro
          return {
            year: MOCK_2025_YTD_TOTALS.year,
            factor: 0,
            daysElapsed: 1,
            investimento: 0,
            faturamento: 0,
            captados: 0,
            vendas: 0,
            leadsAtivosProxy: 0,
            convPct: 0,
            ticket: 0,
            cac: 0,
            roas: 0,
          };
        }
      }

      // --- REFRESH (debounce + last updated) ---
      const REFRESH_DEBOUNCE_MS = 1000;
      let refreshTimer = null;
      let lastUpdatedAt = null;
      let lastUpdatedSource = null;
      let refreshFlags = { meetings: false, ranking: false, revenue: false, pipeline: false };
      let liveBadgeInterval = null;

      function setLastUpdated(source) {
        lastUpdatedAt = new Date();
        lastUpdatedSource = source || 'manual';
        updateLiveBadge();
      }

      function updateLiveBadge() {
        const el = document.getElementById('badge-live-text');
        if (!el) return;
        if (!lastUpdatedAt) {
          el.textContent = 'Aguardando atualização...';
          return;
        }
        const diffMs = Date.now() - lastUpdatedAt.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) {
          el.textContent = 'Atualizado agora';
          return;
        }
        const diffMin = Math.floor(diffSec / 60);
        el.textContent = `Atualizado há ${diffMin}min`;
      }

      // --- ACCESS CONTROL (Bubble -> vendedores) ---
      function extractUuid(input) {
        if (input === null || input === undefined) return null;
        const str = String(input).trim();
        if (!str) return null;
        // Bubble às vezes injeta valores com aspas/colchetes ou texto junto.
        // Extraímos o UUID "puro" de dentro da string para validar/usar.
        const m = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        return m ? m[0] : null;
      }

      function isUuid(v) {
        const u = extractUuid(v);
        return typeof u === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);
      }

      // Bubble às vezes só disponibiliza o id após workflows/login.
      // Permitimos também passar via JS em `window.BUBBLE_LOGGED_SELLER_ID`.
      function getLoggedSellerIdRaw() {
        // 1) Preferir valor setado dinamicamente por workflow (Run javascript)
        if (typeof window !== 'undefined') {
          if (window.BUBBLE_LOGGED_SELLER_ID) return window.BUBBLE_LOGGED_SELLER_ID;
          if (window.idVendedor) return window.idVendedor;
          if (window.loggedSellerId) return window.loggedSellerId;
        }
        // 2) Fallback: constante hardcoded/dinâmica do Bubble no HTML
        return LOGGED_SELLER_ID;
      }

      function showAccessDenied(message) {
        const container = document.getElementById('dashboard-acelerai-v2');
        const skeleton = document.getElementById('dashboard-skeleton');
        const content = document.getElementById('dashboard-content');
        if (skeleton) skeleton.style.display = 'none';
        if (content) content.style.display = 'none';
        if (!container) return;

        const msg = message || 'Usuário não identificado.';
        container.innerHTML = `
          <div class="card" style="max-width:720px; margin: 0 auto;">
            <div class="section-title">Acesso negado</div>
            <div class="section-subtitle" style="margin-top:6px;">
              ${msg}
            </div>
            <div class="text-sm text-muted" style="margin-top:12px;">
              Verifique se o Bubble está passando o <b>id_vendedor</b> corretamente para este widget.
            </div>
          </div>
        `;
      }

      async function initAccessControl() {
        if (!sbClient) return false;

        // Espera curta para o Bubble “injetar” o id (quando vem de workflow/login).
        const ACCESS_WAIT_MS = 8000;
        const ACCESS_POLL_MS = 200;
        const startedAt = Date.now();

        let raw = '';
        let sellerId = null;
        while (!sellerId && (Date.now() - startedAt) < ACCESS_WAIT_MS) {
          raw = String(getLoggedSellerIdRaw() || '').trim();
          sellerId = extractUuid(raw);
          if (sellerId) break;
          await new Promise(r => setTimeout(r, ACCESS_POLL_MS));
        }

        if (!sellerId) {
          console.warn('[Access] id_vendedor inválido ou não informado (timeout):', { received: raw });
          showAccessDenied('id_vendedor inválido ou não informado.');
          return false;
        }

        const { data, error } = await sbClient
          .from('vendedores')
          .select('id, nome, diretorVendas, usuarioInterno')
          .eq('id', sellerId)
          .maybeSingle();

        if (error) {
          console.error('Erro ao validar vendedor logado:', error);
          showAccessDenied('Erro ao validar o usuário no banco.');
          return false;
        }

        if (!data || !data.id) {
          showAccessDenied('Vendedor não encontrado.');
          return false;
        }

        access.sellerId = data.id;
        access.sellerName = data.nome || null;
        access.isLeader = !!data.diretorVendas;
        access.ready = true;

        if (!access.isLeader) {
          // Vendedor comum: trava visão no próprio vendedor
          state.selectedSeller = access.sellerId;
        } else {
          // Líder: visão global (por padrão)
          state.selectedSeller = null;
        }

        // Ajuste do seletor de vendedor (UI)
        const select = document.getElementById('seller-select');
        const wrapper = select ? select.closest('.select-wrapper') : null;
        if (select) {
          if (access.isLeader) {
            select.disabled = false;
            if (wrapper) wrapper.style.display = '';
          } else {
            // Vendedor comum: exibe dropdown, mas SEM visão por executivo individual.
            // Deve permitir apenas "Minha visão" e "Todos os executivos".
            select.disabled = false;
            if (wrapper) wrapper.style.display = '';

            // Monta opções controladas (sem listar executivos individuais)
            select.innerHTML = `
              <option value="">Todos os executivos</option>
              <option value="${access.sellerId}">${access.sellerName || 'Meu executivo'}</option>
            `;
            select.value = access.sellerId;

            // Listener (apenas 2 opções). Se alguém tentar injetar outro valor, reverte.
            if (!select.dataset.scopeBound) {
              select.dataset.scopeBound = '1';
              select.addEventListener('change', (e) => {
                const val = (e.target && e.target.value) ? String(e.target.value) : '';
                if (val === '') {
                  state.selectedSeller = null; // visão global
                } else if (val === access.sellerId) {
                  state.selectedSeller = access.sellerId; // minha visão
                } else {
                  // hard-guard: não permitir visão individual de outros executivos
                  state.selectedSeller = access.sellerId;
                  select.value = access.sellerId;
                }
                fetchDataWithStamp('seller');
              });
            }
          }
        }

        return true;
      }

      function scheduleRefresh(reason, opts = {}) {
        // Default: Ranking + Reuniões + Pipeline; Receita apenas quando necessário (ex: mudança em leads).
        refreshFlags.meetings = true;
        refreshFlags.ranking = true;
        refreshFlags.pipeline = true;
        if (opts.revenue) refreshFlags.revenue = true;

        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
          const doMeetings = refreshFlags.meetings;
          const doRanking = refreshFlags.ranking;
          const doRevenue = refreshFlags.revenue;
            const doPipeline = refreshFlags.pipeline;
            refreshFlags = { meetings: false, ranking: false, revenue: false, pipeline: false };
          refreshTimer = null;

          try {
            const tasks = [];
            if (doRevenue) tasks.push(fetchRevenue());
            if (doMeetings) tasks.push(fetchMeetings());
            if (doMeetings) tasks.push(fetchMeetingsTab());
            if (doRanking) tasks.push(fetchRankingData());
              if (doPipeline) tasks.push(fetchPipelineData());
            const results = await Promise.allSettled(tasks);
            results.forEach((r) => {
              if (r && r.status === 'rejected') console.error('Erro em refresh task:', r.reason);
            });
            setLastUpdated(reason || 'realtime');
          } catch (e) {
            console.error('Erro no refresh (debounced):', e);
          }
        }, REFRESH_DEBOUNCE_MS);
      }

      async function fetchDataWithStamp(reason) {
        await fetchData();
        setLastUpdated(reason || 'manual');
      }

      // EXPOSED FUNCTIONS
      window.updateMarketingInvestment = (value) => {
          state.marketingInvestment = parseFloat(value) || 0;
          fetchDataWithStamp('marketingInvestment');
      };
      
      window.updateChannelInvestment = (channel, value) => {
          if (state.channelInvestments[channel] !== undefined) {
              state.channelInvestments[channel] = parseFloat(value) || 0;
              // Recalcular apenas ROI se os dados já existirem, ou refazer fetch completo
              fetchChannelData().then(() => setLastUpdated('channelInvestment'));
          }
      };

      // UTILS
      const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
      const parseCurrency = (input) => {
        if (input === null || input === undefined) return 0;
        if (typeof input === 'number') return Number.isFinite(input) ? input : 0;

        let str = String(input).trim();
        if (!str) return 0;

        // Normaliza formatos BR (ex: "R$ 1.200,00") e US (ex: "1200.00")
        str = str.replace(/\s/g, '');
        str = str.replace(/R\$/gi, '');
        str = str.replace(/[^\d.,-]/g, '');

        // Se tiver '.' e ',' juntos, assume '.' como milhar e ',' como decimal
        if (str.includes('.') && str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
          // Apenas ',' => decimal brasileiro
          str = str.replace(',', '.');
        }

        const n = parseFloat(str);
        return Number.isFinite(n) ? n : 0;
      };

      function toYmdLocal(d) {
        const pad2 = (n) => String(n).padStart(2, '0');
        try {
          const dt = (d instanceof Date) ? d : new Date(d);
          if (!dt || Number.isNaN(dt.getTime())) return null;
          return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
        } catch (e) {
          return null;
        }
      }

      function addDaysYmd(ymd, days) {
        try {
          const s = String(ymd || '').trim();
          if (!s) return null;
          const dt = new Date(`${s}T00:00:00`);
          if (Number.isNaN(dt.getTime())) return null;
          dt.setDate(dt.getDate() + (Number(days) || 0));
          return toYmdLocal(dt);
        } catch (e) {
          return null;
        }
      }

      function applyCutoffToYmdRange(startYmd, endYmd) {
        // Semântica do cutoff no widget: estrito ">".
        // Para colunas DATE usamos cutoffYmdLocal e então o primeiro dia válido é cutoff+1.
        try {
          if (!cutoff || !cutoff.enabled || !cutoff.cutoffYmdLocal) return { startYmd, endYmd };
          const minStart = addDaysYmd(cutoff.cutoffYmdLocal, 1);
          if (!minStart) return { startYmd, endYmd };
          const effStart = (startYmd && startYmd > minStart) ? startYmd : minStart;
          return { startYmd: effStart, endYmd };
        } catch (e) {
          return { startYmd, endYmd };
        }
      }

      async function fetchMarketingSpend() {
        // Busca spend total (Meta Ads) para o período do header e também para o período anterior,
        // para permitir comparativos "vs mês anterior" em Investimento/CAC/ROAS.
        try {
          const { start, end } = getDateRange(state.dateFilter);
          const prevRange = getPreviousDateRange(state.dateFilter);
          let startYmd = toYmdLocal(new Date(start));
          let endYmd = toYmdLocal(new Date(end));
          if (!startYmd || !endYmd) return;

          // Aplicar cutoff antes do range (consistência com resto do dashboard)
          const eff = applyCutoffToYmdRange(startYmd, endYmd);
          startYmd = eff.startYmd;
          endYmd = eff.endYmd;

          // Se o cutoff “empurrou” o início além do fim, não há período válido => gasto 0
          if (startYmd && endYmd && startYmd > endYmd) {
            state.marketingInvestment = 0;
            state.__metaSpendCache = { key: `empty|${startYmd}|${endYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}`, value: 0, fetchedAt: Date.now() };
            return;
          }

          const cacheKey = `${startYmd}|${endYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}`;
          const cache = state.__metaSpendCache;
          if (cache && cache.key === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt) < META_SPEND_CACHE_MS) {
            if (typeof cache.value === 'number' && Number.isFinite(cache.value)) {
              state.marketingInvestment = cache.value;
            }
          } else {
            const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
            url.searchParams.set('fields', 'spend,account_currency');
            url.searchParams.set('limit', '1');
            url.searchParams.set('time_range', JSON.stringify({ since: startYmd, until: endYmd }));
            url.searchParams.set('access_token', META_ACCESS_TOKEN);

            const res = await fetch(url.toString(), { method: 'GET', mode: 'cors' });
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              throw new Error(`Meta insights HTTP ${res.status}: ${txt}`);
            }
            const json = await res.json();
            const row = (json && Array.isArray(json.data) && json.data.length > 0) ? json.data[0] : null;
            const spend = row && row.spend != null ? Number(String(row.spend).replace(',', '.')) : 0;
            const spendVal = (Number.isFinite(spend) && spend >= 0) ? spend : 0;

            state.marketingInvestment = spendVal;
            state.__metaSpendCache = { key: cacheKey, value: spendVal, fetchedAt: Date.now() };
          }

          // --- período anterior (para vs mês anterior) ---
          let prevStartYmd = toYmdLocal(new Date(prevRange.start));
          let prevEndYmd = toYmdLocal(new Date(prevRange.end));
          if (!prevStartYmd || !prevEndYmd) return;

          const effPrev = applyCutoffToYmdRange(prevStartYmd, prevEndYmd);
          prevStartYmd = effPrev.startYmd;
          prevEndYmd = effPrev.endYmd;

          if (prevStartYmd && prevEndYmd && prevStartYmd > prevEndYmd) {
            state.marketingInvestmentPrev = 0;
            state.__metaSpendCachePrev = { key: `empty|${prevStartYmd}|${prevEndYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}`, value: 0, fetchedAt: Date.now() };
            return;
          }

          const prevKey = `${prevStartYmd}|${prevEndYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}`;
          const prevCache = state.__metaSpendCachePrev;
          if (prevCache && prevCache.key === prevKey && prevCache.fetchedAt && (Date.now() - prevCache.fetchedAt) < META_SPEND_CACHE_MS) {
            if (typeof prevCache.value === 'number' && Number.isFinite(prevCache.value)) {
              state.marketingInvestmentPrev = prevCache.value;
            }
            return;
          }

          const urlPrev = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
          urlPrev.searchParams.set('fields', 'spend,account_currency');
          urlPrev.searchParams.set('limit', '1');
          urlPrev.searchParams.set('time_range', JSON.stringify({ since: prevStartYmd, until: prevEndYmd }));
          urlPrev.searchParams.set('access_token', META_ACCESS_TOKEN);

          const resPrev = await fetch(urlPrev.toString(), { method: 'GET', mode: 'cors' });
          if (!resPrev.ok) {
            const txt = await resPrev.text().catch(() => '');
            throw new Error(`Meta insights(prev) HTTP ${resPrev.status}: ${txt}`);
          }
          const jsonPrev = await resPrev.json();
          const rowPrev = (jsonPrev && Array.isArray(jsonPrev.data) && jsonPrev.data.length > 0) ? jsonPrev.data[0] : null;
          const spendPrev = rowPrev && rowPrev.spend != null ? Number(String(rowPrev.spend).replace(',', '.')) : 0;
          const spendPrevVal = (Number.isFinite(spendPrev) && spendPrev >= 0) ? spendPrev : 0;

          state.marketingInvestmentPrev = spendPrevVal;
          state.__metaSpendCachePrev = { key: prevKey, value: spendPrevVal, fetchedAt: Date.now() };
        } catch (e) {
          console.error('Erro ao buscar Investimento Mkt (Meta Ads):', e);
          // fallback: mantém valor anterior
        }
      }

      // --- RANKING TAB (Executivos x Reuniões) ---
      const escapeHtmlLite = (val) => {
        if (val === null || val === undefined) return '';
        return String(val)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      window.setRankingTab = (tab) => {
        const next = (tab === 'meetings') ? 'meetings' : 'executives';
        state.rankingTab = next;

        const btnExec = document.getElementById('ranking-tab-executives');
        const btnMeet = document.getElementById('ranking-tab-meetings');
        const viewExec = document.getElementById('ranking-executives-view');
        const viewMeet = document.getElementById('ranking-meetings-view');
        const ctrlExec = document.getElementById('ranking-controls-executives');
        const ctrlMeet = document.getElementById('ranking-controls-meetings');

        if (btnExec) {
          btnExec.classList.toggle('active', next === 'executives');
          btnExec.setAttribute('aria-selected', next === 'executives' ? 'true' : 'false');
        }
        if (btnMeet) {
          btnMeet.classList.toggle('active', next === 'meetings');
          btnMeet.setAttribute('aria-selected', next === 'meetings' ? 'true' : 'false');
        }
        if (viewExec) viewExec.style.display = (next === 'executives') ? '' : 'none';
        if (viewMeet) viewMeet.style.display = (next === 'meetings') ? '' : 'none';
        if (ctrlExec) ctrlExec.style.display = (next === 'executives') ? '' : 'none';
        if (ctrlMeet) ctrlMeet.style.display = (next === 'meetings') ? '' : 'none';

        // Garantir dados ao abrir a aba de reuniões
        if (next === 'meetings') {
          fetchMeetingsTab().catch(() => {});
        }

        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
      };

      function meetingStatusPillClass(statusRaw, isUpcoming) {
        const s = String(statusRaw || '').toLowerCase();
        if (isUpcoming || s.includes('agend')) return 'meeting-pill meeting-pill--scheduled';
        if (s.includes('cancel')) return 'meeting-pill meeting-pill--cancel';
        if (s.includes('realiz') || s.includes('conclu') || s.includes('feito')) return 'meeting-pill meeting-pill--done';
        return 'meeting-pill';
      }

      function parseMeetingDateTimeYmdHm(ymd, hm) {
        const d = String(ymd || '').trim();
        if (!d) return null;
        const time = String(hm || '00:00').trim() || '00:00';
        const isoLocal = `${d}T${time}:00`;
        const dt = new Date(isoLocal);
        return Number.isNaN(dt.getTime()) ? null : dt;
      }

      function formatMeetingWhen(dt) {
        if (!dt) return '--';
        try {
          const d = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
          const t = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `${d} • ${t}`;
        } catch (e) { return '--'; }
      }

      function scoreColor(score) {
        const s = Number(score);
        if (!Number.isFinite(s)) return '#94a3b8';
        if (s >= 70) return '#22c55e';
        if (s >= 40) return '#f59e0b';
        return '#ef4444';
      }

      function scoreDeg(score) {
        const s = Math.max(0, Math.min(100, Number(score) || 0));
        return `${(s / 100) * 360}deg`;
      }

      function cleanAiNote(text) {
        const raw = String(text || '');
        if (!raw.trim()) return '';
        return raw
          .replace(/\r/g, '')
          // remove headings tipo ## Título
          .replace(/^\s*#{1,6}\s*/gm, '')
          // remove negrito/ênfase markdown (**texto**, *texto*, ***)
          .replace(/\*{1,3}/g, '')
          .replace(/_{1,3}/g, '')
          // remove backticks
          .replace(/`+/g, '')
          .trim();
      }

      function formatAiNoteHtml(cleanText) {
        const txt = String(cleanText || '').trim();
        if (!txt) return '';

        // Trabalha com HTML escapado (seguro) e aplica uma formatação leve.
        const escaped = escapeHtmlLite(txt);
        const lines = escaped.split('\n');

        const sections = [];
        let current = { title: null, parts: [] };

        const pushCurrent = () => {
          if (current.title || current.parts.length) sections.push(current);
          current = { title: null, parts: [] };
        };

        const isTitleLine = (l) => {
          const t = (l || '').trim();
          if (!t) return false;
          // heurística: títulos curtos sem pontuação forte, ou conhecidos
          const known = ['Resumo Executivo','Pontos Positivos','Pontos de Atenção','Análise SPIN','Sugestão Prática','Situação','Problema','Implicação','Necessidade'];
          if (known.some(k => t.toLowerCase() === k.toLowerCase())) return true;
          if (known.some(k => t.toLowerCase().startsWith((k + ':').toLowerCase()))) return true;
          if (t.length <= 28 && !t.includes('.') && !t.includes(';') && !t.includes(',')) return true;
          return false;
        };

        let bulletBuffer = [];
        const flushBullets = () => {
          if (bulletBuffer.length === 0) return;
          current.parts.push({ type: 'ul', items: bulletBuffer });
          bulletBuffer = [];
        };

        lines.forEach((lineRaw) => {
          const line = (lineRaw || '').trim();
          if (!line) {
            flushBullets();
            current.parts.push({ type: 'spacer' });
            return;
          }

          const bulletMatch = line.match(/^-\s+(.*)$/);
          if (bulletMatch) {
            bulletBuffer.push(bulletMatch[1]);
            return;
          }

          // Se vinha em lista e entrou texto normal
          flushBullets();

          // Título: inicia nova seção
          if (isTitleLine(line)) {
            pushCurrent();
            // remove possível ":" no fim
            current.title = line.replace(/:\s*$/, '');
            return;
          }

          current.parts.push({ type: 'p', text: line });
        });

        flushBullets();
        pushCurrent();

        // Render HTML
        const out = [];
        out.push('<div class="ai-block">');
        sections.forEach((sec) => {
          if (sec.title) out.push(`<div class="ai-section-title">${sec.title}</div>`);
          let paraLines = [];
          const flushPara = () => {
            const merged = paraLines.filter(Boolean).join(' ');
            if (merged) out.push(`<div class="ai-paragraph">${merged}</div>`);
            paraLines = [];
          };

          sec.parts.forEach((p) => {
            if (p.type === 'p') {
              paraLines.push(p.text);
              return;
            }
            if (p.type === 'ul') {
              flushPara();
              out.push('<div class="ai-paragraph">');
              out.push('<ul class="ai-list">');
              (p.items || []).forEach(it => out.push(`<li>${it}</li>`));
              out.push('</ul>');
              out.push('</div>');
              return;
            }
            if (p.type === 'spacer') {
              flushPara();
            }
          });
          flushPara();
        });
        out.push('</div>');
        return out.join('');
      }

      async function fetchMeetingsTab() {
        if (!sbClient) return;

        // Vendedor comum: pelo menos o próprio nome deve existir no cache
        try {
          if (access && access.ready && access.sellerId && access.sellerName) {
            if (!state.sellerNameById[access.sellerId]) state.sellerNameById[access.sellerId] = access.sellerName;
          }
        } catch (e) {}

        const rangeMeet = getMeetingsDateRange(state.dateFilter);
        const startYmd = rangeMeet.startYmd;
        const endYmd = rangeMeet.endYmd;

        const trySelect = async (selectStr) => {
          let q = sbClient.from('agendamento').select(selectStr);
          q = applyCutoffDateYmd(q, 'data').gte('data', startYmd).lte('data', endYmd);
          q = applyMeetingNotCanceledFilter(q);
          if (state.selectedSeller) q = q.eq('vendedor', state.selectedSeller);
          const { data, error } = await q;
          if (error) return { data: null, error };
          return { data: data || [], error: null };
        };

        // Se for líder e ainda não temos cache de nomes, carrega uma vez (sem mexer no select)
        try {
          const isLeader = !!(access && access.ready && access.isLeader);
          const hasCache = state.sellerNameById && Object.keys(state.sellerNameById).length > 0;
          if (isLeader && !hasCache) {
            const { data: sellers } = await sbClient
              .from('vendedores')
              .select('id, nome')
              .eq('usuarioInterno', false);
            const map = {};
            (sellers || []).forEach(s => { if (s && s.id) map[s.id] = s.nome || String(s.id); });
            state.sellerNameById = map;
          }
        } catch (e) {}

        // Campos extras são opcionais (podem não existir no schema). Faz fallback automático.
        const attempts = [
          'id, data, hora, statusReuniao, vendedor, leadId, score_final, score_justificativa, relatorio_ia, linkMeet',
          'id, data, hora, statusReuniao, vendedor, leadId, score_final, score_justificativa, relatorio_ia',
          'id, data, hora, statusReuniao, vendedor, leadId, score_final',
          'id, data, hora, statusReuniao, vendedor, leadId'
        ];

        let rows = [];
        for (const sel of attempts) {
          const { data, error } = await trySelect(sel);
          if (!error) { rows = data || []; break; }
          const msg = String(error?.message || '').toLowerCase();
          if (!msg.includes('column') && !msg.includes('does not exist') && !msg.includes('unknown')) {
            console.warn('Erro agendamento (meetingsTab):', error);
            rows = [];
            break;
          }
        }

        const leadIds = Array.from(new Set((rows || []).map(r => r && r.leadId).filter(Boolean)));
        const leadInfoById = {};
        for (const chunk of chunkArray(leadIds, 500)) {
          const { data: leadsChunk } = await sbClient
            .from('leads')
            .select('lead_id, nome, empresa')
            .in('lead_id', chunk);
          (leadsChunk || []).forEach(l => {
            if (!l || !l.lead_id) return;
            leadInfoById[l.lead_id] = { nome: l.nome || null, empresa: l.empresa || null };
          });
        }

        const now = new Date();
        const upcoming = [];
        const past = [];
        const byId = {};

        (rows || []).forEach(r => {
          if (!r) return;
          const dt = parseMeetingDateTimeYmdHm(r.data, r.hora);
          const isUpcoming = dt ? (dt.getTime() > now.getTime()) : false;
          const sellerName = (r.vendedor && state.sellerNameById && state.sellerNameById[r.vendedor])
            ? state.sellerNameById[r.vendedor]
            : (r.vendedor || '--');
          const leadInfo = (r.leadId && leadInfoById[r.leadId]) ? leadInfoById[r.leadId] : null;
          const leadLabel = leadInfo ? (leadInfo.empresa || leadInfo.nome || r.leadId) : (r.leadId || '--');

          // Nota IA: tentamos vários campos possíveis (sem quebrar se não existir)
          const aiNoteRaw = (r.relatorio_ia || r.score_justificativa || r.nota_ia || r.notaIA || '').toString().trim();
          const link = (r.linkMeet || r.linkmeet || r.link || '').toString().trim();

          const item = {
            id: r.id,
            data: r.data,
            hora: r.hora,
            dt,
            when: formatMeetingWhen(dt),
            status: r.statusReuniao || '--',
            vendedorId: r.vendedor || null,
            vendedorNome: sellerName,
            leadId: r.leadId || null,
            leadLabel,
            score: (r.score_final !== null && r.score_final !== undefined && r.score_final !== '') ? Number(r.score_final) : null,
            aiNote: cleanAiNote(aiNoteRaw) || '',
            link: link || ''
          };

          if (item.id) byId[item.id] = item;
          if (isUpcoming) upcoming.push(item); else past.push(item);
        });

        // Ordenação: próximas asc; passadas desc
        upcoming.sort((a, b) => (a.dt?.getTime?.() || 0) - (b.dt?.getTime?.() || 0));
        past.sort((a, b) => (b.dt?.getTime?.() || 0) - (a.dt?.getTime?.() || 0));

        state.meetingsTab = { upcoming, past, total: upcoming.length + past.length };
        state.meetingsById = byId;

        renderMeetingsTab();
      }

      function renderMeetingsTab() {
        const upEl = document.getElementById('meetings-upcoming');
        const pastEl = document.getElementById('meetings-past');
        const countEl = document.getElementById('meetings-tab-count');
        const total = state.meetingsTab?.total ?? 0;
        if (countEl) countEl.textContent = String(total);

        const renderEmpty = (label) => `<div class="text-xs text-muted text-center p-4">${escapeHtmlLite(label)}</div>`;

        const renderRow = (m, isUpcoming) => {
          const score = (m && Number.isFinite(m.score)) ? m.score : null;
          const donut = (score !== null)
            ? `<div class="meeting-donut" style="--chart-color:${scoreColor(score)}; --chart-deg:${scoreDeg(score)}"><div class="meeting-donut-val">${Math.round(score)}</div></div>`
            : `<div class="meeting-donut" style="--chart-color:rgba(148,163,184,0.35); --chart-deg:0deg"><div class="meeting-donut-val">--</div></div>`;

          const pillClass = meetingStatusPillClass(m.status, isUpcoming);
          const subtitle = `${m.when} • ${m.vendedorNome}`;

          return `
            <div class="meeting-row" role="button" tabindex="0" onclick="openMeetingModal('${escapeHtmlLite(m.id)}')">
              ${donut}
              <div class="meeting-row-main">
                <div class="meeting-row-title">${escapeHtmlLite(m.leadLabel || '--')}</div>
                <div class="meeting-row-sub">
                  <span class="${pillClass}">${escapeHtmlLite(m.status || '--')}</span>
                  <span>${escapeHtmlLite(subtitle)}</span>
                </div>
              </div>
              <i data-lucide="chevron-right" size="16" style="color:var(--text-muted); opacity:0.9"></i>
            </div>
          `;
        };

        if (upEl) {
          const list = state.meetingsTab?.upcoming || [];
          upEl.innerHTML = (list.length === 0)
            ? renderEmpty('Nenhuma reunião futura no período.')
            : list.map(m => renderRow(m, true)).join('');
        }
        if (pastEl) {
          const list = state.meetingsTab?.past || [];
          pastEl.innerHTML = (list.length === 0)
            ? renderEmpty('Nenhuma reunião ocorrida no período.')
            : list.map(m => renderRow(m, false)).join('');
        }

        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
      }

      window.openMeetingModal = (meetingId) => {
        const m = state.meetingsById ? state.meetingsById[meetingId] : null;
        if (!m) return;

        const overlay = document.getElementById('meeting-modal');
        const title = document.getElementById('meeting-modal-title');
        const subtitle = document.getElementById('meeting-modal-subtitle');
        const status = document.getElementById('meeting-modal-status');
        const seller = document.getElementById('meeting-modal-seller');
        const lead = document.getElementById('meeting-modal-lead');
        const score = document.getElementById('meeting-modal-score');
        const donut = document.getElementById('meeting-modal-score-donut');
        const donutVal = document.getElementById('meeting-modal-score-donut-val');
        const linkEl = document.getElementById('meeting-modal-link');
        const ai = document.getElementById('meeting-modal-ai');

        if (title) title.textContent = (m.leadLabel && m.leadLabel !== '--') ? String(m.leadLabel) : 'Reunião';
        if (subtitle) subtitle.textContent = `${m.when} • ${m.vendedorNome}`;
        if (status) {
          // status como tag/pill (mesmo esquema da lista)
          const isUpcoming = (m.dt && m.dt.getTime && m.dt.getTime() > Date.now());
          const pillCls = meetingStatusPillClass(m.status, isUpcoming);
          status.innerHTML = `<span class="meeting-modal-status-pill"><span class="${pillCls}">${escapeHtmlLite(m.status || '--')}</span></span>`;
        }
        if (seller) seller.textContent = m.vendedorNome || '--';
        if (lead) lead.textContent = m.leadLabel ? String(m.leadLabel) : (m.leadId ? String(m.leadId) : '--');
        const scoreNum = (m.score !== null && Number.isFinite(m.score)) ? Math.round(m.score) : null;
        if (score) score.textContent = (scoreNum !== null) ? String(scoreNum) : '--';
        if (donutVal) donutVal.textContent = (scoreNum !== null) ? String(scoreNum) : '--';
        if (donut) {
          const col = (scoreNum !== null) ? scoreColor(scoreNum) : 'rgba(148,163,184,0.35)';
          const deg = (scoreNum !== null) ? scoreDeg(scoreNum) : '0deg';
          donut.style.setProperty('--chart-color', col);
          donut.style.setProperty('--chart-deg', deg);
        }
        if (linkEl) {
          if (m.link) {
            // link seguro (sem HTML vindo do banco)
            linkEl.innerHTML = '';
            const a = document.createElement('a');
            a.href = m.link;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Abrir reunião';
            linkEl.appendChild(a);
          } else {
            linkEl.textContent = '--';
          }
        }
        if (ai) {
          if (m.aiNote) {
            ai.innerHTML = formatAiNoteHtml(m.aiNote);
          } else {
            ai.textContent = 'Sem nota disponível.';
          }
        }

        if (overlay) {
          overlay.style.display = 'flex';
          overlay.setAttribute('aria-hidden', 'false');
        }

        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
      };

      window.closeMeetingModal = () => {
        const overlay = document.getElementById('meeting-modal');
        if (overlay) {
          overlay.style.display = 'none';
          overlay.setAttribute('aria-hidden', 'true');
        }
      };

      // --- ACTIONS ---
      window.setDateFilter = (filter) => {
        state.dateFilter = filter;
        
        // Reset manual dos botões do novo header (hardcoded IDs)
        const buttons = ['btn-today', 'btn-week', 'btn-month', 'btn-year', 'btn-semestre', 'btn-custom'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.className = 'control-btn-pill';
        });

        const btnIdMap = {
          today: 'btn-today',
          week: 'btn-week',
          month: 'btn-month',
          semester: 'btn-semestre',
          year: 'btn-year',
          custom: 'btn-custom'
        };
        const activeBtn = document.getElementById(btnIdMap[filter] || `btn-${filter}`);
        if(activeBtn) activeBtn.classList.add('active');

        fetchDataWithStamp(`filter:${filter}`);
      };
      
      window.setTheme = (mode) => {
          state.theme = mode;
          const container = document.getElementById('dashboard-acelerai-v2');
          
          if (mode === 'dark') {
              container.classList.add('dark-mode');
              document.getElementById('theme-sun').classList.remove('active');
              document.getElementById('theme-moon').classList.add('active');
          } else {
              container.classList.remove('dark-mode');
              document.getElementById('theme-sun').classList.add('active');
              document.getElementById('theme-moon').classList.remove('active');
          }
          
          // Force chart re-render for color update
          fetchDataWithStamp(`theme:${mode}`);
      };

      async function fetchSellers() {
        if (!sbClient) return;
        
        // Líder: lista todos os executivos (usuarioInterno=false).
        // Vendedor comum: não deve ver lista; acess control esconde o select.
        const { data, error } = await sbClient
            .from('vendedores')
            .select('id, nome')
            .eq('usuarioInterno', false)
            .order('nome');

        if (error) { console.error("Erro vendedores:", error); return; }

        // Cache para uso na aba de reuniões (nome do executivo por id)
        try {
          const map = {};
          (data || []).forEach(s => { if (s && s.id) map[s.id] = s.nome || String(s.id); });
          state.sellerNameById = map;
        } catch (e) {}

        const select = document.getElementById('seller-select');
        select.innerHTML = '<option value="">Todos os executivos</option>';
        
        data.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.nome;
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
            // Se não for líder, ignorar mudanças (select fica hidden/disabled).
            if (access && access.ready && !access.isLeader) return;
            state.selectedSeller = e.target.value || null;
            fetchDataWithStamp('seller');
        });
      }

      // DATE HELPERS (Mesma lógicamês anteiror, mantida para compatibilidade)
      function getDateRange(filter) {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);

        if (filter === 'week') {
          const day = start.getDay(); 
          const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
          start.setDate(diff);
        } else if (filter === 'month') {
          start.setDate(1);
        } else if (filter === 'semester') {
          // Últimos 6 meses (inclui o mês atual), alinhado no primeiro dia do mês para melhor leitura
          start.setDate(1);
          start.setMonth(start.getMonth() - 5);
        } else if (filter === 'year') {
          start.setMonth(0, 1);
        }
        return { start: start.toISOString(), end: end.toISOString() };
      }

      // Range específico para Reuniões (agendamento.data):
      // - Para week/month do header: incluir FUTURO até o fim do período.
      // - Para outros filtros: mantém comportamento do getDateRange (até hoje).
      function getMeetingsDateRange(filter) {
        const pad2 = (n) => String(n).padStart(2, '0');
        const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const base = getDateRange(filter);
        const start = new Date(base.start);
        let end = new Date(base.end);

        if (filter === 'week') {
          // fim da semana (domingo 23:59)
          end = new Date(start);
          end.setDate(end.getDate() + 6);
          end.setHours(23, 59, 59, 999);
        } else if (filter === 'month') {
          // fim do mês (último dia 23:59)
          end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
        }

        return {
          start: start.toISOString(),
          end: end.toISOString(),
          startYmd: toYmd(start),
          endYmd: toYmd(end),
        };
      }

      function getPreviousDateRange(filter) {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);

        if (filter === 'today') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (filter === 'week') {
            start.setDate(start.getDate() - 7);
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
            start.setDate(diff);
            end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23,59,59,999);
        } else if (filter === 'month') {
            start.setMonth(start.getMonth() - 1);
            start.setDate(1);
            end.setDate(0); 
        } else if (filter === 'semester') {
            // Período anterior (6 meses imediatamente antes do range atual)
            const currentStart = new Date(now);
            currentStart.setHours(0,0,0,0);
            currentStart.setDate(1);
            currentStart.setMonth(currentStart.getMonth() - 5);

            end = new Date(currentStart);
            end.setDate(end.getDate() - 1);
            end.setHours(23,59,59,999);

            start = new Date(end);
            start.setHours(0,0,0,0);
            start.setDate(1);
            start.setMonth(start.getMonth() - 5);
        } else if (filter === 'year') {
            start.setFullYear(start.getFullYear() - 1);
            start.setMonth(0, 1);
            end.setFullYear(end.getFullYear() - 1);
            end.setMonth(11, 31);
        }
        return { start: start.toISOString(), end: end.toISOString() };
      }

      function processRevenueData(leads, startDate, endDate) {
        // Cria mapa de dias no range
        const dataMap = {};
        
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        
        // Ajustar para garantir que o loop funcione com ISO dates
        currentDate.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        // Detectar se é filtro ANUAL (range > 40 dias)
        const diffTime = Math.abs(end - currentDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const isYearly = diffDays > 40; 

        if (isYearly) {
            // Lógica MENSAL
            // Resetar para dia 1 do mês inicial para evitar pular meses
            currentDate.setDate(1);

            while (currentDate <= end) {
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const key = `${year}-${month}`; // YYYY-MM
                
                const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'short' });
                const display = monthName.charAt(0).toUpperCase() + monthName.slice(1);

                if (!dataMap[key]) {
                    dataMap[key] = { val: 0, display: display, rawDate: key, order: currentDate.getTime() };
                }
                
                // Avança para o próximo mês
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        } else {
            // Lógica DIÁRIA (padrão)
            while (currentDate <= end) {
                const dateKey = currentDate.toISOString().split('T')[0];
                const displayDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                
                dataMap[dateKey] = { val: 0, display: displayDate, rawDate: dateKey, order: currentDate.getTime() };
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // Preencher dados reais
        if(leads && leads.length > 0) {
            leads.forEach(l => {
                if(!l.dataFechamento) return;
                
                let key;
                if (isYearly) {
                    key = l.dataFechamento.substring(0, 7); // YYYY-MM
                } else {
                    key = l.dataFechamento.substring(0, 10); // YYYY-MM-DD
                }

                if(dataMap[key]) {
                    dataMap[key].val += parseCurrency(l.valorFechado);
                }
            });
        }

        // Transformar em acumulado e arrays para o chart
        const categories = [];
        const seriesData = [];
        const seriesMeta = [];
        const rawDates = [];
        
        // Ordenar chaves pela data (order timestamp)
        const sortedKeys = Object.keys(dataMap).sort((a,b) => {
            return dataMap[a].order - dataMap[b].order;
        });

        let runningTotal = 0;
        
        // Meta Linear: R$ 2.1M Mensal
        // Se for anual, meta = 2.1M * 12 = 25.2M.
        
        const metaBase = getMonthlyTarget();
        let metaTotal = metaBase;
        
        if (isYearly) {
             metaTotal = metaBase * 12; 
        }

        const steps = sortedKeys.length;
        const stepGoal = steps > 0 ? metaTotal / steps : 0;
        let runningGoal = 0;

        sortedKeys.forEach(k => {
            runningTotal += dataMap[k].val;
            runningGoal += stepGoal;
            
            categories.push(dataMap[k].display);
            seriesData.push(runningTotal);
            seriesMeta.push(runningGoal);
            rawDates.push(dataMap[k].rawDate);
        });

        return { categories, seriesData, seriesMeta, rawDates, isYearly };
      }

      async function fetchRevenue() {
        if (!sbClient) return;

        const { start, end } = getDateRange(state.dateFilter);
        const prevRange = getPreviousDateRange(state.dateFilter);
        
        let query = sbClient.from('leads').select('valorFechado, dataFechamento').not('valorFechado', 'is', null);
        query = applyCutoffTimestamp(query, 'dataFechamento').gte('dataFechamento', start).lte('dataFechamento', end);
        if (state.selectedSeller) query = query.eq('vendedorResponsavel', state.selectedSeller);
        const { data: dataCurr } = await query;

        if(dataCurr) {
            const chartData = processRevenueData(dataCurr, start, end);
            renderRevenue(chartData); 
        }

        let queryPrev = sbClient.from('leads').select('valorFechado').not('valorFechado', 'is', null);
        queryPrev = applyCutoffTimestamp(queryPrev, 'dataFechamento').gte('dataFechamento', prevRange.start).lte('dataFechamento', prevRange.end);
        if (state.selectedSeller) queryPrev = queryPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { data: dataPrev } = await queryPrev;

        const currentSales = dataCurr ? dataCurr.length : 0;
        const currentRevenue = dataCurr ? dataCurr.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0) : 0;
        const prevSales = dataPrev ? dataPrev.length : 0;
        const prevRevenue = dataPrev ? dataPrev.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0) : 0;
        const currentTicket = currentSales > 0 ? currentRevenue / currentSales : 0;
        const prevTicket = prevSales > 0 ? prevRevenue / prevSales : 0;

        // --- Conversão global (no período): leads fechados / leads captados ---
        // leads captados = leads.created_at no range (respeita seller e cutoff)
        let queryCaptados = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true });
        queryCaptados = applyCutoffTimestamp(queryCaptados, 'created_at')
          .gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryCaptados = queryCaptados.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countCaptados } = await queryCaptados;
        const convGlobalPct = (countCaptados && countCaptados > 0)
          ? (currentSales / countCaptados) * 100
          : 0;

        // --- Conversão global período anterior ---
        let queryCaptadosPrev = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true });
        queryCaptadosPrev = applyCutoffTimestamp(queryCaptadosPrev, 'created_at')
          .gte('created_at', prevRange.start)
          .lte('created_at', prevRange.end);
        if (state.selectedSeller) queryCaptadosPrev = queryCaptadosPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countCaptadosPrev } = await queryCaptadosPrev;
        const convGlobalPctPrev = (countCaptadosPrev && countCaptadosPrev > 0)
          ? (prevSales / countCaptadosPrev) * 100
          : 0;

        // Query para contar Leads Ativos do período atual (com vendedor responsável)
        let queryLeads = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null)
          ;
        queryLeads = applyCutoffTimestamp(queryLeads, 'created_at').gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryLeads = queryLeads.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeads } = await queryLeads;

        // Query para contar Leads Ativos do período anterior (para comparação)
        let queryLeadsPrev = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        queryLeadsPrev = applyCutoffTimestamp(queryLeadsPrev, 'created_at').gte('created_at', prevRange.start)
          .lte('created_at', prevRange.end);
        if (state.selectedSeller) queryLeadsPrev = queryLeadsPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeadsPrev } = await queryLeadsPrev;

        const investment = state.marketingInvestment;
        const investmentPrev = state.marketingInvestmentPrev || 0;
        const cac = currentSales > 0 ? investment / currentSales : 0;
        const cacPrev = prevSales > 0 ? (investmentPrev / prevSales) : 0;
        const roas = investment > 0 ? currentRevenue / investment : 0;
        const roasPrev = investmentPrev > 0 ? (prevRevenue / investmentPrev) : 0;

        // --- KPI 0 (Faturamento) vs Meta (vs2) ---
        // Meta proporcional ao período do filtro (pro-rata por dias).
        // - Mês/Semana/Hoje/Custom: metaMensal * (rangeDays / diasNoMês do end)
        // - Ano: metaMensal*12 (anual) proporcional ao rangeDays/diasNoAno
        // - Semestre: metaMensal*6 proporcional ao rangeDays/diasNoRangeSemestre (=> meta do semestre)
        const computeMetaForRange = (filter, startIso, endIso) => {
          try {
            const rangeDays = getInclusiveRangeDays(startIso, endIso);
            const metaMensal = getMonthlyTarget();
            const endD = new Date(endIso);
            if (!endD || isNaN(endD.getTime())) return metaMensal;

            if (filter === 'year') {
              const y = endD.getFullYear();
              const daysInYear = ((y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)) ? 366 : 365;
              const metaAno = metaMensal * 12;
              return metaAno * (rangeDays / daysInYear);
            }

            if (filter === 'semester') {
              // meta do semestre (6 meses). Como o range do semestre já é “últimos 6 meses”, usamos o total do semestre.
              const metaSem = metaMensal * 6;
              return metaSem;
            }

            const daysInMonth = new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getDate();
            return metaMensal * (rangeDays / Math.max(1, daysInMonth));
          } catch (e) {
            return getMonthlyTarget();
          }
        };

        const metaForPeriod = computeMetaForRange(state.dateFilter, start, end);
        const metaVar = metaForPeriod > 0 ? ((currentRevenue - metaForPeriod) / metaForPeriod) * 100 : (currentRevenue > 0 ? 100 : 0);
        const metaIsFlat = Math.round(metaVar * 10) === 0; // neutro quando renderiza 0.0%
        if (state.kpis && state.kpis[0] && state.kpis[0].vs2) {
          const metaMissing = !(metaForPeriod > 0) || !(currentRevenue > 0);
          state.kpis[0].vs2.missing = metaMissing;
          state.kpis[0].vs2.v = metaMissing ? 0 : Math.abs(metaVar).toFixed(1);
          state.kpis[0].vs2.neutral = metaMissing ? true : metaIsFlat;
          state.kpis[0].vs2.up = (metaMissing || metaIsFlat) ? true : (metaVar >= 0);
          state.kpis[0].vs2.l = 'vs meta';
        }

        // --- Comparativo "Méd." (vs2) - média ponderada YTD 2025 (mocado) ---
        // Objetivo: comparar o período selecionado com a média do ano (ponderada por dias decorridos).
        // Observação: KPI 0 (Faturamento) usa vs2 = Meta (mantemos).
        const rangeDaysForAvg = getInclusiveRangeDays(start, end);
        const baseline2025Avg = getBaseline2025YtdForRange(rangeDaysForAvg);

        const setVs2 = (index, current, baseline, opts = {}) => {
          const betterWhenLower = !!opts.betterWhenLower;
          const baselineVal = Number.isFinite(baseline) ? baseline : 0;
          const currentVal = Number.isFinite(current) ? current : 0;
          const missing = !(baselineVal > 0) || !(currentVal > 0);
          const variation = baselineVal > 0
            ? ((currentVal - baselineVal) / baselineVal) * 100
            : (currentVal > 0 ? 100 : 0);
          const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
          if (state.kpis && state.kpis[index] && state.kpis[index].vs2) {
            state.kpis[index].vs2.missing = missing;
            state.kpis[index].vs2.v = missing ? 0 : Math.abs(variation).toFixed(1);
            state.kpis[index].vs2.neutral = missing ? true : isFlat;
            state.kpis[index].vs2.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
            // mantém label existente (renderiza como "Méd." via shortLabel)
          }
        };

        // Aplica "Méd." apenas onde o card realmente usa vs2 como média (1..8)
        setVs2(1, convGlobalPct, baseline2025Avg.convPct);
        setVs2(2, currentSales, baseline2025Avg.vendas);
        setVs2(3, currentTicket, baseline2025Avg.ticket);
        setVs2(4, (countLeads || 0), baseline2025Avg.leadsAtivosProxy);
        setVs2(5, (countCaptados || 0), baseline2025Avg.captados);
        setVs2(6, investment, baseline2025Avg.investimento);
        setVs2(7, cac, baseline2025Avg.cac, { betterWhenLower: true });
        setVs2(8, roas, baseline2025Avg.roas);

        // --- Comparativo vs 2024 (vs3) MOCADO com pro-rata por dias ---
        // Funciona para qualquer filtro do header (Hoje/Semana/Mês/Ano/Semestre/Custom),
        // usando o MESMO range do KPI (getDateRange) e escalando os totais de 2024 por rangeDays/366.
        const rangeDays = getInclusiveRangeDays(start, end);
        const baseline2024 = getBaseline2024ForRange(rangeDays);

        const setVs3 = (index, current, baseline, opts = {}) => {
          const betterWhenLower = !!opts.betterWhenLower;
          const baselineVal = Number.isFinite(baseline) ? baseline : 0;
          const currentVal = Number.isFinite(current) ? current : 0;
          const missing = !(baselineVal > 0) || !(currentVal > 0);
          const variation = baselineVal > 0
            ? ((currentVal - baselineVal) / baselineVal) * 100
            : (currentVal > 0 ? 100 : 0);
          const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
          if (state.kpis && state.kpis[index] && state.kpis[index].vs3) {
            state.kpis[index].vs3.missing = missing;
            state.kpis[index].vs3.v = missing ? 0 : Math.abs(variation).toFixed(1);
            state.kpis[index].vs3.neutral = missing ? true : isFlat;
            state.kpis[index].vs3.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
            state.kpis[index].vs3.l = `vs ${baseline2024.year}`;
          }
        };

        // Mapeamento KPIs -> baseline 2024 pro-rata
        setVs3(0, currentRevenue, baseline2024.faturamento);
        setVs3(1, convGlobalPct, baseline2024.convPct);
        setVs3(2, currentSales, baseline2024.vendas);
        setVs3(3, currentTicket, baseline2024.ticket);
        // Leads Ativos: proxy = Oportunidades (qualificados) do consolidado
        setVs3(4, (countLeads || 0), baseline2024.leadsAtivosProxy);
        // Leads Captados: proxy = Leads Recebidos do consolidado
        setVs3(5, (countCaptados || 0), baseline2024.captados);
        setVs3(6, investment, baseline2024.investimento);
        setVs3(7, cac, baseline2024.cac, { betterWhenLower: true });
        setVs3(8, roas, baseline2024.roas);

        const updateKPI = (index, value, prevValue, formatFunc = (v)=>v, opts = {}) => {
            const betterWhenLower = !!opts.betterWhenLower;
            const variation = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0);
            const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
            const missing = !(prevValue > 0) || !(value > 0);
            state.kpis[index].v = formatFunc(value);
            state.kpis[index].vs1.missing = missing;
            state.kpis[index].vs1.v = missing ? 0 : Math.abs(variation).toFixed(1);
            // 0% (igualdade) deve ser neutro, não verde/vermelho
            state.kpis[index].vs1.neutral = missing ? true : isFlat;
            state.kpis[index].vs1.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
        };

        // KPIs (ordem): 0 Faturamento, 1 Conversão Global, 2 Vendas, 3 Ticket, 4 Leads Ativos, 5 Leads Captados, 6 Invest, 7 CAC, 8 ROAS
        updateKPI(0, currentRevenue, prevRevenue, formatCurrency);
        updateKPI(1, convGlobalPct, convGlobalPctPrev, (v) => v.toFixed(1) + "%");
        updateKPI(2, currentSales, prevSales, (v) => v.toString());
        updateKPI(3, currentTicket, prevTicket, formatCurrency);
        updateKPI(4, countLeads || 0, countLeadsPrev || 0, (v) => v.toLocaleString('pt-BR'));
        updateKPI(5, countCaptados || 0, countCaptadosPrev || 0, (v) => v.toLocaleString('pt-BR'));
        updateKPI(6, investment, investmentPrev, formatCurrency);
        // CAC: menor é melhor no comparativo vs mês
        updateKPI(7, cac, cacPrev, formatCurrency, { betterWhenLower: true });
        updateKPI(8, roas, roasPrev, (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00') + "x");
        state.kpis[6].v = formatCurrency(investment);
        state.kpis[8].v = roas.toFixed(2) + "x";

        renderKPIs();

        // --- UPDATE GAUGE WITH REAL DATA (SEMPRE MENSAL) ---
        // Regra: o Velocímetro do Mês NÃO respeita o filtro de data do cabeçalho;
        // ele sempre calcula Mês Atual vs Meta Mensal e só respeita o filtro de vendedor.
        const targetRevenue = getMonthlyTarget(); // Meta Mensal (dinâmica via params.monthlyTarget)

        let gaugeCurrentRevenue = currentRevenue;
        let gaugePrevRevenue = prevRevenue;

        if (state.dateFilter !== 'month') {
          const monthRange = getDateRange('month');
          const prevMonthRange = getPreviousDateRange('month');

          let queryGaugeCurr = sbClient
            .from('leads')
            .select('valorFechado')
            .not('valorFechado', 'is', null)
            ;
          queryGaugeCurr = applyCutoffTimestamp(queryGaugeCurr, 'dataFechamento').gte('dataFechamento', monthRange.start)
            .lte('dataFechamento', monthRange.end);

          let queryGaugePrev = sbClient
            .from('leads')
            .select('valorFechado')
            .not('valorFechado', 'is', null)
            ;
          queryGaugePrev = applyCutoffTimestamp(queryGaugePrev, 'dataFechamento').gte('dataFechamento', prevMonthRange.start)
            .lte('dataFechamento', prevMonthRange.end);

          if (state.selectedSeller) {
            queryGaugeCurr = queryGaugeCurr.eq('vendedorResponsavel', state.selectedSeller);
            queryGaugePrev = queryGaugePrev.eq('vendedorResponsavel', state.selectedSeller);
          }

          const [{ data: dataGaugeCurr }, { data: dataGaugePrev }] = await Promise.all([
            queryGaugeCurr,
            queryGaugePrev
          ]);

          gaugeCurrentRevenue = dataGaugeCurr
            ? dataGaugeCurr.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0)
            : 0;

          gaugePrevRevenue = dataGaugePrev
            ? dataGaugePrev.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0)
            : 0;
        }

        const gaugePct = targetRevenue > 0 ? Math.min((gaugeCurrentRevenue / targetRevenue) * 100, 100) : 0;
        const missing = Math.max(targetRevenue - gaugeCurrentRevenue, 0);

        renderGauge(gaugePct, gaugeCurrentRevenue, targetRevenue, gaugePrevRevenue, missing);

        // --- Projeção (mensal): (faturamento fechado até hoje / diaDoMes) * diasNoMes ---
        try {
          const now = new Date();
          const daysSoFar = Math.max(1, now.getDate());
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthStartIso = monthStart.toISOString();
          const nowIso = now.toISOString();

          let qProj = sbClient
            .from('leads')
            .select('valorFechado')
            .not('valorFechado', 'is', null);
          qProj = applyCutoffTimestamp(qProj, 'dataFechamento')
            .gte('dataFechamento', monthStartIso)
            .lte('dataFechamento', nowIso);
          if (state.selectedSeller) qProj = qProj.eq('vendedorResponsavel', state.selectedSeller);

          const { data: projRows } = await qProj;
          const revenueToDate = (projRows || []).reduce((acc, r) => acc + parseCurrency(r.valorFechado), 0);
          const projected = daysSoFar > 0 ? (revenueToDate / daysSoFar) * daysInMonth : 0;

          const projEl = document.getElementById('eff-projection-val');
          if (projEl) projEl.textContent = formatCurrencyCompact(projected);

          const subEl = document.getElementById('eff-projection-sub');
          if (subEl) subEl.textContent = `Mês até hoje: ${formatCurrencyCompact(revenueToDate)} • Dia ${daysSoFar}/${daysInMonth}`;
        } catch (e) {}
      }

      async function fetchMeetings() {
        if (!sbClient) return;

        const now = new Date();
        // Importante: agendamento.data é DATE (sem timezone).
        // Não usar toISOString() (UTC) aqui, senão o "Hoje" pode virar ontem/amanhã dependendo do timezone local.
        const todayRange = getMeetingsDateRange('today');
        const weekRange = getMeetingsDateRange('week');
        const monthRange = getMeetingsDateRange('month');

        const getCount = async (filterType) => {
            let query = sbClient.from('agendamento').select('id', { count: 'exact', head: true });
            // Regras: incluir agendadas + ocorridas; excluir canceladas
            query = applyMeetingNotCanceledFilter(query);
            if (state.selectedSeller) query = query.eq('vendedor', state.selectedSeller);

            if (filterType === 'today') {
                query = applyCutoffDateYmd(query, 'data').eq('data', todayRange.startYmd);
            } else if (filterType === 'week') {
                query = applyCutoffDateYmd(query, 'data').gte('data', weekRange.startYmd).lte('data', weekRange.endYmd);
            } else if (filterType === 'month') {
                query = applyCutoffDateYmd(query, 'data').gte('data', monthRange.startYmd).lte('data', monthRange.endYmd);
            }
            const { count } = await query;
            return count || 0;
        };

        const [countToday, countWeek, countMonth] = await Promise.all([
            getCount('today'),
            getCount('week'),
            getCount('month')
        ]);

        let countNow = 0;
        // “Acontecendo agora”: faz sentido manter apenas agendadas (não realizadas/canceladas)
        let queryNow = sbClient.from('agendamento').select('hora, data').eq('statusReuniao', 'agendado');
        queryNow = applyCutoffDateYmd(queryNow, 'data').eq('data', todayRange.startYmd);
        if (state.selectedSeller) queryNow = queryNow.eq('vendedor', state.selectedSeller);
        const { data: dataNow } = await queryNow;
        if (dataNow) {
            const currentHour = now.getHours();
            countNow = dataNow.filter(r => {
                if(!r.hora) return false;
                const h = parseInt(String(r.hora).split(':')[0], 10);
                return h === currentHour;
            }).length;
        }

        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setTxt('meetings-now', countNow);
        setTxt('meetings-today', countToday);
        setTxt('meetings-week', countWeek);
        setTxt('meetings-month', countMonth);
      }

      async function fetchSLAs() {
        if (!sbClient) return;

        // SLAs respeitam o MESMO filtro de datas do header
        const { start, end } = getDateRange(state.dateFilter);
        const startYmd = (start || '').split('T')[0];
        const endYmd = (end || '').split('T')[0];
        console.log(`--- Fetching SLAs (Filtered: ${state.dateFilter}) ---`);
        
        // --- 1. FRT Pré-vendas ---
        const novoLeadId = await getEtapaIdByName('Novo Lead');
        let frtTotalMinutes = 0;
        let frtCount = 0;
        let frtWithin = 0;

        if (novoLeadId) {
          let qExit = sbClient
            .from('loogsLeads')
            .select('created_at, lead, vendedor_id')
            .eq('etapa_anterior', novoLeadId)
            .not('lead', 'is', null)
            .order('created_at', { ascending: true });
          qExit = applyCutoffTimestamp(qExit, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);

          const { data: exitLogs } = await qExit;

          if (exitLogs && exitLogs.length > 0) {
            const firstExitByLead = {};
            exitLogs.forEach(l => {
              if (!l || !l.lead || !l.created_at) return;
              if (!firstExitByLead[l.lead]) firstExitByLead[l.lead] = l.created_at;
            });

            const leadIds = Object.keys(firstExitByLead);
            const entryByLead = {};

            // buscar entradas em Novo Lead (preferência)
            for (const chunk of chunkArray(leadIds, 500)) {
              let qEntry = sbClient
                .from('loogsLeads')
                .select('created_at, lead')
                .eq('etapa_posterior', novoLeadId)
                .in('lead', chunk)
                .not('lead', 'is', null)
                .order('created_at', { ascending: true });
              qEntry = applyCutoffTimestamp(qEntry, 'created_at')
                .gte('created_at', start)
                .lte('created_at', end);
              const { data: entryLogs } = await qEntry;
              (entryLogs || []).forEach(l => {
                if (!l || !l.lead || !l.created_at) return;
                if (!entryByLead[l.lead]) entryByLead[l.lead] = l.created_at;
              });
            }

                    const leadsMap = {};
            for (const chunk of chunkArray(leadIds, 500)) {
              let qLeads = sbClient
                .from('leads')
                .select('lead_id, created_at, vendedorResponsavel')
                .in('lead_id', chunk);
              qLeads = applyCutoffTimestamp(qLeads, 'created_at');
              if (state.selectedSeller) qLeads = qLeads.eq('vendedorResponsavel', state.selectedSeller);
              const { data: leads } = await qLeads;
              (leads || []).forEach(l => { if (l && l.lead_id) leadsMap[l.lead_id] = l; });
            }

            leadIds.forEach(leadId => {
              const lead = leadsMap[leadId];
              if (!lead) return;
              if (state.selectedSeller && lead.vendedorResponsavel !== state.selectedSeller) return;

              const exitIso = firstExitByLead[leadId];
              const entryIso = entryByLead[leadId] || lead.created_at;
              if (!exitIso || !entryIso) return;

              // Se não temos log de entrada (Novo Lead), só considera se o lead foi criado no período
              if (!entryByLead[leadId]) {
                try {
                  const leadCreated = new Date(lead.created_at);
                  if (leadCreated < new Date(start) || leadCreated > new Date(end)) return;
                } catch (e) {}
              }

              const exitT = new Date(exitIso);
              const entryT = new Date(entryIso);
              const diffMinutes = (exitT - entryT) / (1000 * 60);
                            if (diffMinutes > 0 && diffMinutes < 43200) { 
                                frtTotalMinutes += diffMinutes;
                                frtCount++;
                if (diffMinutes <= 20) frtWithin++;
                        }
                    });
                }
            }

        const avgFRT = frtCount > 0 ? Math.round(frtTotalMinutes / frtCount) : 0;
        const slaFRT = frtCount > 0 ? Math.round((frtWithin / frtCount) * 100) : 0;
        console.log(`FRT: ${avgFRT}min (${frtCount}) SLA:${slaFRT}%`);

        // --- 2. Ciclo de Venda ---
        let queryCiclo = sbClient
            .from('leads')
            .select('created_at, dataFechamento')
            .not('dataFechamento', 'is', null);
        queryCiclo = applyCutoffTimestamp(queryCiclo, 'created_at');
        queryCiclo = applyCutoffTimestamp(queryCiclo, 'dataFechamento')
          .gte('dataFechamento', start)
          .lte('dataFechamento', end);
            
        if (state.selectedSeller) queryCiclo = queryCiclo.eq('vendedorResponsavel', state.selectedSeller);
        
        const { data: leadsCiclo } = await queryCiclo;
        let cicloTotalDays = 0;
        let cicloCount = 0;
        let cicloWithin = 0;
        
        if (leadsCiclo) {
            leadsCiclo.forEach(l => {
                const endT = new Date(l.dataFechamento);
                const startT = new Date(l.created_at);
                const diffDays = (endT - startT) / (1000 * 60 * 60 * 24);
                if (diffDays > 0) {
                    cicloTotalDays += diffDays;
                    cicloCount++;
                    if (diffDays <= 5) cicloWithin++;
                }
            });
        }
        const avgCiclo = cicloCount > 0 ? (cicloTotalDays / cicloCount).toFixed(1) : "0.0";
        const slaCiclo = cicloCount > 0 ? Math.round((cicloWithin / cicloCount) * 100) : 0;
        console.log(`Ciclo: ${avgCiclo}d (${cicloCount})`);

        // --- 3. Tempo Proposta ---
        // Regra: tempo "positivo" entre Reunião (agendamento) e Envio de Proposta (imagemProposta) no MESMO lead,
        // contando somente quando proposta.created_at > agendamento.(data+hora).
        let propTotalHours = 0;
        let propCount = 0;
        let propWithin = 0;

        const buildMeetingDateTime = (m) => {
          try {
            if (!m || !m.data) return null;
            const dateStr = typeof m.data === 'string' ? m.data : new Date(m.data).toISOString().slice(0, 10);
            if (m.hora) {
              // hora é time with tz (ex: 10:00:00+00), concatenar gera ISO válido
              return new Date(`${dateStr}T${m.hora}`);
            }
            return new Date(`${dateStr}T00:00:00`);
          } catch (e) {
            return null;
          }
        };

        let qProps = sbClient
          .from('imagemProposta')
          .select('created_at, id_lead, id_vendedor')
          .not('id_lead', 'is', null);
        qProps = applyCutoffTimestamp(qProps, 'created_at')
          .gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) {
          // inclui propostas sem id_vendedor, que serão filtradas pelo vendedor do lead
          qProps = qProps.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);
        }
        const { data: props } = await qProps;

        if (props && props.length > 0) {
          const leadIds = [...new Set(props.map(p => p && p.id_lead).filter(Boolean))];
          const leadsMap = {};
          const meetingsByLead = {};
          const propsByLead = {};

          // Leads (para filtro por vendedor e fallback)
          for (const chunk of chunkArray(leadIds, 500)) {
            let qLeads = sbClient
              .from('leads')
              .select('lead_id, vendedorResponsavel')
              .in('lead_id', chunk);
            if (state.selectedSeller) qLeads = qLeads.eq('vendedorResponsavel', state.selectedSeller);
            const { data: leads } = await qLeads;
            (leads || []).forEach(l => { if (l && l.lead_id) leadsMap[l.lead_id] = l; });
          }

          // Meetings por lead
          for (const chunk of chunkArray(leadIds, 500)) {
            let qMeet = sbClient
              .from('agendamento')
              .select('data, hora, leadId, vendedor')
              .in('leadId', chunk);
            qMeet = applyCutoffDateYmd(qMeet, 'data')
              .gte('data', startYmd)
              .lte('data', endYmd);
            if (state.selectedSeller) {
              qMeet = qMeet.or(`vendedor.eq.${state.selectedSeller},vendedor.is.null`);
            }
            const { data: meets } = await qMeet;
            (meets || []).forEach(m => {
              if (!m || !m.leadId) return;
              const dt = buildMeetingDateTime(m);
              if (!dt || isNaN(dt.getTime())) return;
              meetingsByLead[m.leadId] = meetingsByLead[m.leadId] || [];
              meetingsByLead[m.leadId].push(dt);
            });
          }

          // Props por lead
                props.forEach(p => {
            if (!p || !p.id_lead || !p.created_at) return;
            const lead = leadsMap[p.id_lead];
            if (state.selectedSeller && (!lead || lead.vendedorResponsavel !== state.selectedSeller)) return;
            // se id_vendedor existe, respeitar autoria
            if (state.selectedSeller && p.id_vendedor && p.id_vendedor !== state.selectedSeller) return;
            propsByLead[p.id_lead] = propsByLead[p.id_lead] || [];
            propsByLead[p.id_lead].push(new Date(p.created_at));
          });

          // Calcular por lead: proposta mais cedo, reunião mais recente antes da proposta
          leadIds.forEach(leadId => {
            const lead = leadsMap[leadId];
            if (state.selectedSeller && (!lead || lead.vendedorResponsavel !== state.selectedSeller)) return;
            const mList = meetingsByLead[leadId] || [];
            const pList = propsByLead[leadId] || [];
            if (!mList.length || !pList.length) return;

            mList.sort((a, b) => a - b);
            pList.sort((a, b) => a - b);

            const proposalAt = pList[0];
            // última reunião antes da proposta
            let meetingAt = null;
            for (let i = mList.length - 1; i >= 0; i--) {
              if (mList[i].getTime() < proposalAt.getTime()) { meetingAt = mList[i]; break; }
            }
            if (!meetingAt) return;

            const diffHours = (proposalAt - meetingAt) / (1000 * 60 * 60);
                        if (diffHours > 0 && diffHours < 720) {
                            propTotalHours += diffHours;
                            propCount++;
              if (diffHours <= 6) propWithin++;
                    }
                });
            }

        const avgProp = propCount > 0 ? Math.round(propTotalHours / propCount) : 0;
        const slaProp = propCount > 0 ? Math.round((propWithin / propCount) * 100) : 0;
        console.log(`Proposta: ${avgProp}h (${propCount}) SLA:${slaProp}%`);

        // --- 4. Follow-up ---
        // Regra: tempo médio entre mudanças Follow1 -> Follow2 -> Follow3 (via loogsLeads etapas).
        let followTotalHours = 0;
        let followCount = 0;
        let followWithin = 0;

        const follow1Id = await getEtapaIdByName('Follow1');
        const follow2Id = await getEtapaIdByName('Follow 2');
        const follow3Id = await getEtapaIdByName('Follow 3');

        if (follow1Id && follow2Id && follow3Id) {
          let qFollow = sbClient
            .from('loogsLeads')
            .select('created_at, lead, etapa_posterior, vendedor_id')
            .in('etapa_posterior', [follow1Id, follow2Id, follow3Id])
            .not('lead', 'is', null)
            .order('created_at', { ascending: true });
          qFollow = applyCutoffTimestamp(qFollow, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);
          if (state.selectedSeller) {
            qFollow = qFollow.or(`vendedor_id.eq.${state.selectedSeller},vendedor_id.is.null`);
          }

          const { data: followLogs } = await qFollow;
          if (followLogs && followLogs.length > 0) {
            const byLead = {};
            followLogs.forEach(l => {
              if (!l || !l.lead || !l.created_at || !l.etapa_posterior) return;
              byLead[l.lead] = byLead[l.lead] || [];
              byLead[l.lead].push({ t: new Date(l.created_at), stage: l.etapa_posterior });
            });

            const leadIds = Object.keys(byLead);
            const leadsMap = {};
            if (state.selectedSeller) {
              for (const chunk of chunkArray(leadIds, 500)) {
                const { data: leads } = await sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', chunk)
                  .eq('vendedorResponsavel', state.selectedSeller);
                (leads || []).forEach(ld => { if (ld && ld.lead_id) leadsMap[ld.lead_id] = ld; });
              }
            }

            leadIds.forEach(leadId => {
              if (state.selectedSeller && !leadsMap[leadId]) return;
              const evts = (byLead[leadId] || []).filter(e => e && e.t && !isNaN(e.t.getTime()));
              evts.sort((a, b) => a.t - b.t);

              // encontrar sequência Follow1 -> Follow2 -> Follow3 (primeira ocorrência válida)
              let t1 = null;
              let t2 = null;
              let t3 = null;
              for (const e of evts) {
                if (!t1 && e.stage === follow1Id) { t1 = e.t; continue; }
                if (t1 && !t2 && e.stage === follow2Id && e.t > t1) { t2 = e.t; continue; }
                if (t2 && !t3 && e.stage === follow3Id && e.t > t2) { t3 = e.t; break; }
              }

              const addDiff = (a, b) => {
                if (!a || !b) return;
                const h = (b - a) / (1000 * 60 * 60);
                if (h > 0 && h < 720) {
                        followTotalHours += h;
                        followCount++;
                  if (h <= 24) followWithin++;
                }
              };

              addDiff(t1, t2); // Follow1 -> Follow2
              addDiff(t2, t3); // Follow2 -> Follow3
            });
          }
        }

        const avgFollow = followCount > 0 ? Math.round(followTotalHours / followCount) : 0;
        const slaFollow = followCount > 0 ? Math.round((followWithin / followCount) * 100) : 0;
        console.log(`Follow: ${avgFollow}h (${followCount}) SLA:${slaFollow}%`);

        // --- Renderizar ---
        const cards = document.querySelectorAll('.sla-card');
        if (cards.length >= 4) {
            const updateCard = (idx, val, unit, meta, metaVal) => {
                const el = cards[idx];
                let statusClass = 'on-track';
                if (val > metaVal) {
                    statusClass = val <= (metaVal * 2.0) ? 'at-risk' : 'breached';
                }
                el.className = `sla-card ${statusClass}`;
                el.querySelector('.text-2xl').innerHTML = `${val}${unit} <span class="text-sm opacity-70">/ ${meta}</span>`;
                const pct = Math.min(100, (val / metaVal) * 100);
                el.querySelector('.sla-bar-fill').style.width = pct + '%';
            };

            updateCard(0, avgFRT, 'min', '20min', 20);
            updateCard(1, avgCiclo, 'd', '5d', 5);
            updateCard(2, avgProp, 'h', '6h', 6);
            updateCard(3, avgFollow, 'h', '24h', 24);
        }

        // --- Eficiência (Dias de ciclo + SLA % agregado) ---
        try {
          const totalCount = frtCount + cicloCount + propCount + followCount;
          const totalWithin = frtWithin + cicloWithin + propWithin + followWithin;
          const slaOverall = totalCount > 0 ? Math.round((totalWithin / totalCount) * 100) : 0;

          const cycleEl = document.getElementById('eff-cycle-days');
          if (cycleEl) cycleEl.textContent = `${avgCiclo}`;

          const slaEl = document.getElementById('eff-sla-overall');
          if (slaEl) slaEl.textContent = `${slaOverall}%`;
        } catch (e) {}
      }

      async function fetchRankingData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        const meetRange = getMeetingsDateRange(state.dateFilter);
        
        // 1. Fetch Sellers
        const { data: sellers } = await sbClient
            .from('vendedores')
            .select('id, nome')
            .eq('usuarioInterno', false);
            
        if (!sellers) return;
        
        // Initialize Map
        const sellerMap = {};
        sellers.forEach(s => {
            sellerMap[s.id] = {
                id: s.id,
                name: s.nome,
                scoreSum: 0,
                scoreCount: 0,
                proposals: 0,
                meetings: 0,
                sales: 0,
                cicloSum: 0,
                cicloCount: 0,
                frtSum: 0,
                frtCount: 0
            };
        });

        // 2. Fetch Meetings & Scores
        let queryMeetings = sbClient.from('agendamento').select('vendedor, score_final');
        // Para week/month: incluir reuniões futuras até o fim do período
        queryMeetings = applyCutoffDateYmd(queryMeetings, 'data').gte('data', meetRange.startYmd).lte('data', meetRange.endYmd);
        queryMeetings = applyMeetingNotCanceledFilter(queryMeetings);
        if (state.selectedSeller) queryMeetings = queryMeetings.eq('vendedor', state.selectedSeller);
        const { data: meetings } = await queryMeetings;
        
        if (meetings) {
            meetings.forEach(m => {
                if (m.vendedor && sellerMap[m.vendedor]) {
                    sellerMap[m.vendedor].meetings++;
                    if (m.score_final) {
                        sellerMap[m.vendedor].scoreSum += m.score_final;
                        sellerMap[m.vendedor].scoreCount++;
                    }
                }
            });
        }

        // 3. Fetch Proposals
        // Regra: usar imagemProposta.id_vendedor quando existir (fonte de verdade da autoria),
        // e usar fallback via leads.vendedorResponsavel apenas quando id_vendedor for nulo.
        let proposalsQuery = sbClient
          .from('imagemProposta')
          .select('id_lead, id_vendedor')
          ;
        proposalsQuery = applyCutoffTimestamp(proposalsQuery, 'created_at').gte('created_at', start)
          .lte('created_at', end);
        const { data: proposals } = await proposalsQuery;
        
        if (proposals && proposals.length > 0) {
            // 3.1) Contabilizar diretamente por id_vendedor (quando presente)
            const proposalsNeedingLeadFallback = [];
            proposals.forEach(p => {
                if (p.id_vendedor) {
                    const sellerId = p.id_vendedor;
                    if (sellerMap[sellerId] && (!state.selectedSeller || sellerId === state.selectedSeller)) {
                        sellerMap[sellerId].proposals++;
                    }
                } else if (p.id_lead) {
                    proposalsNeedingLeadFallback.push(p);
                }
            });

            // 3.2) Fallback: mapear id_lead -> vendedorResponsavel
            const leadIds = proposalsNeedingLeadFallback.map(p => p.id_lead).filter(id => id);
            if (leadIds.length > 0) {
                const { data: leads } = await sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', leadIds);
                
                if (leads) {
                    const leadSellerMap = {};
                    leads.forEach(l => (leadSellerMap[l.lead_id] = l.vendedorResponsavel));
                    
                    proposalsNeedingLeadFallback.forEach(p => {
                        const sellerId = leadSellerMap[p.id_lead];
                        if (sellerId && sellerMap[sellerId] && (!state.selectedSeller || sellerId === state.selectedSeller)) {
                            sellerMap[sellerId].proposals++;
                        }
                    });
                }
            }
        }

        // 4. Fetch Sales & Cycle
        let querySales = sbClient.from('leads')
            .select('vendedorResponsavel, valorFechado, created_at, dataFechamento')
            .not('valorFechado', 'is', null);
        querySales = applyCutoffTimestamp(querySales, 'dataFechamento').gte('dataFechamento', start)
            .lte('dataFechamento', end);
        querySales = applyCutoffTimestamp(querySales, 'created_at');
            
        if (state.selectedSeller) querySales = querySales.eq('vendedorResponsavel', state.selectedSeller);
        const { data: sales } = await querySales;
        
        if (sales) {
            sales.forEach(s => {
                if (s.vendedorResponsavel && sellerMap[s.vendedorResponsavel]) {
                    sellerMap[s.vendedorResponsavel].sales += parseCurrency(s.valorFechado);
                    
                    // Calculate Cycle
                    if (s.created_at && s.dataFechamento) {
                        const startT = new Date(s.created_at);
                        const endT = new Date(s.dataFechamento);
                        const diffDays = (endT - startT) / (1000 * 60 * 60 * 24);
                        if (diffDays > 0) {
                            sellerMap[s.vendedorResponsavel].cicloSum += diffDays;
                            sellerMap[s.vendedorResponsavel].cicloCount++;
                        }
                    }
                }
            });
        }

        // 5. Fetch FRT (First Response Time) por etapas (Novo Lead -> primeira saída)
        const novoLeadId = await getEtapaIdByName('Novo Lead');
        if (novoLeadId) {
          let qExit = sbClient
            .from('loogsLeads')
            .select('created_at, lead')
            .eq('etapa_anterior', novoLeadId)
            .not('lead', 'is', null)
            .order('created_at', { ascending: true });
          qExit = applyCutoffTimestamp(qExit, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);

          const { data: exitLogs } = await qExit;
          if (exitLogs && exitLogs.length > 0) {
            const firstExitByLead = {};
            exitLogs.forEach(l => {
              if (!l || !l.lead || !l.created_at) return;
              if (!firstExitByLead[l.lead]) firstExitByLead[l.lead] = l.created_at;
            });

            const leadIds = Object.keys(firstExitByLead);
            const entryByLead = {};

            for (const chunk of chunkArray(leadIds, 500)) {
              let qEntry = sbClient
                .from('loogsLeads')
                .select('created_at, lead')
                .eq('etapa_posterior', novoLeadId)
                .in('lead', chunk)
                .not('lead', 'is', null)
                .order('created_at', { ascending: true });
              qEntry = applyCutoffTimestamp(qEntry, 'created_at');
              const { data: entryLogs } = await qEntry;
              (entryLogs || []).forEach(l => {
                if (!l || !l.lead || !l.created_at) return;
                if (!entryByLead[l.lead]) entryByLead[l.lead] = l.created_at;
              });
            }

            const leadsMap = {};
            for (const chunk of chunkArray(leadIds, 500)) {
              let qLeads = sbClient
                    .from('leads')
                    .select('lead_id, created_at, vendedorResponsavel')
                .in('lead_id', chunk);
              qLeads = applyCutoffTimestamp(qLeads, 'created_at');
              if (state.selectedSeller) qLeads = qLeads.eq('vendedorResponsavel', state.selectedSeller);
              const { data: leads } = await qLeads;
              (leads || []).forEach(l => { if (l && l.lead_id) leadsMap[l.lead_id] = l; });
            }

            leadIds.forEach(leadId => {
              const lead = leadsMap[leadId];
              if (!lead || !lead.vendedorResponsavel) return;
              if (state.selectedSeller && lead.vendedorResponsavel !== state.selectedSeller) return;
              const bucket = sellerMap[lead.vendedorResponsavel];
              if (!bucket) return;

              const exitIso = firstExitByLead[leadId];
              const entryIso = entryByLead[leadId] || lead.created_at;
              if (!exitIso || !entryIso) return;

              const exitT = new Date(exitIso);
              const entryT = new Date(entryIso);
              const diffMinutes = (exitT - entryT) / (1000 * 60);
                             if (diffMinutes > 0 && diffMinutes < 43200) { 
                bucket.frtSum += diffMinutes;
                bucket.frtCount++;
                         }
                     });
             }
        }

        // 6. Calculate & Sort
        state.rankingData = Object.values(sellerMap)
            .filter(s => !state.selectedSeller || s.id === state.selectedSeller)
            .map(s => ({
                ...s,
                avgScore: s.scoreCount > 0 ? (s.scoreSum / s.scoreCount).toFixed(1) : '-',
                avgCycle: s.cicloCount > 0 ? (s.cicloSum / s.cicloCount).toFixed(1) : '-',
                avgFRT: s.frtCount > 0 ? Math.round(s.frtSum / s.frtCount) : '-'
            }))
            .sort((a, b) => {
                // Sort by avgScore (meeting scores) in descending order
                const scoreA = a.avgScore !== '-' ? parseFloat(a.avgScore) : 0;
                const scoreB = b.avgScore !== '-' ? parseFloat(b.avgScore) : 0;
                console.log(`Comparing ${a.name} (${scoreA}) vs ${b.name} (${scoreB})`);
                return scoreB - scoreA;
            });

        console.log('Ranking Data (ordenado por score):', state.rankingData.map(r => ({ name: r.name, score: r.avgScore })));

        renderRanking();
      }

      async function fetchData() {
         // 1) Investimento Mkt precisa vir antes para CAC/ROAS e KPI saírem corretos.
         await fetchMarketingSpend();

         const tasks = [
             fetchRevenue(),
             fetchMeetings(),
             fetchMeetingsTab(),
             fetchSLAs(),
             fetchRankingData(),
             fetchFunnelData(),
             fetchConversionRates(),
             fetchChannelData(),
             fetchPipelineData()
         ];
         const results = await Promise.allSettled(tasks);
         results.forEach((r) => {
           if (r && r.status === 'rejected') console.error('Erro em fetchData task:', r.reason);
         });
      }


      const channels = [
        { n:"Landing Page", leads:580, rev:"R$ 890k", gasto:"R$ 45k", conv:"12%", roi:"1878%", i:"globe", tone:"#3b82f6", active:true },
        { n:"WhatsApp", leads:420, rev:"R$ 1.2M", gasto:"R$ 32k", conv:"18%", roi:"3650%", i:"message-circle", tone:"#22c55e", active:true },
        { n:"Outbound", leads:180, rev:"--", gasto:"--", conv:"--", roi:"--", i:"phone", tone:"#f97316", active:false },
        { n:"Social", leads:320, rev:"--", gasto:"--", conv:"--", roi:"--", i:"share-2", tone:"#8b5cf6", active:false }
      ];

      // INIT
      async function init() {
        const isSupabaseLoaded = (typeof supabase !== 'undefined' || typeof Supabase !== 'undefined');
        if (typeof lucide === 'undefined' || typeof ApexCharts === 'undefined' || !isSupabaseLoaded) {
            setTimeout(init, 500);
            return;
        }
        initSupabase();
        initRealtime();
        try { lucide.createIcons(); } catch (e) {}

        if (!liveBadgeInterval) {
          liveBadgeInterval = setInterval(updateLiveBadge, 30000);
        }

        // Renderiza estrutura inicial (vazia ou placeholders)
        renderKPIs(); 
        renderRanking();
        renderMeetingsTab();
        renderFunnel();
        renderConversion();
        renderChannels();
        renderPipeline();
        try { renderGauge(); } catch(e) {}
        try { renderRevenue(); } catch(e) {}

        // Ranking sort control (discreto)
        try {
          const sel = document.getElementById('ranking-sort');
          if (sel) {
            sel.value = state.rankingSort || 'score';
            sel.onchange = () => {
              state.rankingSort = sel.value || 'score';
              renderRanking();
            };
          }
        } catch (e) {}

        // Modal: fechar ao clicar fora / ESC
        try {
          const overlay = document.getElementById('meeting-modal');
          if (overlay && !overlay.dataset.bound) {
            overlay.dataset.bound = '1';
            overlay.addEventListener('click', (e) => {
              if (e && e.target === overlay) window.closeMeetingModal();
            });
            document.addEventListener('keydown', (e) => {
              if (e && e.key === 'Escape') window.closeMeetingModal();
            });
          }
        } catch (e) {}

        // Aguarda carregamento dos dados reais
        try {
            // Controle de acesso baseado no vendedor logado vindo do Bubble
            const ok = await initAccessControl();
            if (!ok) return;

            await Promise.all([
                // Só líderes precisam carregar a lista completa de executivos
                (access.isLeader ? fetchSellers() : Promise.resolve()),
                fetchDataWithStamp('init')
            ]);
        } catch(err) {
            console.error("Erro ao carregar dados:", err);
        }
        
        // Remove Skeleton e Exibe Dashboard
        const skeleton = document.getElementById('dashboard-skeleton');
        const content = document.getElementById('dashboard-content');
        
        if(skeleton) {
            skeleton.style.transition = 'opacity 0.5s ease';
            skeleton.style.opacity = '0';
            setTimeout(() => {
                skeleton.style.display = 'none';
                if(content) {
                    content.style.display = 'block';
                    // Force reflow
                    void content.offsetWidth;
                    content.classList.add('visible');
                    // Recalcula tamanhos dos gráficos após exibir (ApexCharts bug fix)
                    window.dispatchEvent(new Event('resize'));
                }
            }, 500);
        } else {
             if(content) content.style.display = 'block';
        }
      }

      function initSupabase() {
        try {
            if (typeof supabase !== 'undefined' && supabase.createClient) {
                sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            } else if (typeof Supabase !== 'undefined' && Supabase.createClient) {
                sbClient = Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            }
        } catch (e) { console.error(e); }
      }

      function initRealtime() {
        if (!sbClient) return;
        if (realtimeChannel) return; // avoid double subscribe

        try {
          realtimeChannel = sbClient
            .channel('dashboard-acelerai-v2')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamento' }, () => {
              scheduleRefresh('realtime:agendamento');
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'imagemProposta' }, () => {
              scheduleRefresh('realtime:imagemProposta');
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
              scheduleRefresh('realtime:leads', { revenue: true });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'loogsLeads' }, () => {
              scheduleRefresh('realtime:loogsLeads');
            })
            .subscribe((status) => {
              console.log('[Realtime] status:', status);
            });

          if (!realtimeCleanupRegistered) {
            realtimeCleanupRegistered = true;
            window.addEventListener('beforeunload', () => {
              try {
                if (sbClient && realtimeChannel) sbClient.removeChannel(realtimeChannel);
              } catch (e) {}
            });
          }
        } catch (e) {
          console.error('Erro ao iniciar Realtime:', e);
        }
      }

      function renderKPIs() {
        const c = document.getElementById('kpi-grid');
        c.innerHTML = state.kpis.map((k) => {
          const fmtPct = (v) => {
            // Queremos: "100.0" -> "100", "7.0" -> "7", "0.3" -> "0.3"
            try {
              const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
              if (!Number.isFinite(n)) return '0';
              const one = Math.round(n * 10) / 10;
              const isInt = Math.abs(one - Math.round(one)) < 1e-9;
              const out = isInt ? String(Math.round(one)) : String(one);
              return out === '-0' ? '0' : out;
            } catch (e) {
              return '0';
            }
          };

          const shortLabel = (full) => {
            if (!full) return '';
            const s = String(full).toLowerCase();
            if (s.includes('mês')) return 'Mês';
            if (s.includes('meta')) return 'Meta';
            if (s.includes('ano')) return 'Ano';
            if (s.includes('pond')) return 'Méd.';
            return full;
          };

          const compClass = (item) => {
            if (item && (item.missing || item.neutral)) return 'trend-flat';
            return (item && item.up) ? 'trend-up' : 'trend-down';
          };

          const shouldDash = (item) => {
            // Regra do Mauro: se ficar 0% ou 100% (ou base/atual=0), mostrar -/-.
            if (!item) return true;
            if (item.missing) return true;
            const n = typeof item.v === 'number' ? item.v : parseFloat(String(item.v).replace(',', '.'));
            if (!Number.isFinite(n)) return true;
            const one = Math.round(n * 10) / 10;
            return one === 0 || one === 100;
          };

          const compIcon = (item) => {
            return (item && item.up) ? 'trending-up' : 'trending-down';
          };

          const renderComp = (item) => `
            <div class="kpi-comp-item">
              <div class="kpi-comp-val ${compClass(item)}">
                ${shouldDash(item)
                  ? `<span>-/-</span>`
                  : `<i data-lucide="${compIcon(item)}" size="9"></i> ${fmtPct(item.v)}%`
                }
              </div>
              <div class="kpi-comp-label" title="${item.l}">${shortLabel(item.l)}</div>
            </div>`;

          return `
          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">${k.t}</span>
              <div class="kpi-icon-box ${k.bg}">
                <i data-lucide="${k.i}" size="18"></i>
              </div>
            </div>
            <div class="kpi-val">${k.v}</div>
            <div class="kpi-footer">
              ${renderComp(k.vs1)}
              ${renderComp(k.vs2)}
              ${renderComp(k.vs3)}
            </div>
          </div>`;
        }).join('');
        lucide.createIcons();
      }

      function renderRanking() {
        const c = document.getElementById('ranking-list');
        const countEl = document.getElementById('ranking-count');

        const toNum = (v) => {
          if (v === null || v === undefined) return null;
          if (typeof v === 'number') return Number.isFinite(v) ? v : null;
          const n = parseFloat(String(v).replace(',', '.'));
          return Number.isFinite(n) ? n : null;
        };

        const sortedRanking = [...(state.rankingData || [])].sort((a, b) => {
          const key = state.rankingSort || 'score';
          const get = (obj) => {
            if (!obj) return null;
            if (key === 'score') return toNum(obj.avgScore);
            if (key === 'proposals') return toNum(obj.proposals);
            if (key === 'meetings') return toNum(obj.meetings);
            if (key === 'sales') return toNum(obj.sales);
            if (key === 'frt') return toNum(obj.avgFRT);
            if (key === 'cycle') return toNum(obj.avgCycle);
            return toNum(obj.avgScore);
          };

          const av = get(a);
          const bv = get(b);

          // frt/cycle: menor é melhor; demais: maior é melhor
          const asc = (key === 'frt' || key === 'cycle');

          const aVal = (av === null || av === '-' || av === '') ? (asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : av;
          const bVal = (bv === null || bv === '-' || bv === '') ? (asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : bv;

          if (aVal === bVal) {
            const aScore = toNum(a.avgScore) ?? 0;
            const bScore = toNum(b.avgScore) ?? 0;
            return bScore - aScore;
          }

          return asc ? (aVal - bVal) : (bVal - aVal);
        });

        const visibleRanking = sortedRanking.slice(0, 3);

        if (countEl) countEl.innerText = `${visibleRanking.length}`;

        // Calcular média ponderada REAL dos scores (soma total / total de reuniões)
        let totalScoreSum = 0;
        let totalScoreCount = 0;

        console.log('DEBUG: Verificando dados dos executivos:', visibleRanking.map(e => ({
            name: e.name,
            scoreSum: e.scoreSum,
            scoreCount: e.scoreCount,
            avgScore: e.avgScore
        })));

        visibleRanking.forEach(exec => {
            if (exec.scoreSum && exec.scoreCount) {
                totalScoreSum += exec.scoreSum;
                totalScoreCount += exec.scoreCount;
                console.log(`  ${exec.name}: scoreSum=${exec.scoreSum}, scoreCount=${exec.scoreCount}`);
            }
        });

        const avgWeightedScore = totalScoreCount > 0 ? totalScoreSum / totalScoreCount : 0;

        console.log(`Média Ponderada Global: ${avgWeightedScore.toFixed(1)} (baseado em ${totalScoreCount} reuniões)`);

        c.innerHTML = visibleRanking.map((r, index) => {
            const rank = index + 1;
            const scoreDisplay = r.avgScore !== '-' ? r.avgScore : '--'; // Exibe média do score diretamente
            const scoreVal = r.avgScore !== '-' ? parseFloat(r.avgScore) : 0; // Valor numérico para a barra de progresso

            // Calcular variação vs média ponderada
            let trend = 0;
            let isUp = true;
            let showTrend = false;

            if (r.avgScore !== '-' && !isNaN(scoreVal) && avgWeightedScore > 0) {
                const variation = ((scoreVal - avgWeightedScore) / avgWeightedScore) * 100;
                trend = Math.abs(Math.round(variation));
                isUp = variation >= 0;
                showTrend = true;
            }
            
            // Random roles for visual matching
            const roles = ["Senior Sales Executive", "Sales Executive", "Account Executive"];
            const role = roles[index % roles.length];

            return `
          <div class="rank-card" style="padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 12px; background: var(--bg-card); box-shadow: var(--shadow-sm);">
            <div class="rank-card-header" style="margin-bottom: 12px;">
                <div class="rank-user-info" style="gap: 12px;">
                    <div class="rank-avatar-wrapper" style="width: 40px; height: 40px;">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${r.name}" class="rank-avatar" alt="${r.name}" style="background: var(--bg-subtle);">
                        <div class="rank-badge rank-${rank <= 3 ? rank : 'other'}" style="width: 16px; height: 16px; font-size: 10px; border: 2px solid var(--bg-card); bottom: -2px; right: -2px;">${rank}</div>
                    </div>
                    <div class="rank-details">
                        <div class="rank-name" style="font-size: 14px; font-weight: 600; color: var(--text-main); margin-bottom: 2px;">${r.name}</div>
                        <div class="rank-role" style="font-size: 11px; color: var(--text-muted); font-weight: 400;">${role}</div>
                    </div>
                </div>
                <div class="rank-score-box">
                    <div class="rank-score-val" style="font-size: 18px; font-weight: 700; color: var(--col-success); letter-spacing: -0.02em;">${scoreDisplay}</div>
                    ${showTrend ? `
                    <div class="rank-trend" style="color: ${isUp ? 'var(--col-success)' : 'var(--col-danger)'}; font-size: 10px; font-weight: 600; margin-top: 2px;">
                        <i data-lucide="${isUp ? 'trending-up' : 'trending-down'}" size="12" style="margin-right: 2px;"></i> ${trend}%
                    </div>` : '<div class="rank-trend" style="color:var(--text-muted); font-size: 10px;">--</div>'}
                </div>
            </div>
            
            <div class="rank-separator" style="height: 4px; background: var(--bg-subtle); border-radius: 2px; margin-bottom: 16px;">
                <div class="rank-separator-fill" style="width: ${scoreVal}%; background: var(--col-primary); border-radius: 2px;"></div>
            </div>
            
            <div class="rank-metrics" style="display: flex; gap: 8px; margin-bottom: 12px;">
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:var(--col-primary); font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="file-text" size="14"></i> ${r.proposals}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: var(--text-muted); font-weight: 500;">Propostas</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:var(--text-muted); font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="users" size="14"></i> ${r.meetings}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: var(--text-muted); font-weight: 500;">Reuniões</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:var(--col-success); font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="zap" size="14"></i> ${r.sales > 0 ? (r.sales/1000).toFixed(0) : 0}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: var(--text-muted); font-weight: 500;">Vendas</div>
                </div>
            </div>
            
            <div class="rank-footer" style="display: flex; gap: 16px; font-size: 11px; color: var(--text-muted); padding-left: 4px;">
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="clock" size="12"></i> Ciclo: <span style="font-weight: 600; color: var(--text-main);">${r.avgCycle !== '-' ? Math.round(r.avgCycle)+'d' : '--'}</span>
                </div>
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="timer" size="12" style="color:var(--col-primary)"></i> FRT: <span style="font-weight: 600; color: var(--text-main);">${r.avgFRT !== '-' ? r.avgFRT+'min' : '--'}</span>
                </div>
            </div>
          </div>
        `}).join('');
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      function renderFunnel(data) {
        const container = document.getElementById('funnel-bars');
        if (!container) return;
        if (!data) {
            container.innerHTML = '<div class="text-xs text-muted text-center p-4">Carregando funil...</div>';
            return;
        }

          const maxVal = Math.max(...data.map(d => d.v)) || 1;

          container.innerHTML = data.map((d, idx) => {
              const widthPct = Math.max(5, (d.v / maxVal) * 100); // Min 5% para visibilidade visual, mas a barra deve refletir a proporção visualmente agradável
            
            // Na referência, a barra parece preencher 100% do container para o maior valor? 
            // Ou é sempre cheia para o item e a cor que muda? 
            // Na imagem referência, a barra azul (primeira) ocupa quase tudo. As outras diminuem.
            // Então a lógica de widthPct baseada no maxVal está correta para simular o "funil" visual.
            
              return `
              <div class="funnel-step w-full">
                  <div class="flex justify-between items-center mb-3">
                      <span class="funnel-label">${d.l}</span>
                      <div class="flex items-center gap-3">
                          <span class="funnel-value">${d.v}</span>
                          <span class="funnel-badge">${idx === 0 ? '100%' : `${d.gc}%`}</span>
                      </div>
                  </div>
                  <div class="funnel-bar-bg">
                      <div class="funnel-bar-fill" style="width: ${widthPct}%; background-color: ${d.color}"></div>
                  </div>
              </div>
              `;
          }).join('');
          
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

      async function fetchFunnelData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        const meetingsRange = getMeetingsDateRange(state.dateFilter);
        
        // 1. Leads Captados
        let queryCaptados = sbClient.from('leads').select('lead_id', { count: 'exact', head: true });
        queryCaptados = applyCutoffTimestamp(queryCaptados, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) queryCaptados = queryCaptados.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countCaptados } = await queryCaptados;

        // 2. Leads Qualificados = leads com vendedorResponsavel (no período do filtro)
        let queryQualif = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        queryQualif = applyCutoffTimestamp(queryQualif, 'created_at')
          .gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryQualif = queryQualif.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countQualificados } = await queryQualif;

        // 3. Propostas
        let countPropostas = 0;
        try {
          let qProps = sbClient
            .from('imagemProposta')
            .select('id_lead, id_vendedor')
            .not('id_lead', 'is', null);
          qProps = applyCutoffTimestamp(qProps, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) {
            qProps = qProps.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);
          }
          const { data: props } = await qProps;

          if (!state.selectedSeller) {
            countPropostas = new Set((props || []).map(p => p && p.id_lead).filter(Boolean)).size;
          } else {
            const direct = new Set();
            const needFallback = new Set();
            (props || []).forEach(p => {
              if (!p || !p.id_lead) return;
              if (p.id_vendedor === state.selectedSeller) direct.add(p.id_lead);
              else if (!p.id_vendedor) needFallback.add(p.id_lead);
            });
            if (needFallback.size > 0) {
              for (const chunk of chunkArray([...needFallback], 500)) {
                const { data: leads } = await sbClient
                  .from('leads')
                  .select('lead_id')
                  .in('lead_id', chunk)
                        .eq('vendedorResponsavel', state.selectedSeller);
                (leads || []).forEach(r => { if (r && r.lead_id) direct.add(r.lead_id); });
                 }
             }
            countPropostas = direct.size;
        }
        } catch (e) {}

        // 4. Reuniões
        let queryReunioes = sbClient.from('agendamento').select('leadId', { count: 'exact', head: true });
        queryReunioes = applyCutoffDateYmd(queryReunioes, 'data').gte('data', meetingsRange.startYmd).lte('data', meetingsRange.endYmd);
        queryReunioes = applyMeetingNotCanceledFilter(queryReunioes);
        if (state.selectedSeller) queryReunioes = queryReunioes.eq('vendedor', state.selectedSeller);
        const { count: countReunioes } = await queryReunioes;

        // 5. Vendas
        let queryVendas = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .not('valorFechado', 'is', null);
        queryVendas = applyCutoffTimestamp(queryVendas, 'dataFechamento').gte('dataFechamento', start).lte('dataFechamento', end);
        if (state.selectedSeller) queryVendas = queryVendas.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countVendas } = await queryVendas;

        const funnelData = [
            { l:"Leads Captados", v: countCaptados || 0, color:"#3b82f6" },
            { l:"Leads Qualificados", v: countQualificados || 0, color:"#60a5fa" },
            { l:"Propostas", v: countPropostas || 0, color:"#22c55e" },
            { l:"Reuniões", v: countReunioes || 0, color:"#f59e0b" },
            { l:"Vendas", v: countVendas || 0, color:"#16a34a" }
        ];

        // Calcular conversões
        const processedFunnel = funnelData.map((item, index) => {
            const prev = index > 0 ? funnelData[index-1].v : funnelData[0].v;
            const total = funnelData[0].v;
            const conversion = prev > 0 ? Math.round((item.v / prev) * 100) : 0;
            const globalConversionRaw = total > 0 ? Math.round((item.v / total) * 100) : 0;
            const globalConversion = Math.max(0, Math.min(100, globalConversionRaw));
            return { ...item, c: index === 0 ? 100 : conversion, gc: index === 0 ? 100 : globalConversion };
        });

        renderFunnel(processedFunnel);
      }

      async function fetchConversionRates() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        const startYmd = (start || '').split('T')[0];
        const endYmd = (end || '').split('T')[0];

        // Denominador: TOTAL DE LEADS CAPTADOS no período (created_at)
        let qTotal = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true });
        qTotal = applyCutoffTimestamp(qTotal, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) qTotal = qTotal.eq('vendedorResponsavel', state.selectedSeller);
        const { count: totalLeads } = await qTotal;
        const denom = totalLeads || 0;

        // Taxa 1: leads com vendedorResponsavel / totalLeads
        let qWithSeller = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        qWithSeller = applyCutoffTimestamp(qWithSeller, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) qWithSeller = qWithSeller.eq('vendedorResponsavel', state.selectedSeller);
        const { count: leadsWithSeller } = await qWithSeller;

        // Helper: filtrar leadIds para aqueles CAPTADOS no período (e seller quando aplicável)
        const filterCapturedLeadIds = async (leadIds) => {
          const out = new Set();
          for (const chunk of chunkArray(leadIds || [], 500)) {
            let q = sbClient
              .from('leads')
              .select('lead_id, created_at, vendedorResponsavel')
              .in('lead_id', chunk);
            q = applyCutoffTimestamp(q, 'created_at').gte('created_at', start).lte('created_at', end);
            if (state.selectedSeller) q = q.eq('vendedorResponsavel', state.selectedSeller);
            const { data } = await q;
            (data || []).forEach(l => { if (l && l.lead_id) out.add(l.lead_id); });
          }
          return out;
        };

        // Taxa 2: leads com agendamento / totalLeads (por leadId; no período)
        let qMeet = sbClient
          .from('agendamento')
          .select('leadId')
          .not('leadId', 'is', null);
        qMeet = applyCutoffDateYmd(qMeet, 'data').gte('data', startYmd).lte('data', endYmd);
        if (state.selectedSeller) qMeet = qMeet.eq('vendedor', state.selectedSeller);
        const { data: meetingsRows } = await qMeet;
        const meetLeadIds = [...new Set((meetingsRows || []).map(r => r && r.leadId).filter(Boolean))];
        const meetCaptured = await filterCapturedLeadIds(meetLeadIds);
        const leadsWithMeetings = meetCaptured.size;

        // Taxa 3: leads com proposta / totalLeads (por id_lead; no período)
        let qProps = sbClient
          .from('imagemProposta')
          .select('id_lead, id_vendedor')
          .not('id_lead', 'is', null);
        qProps = applyCutoffTimestamp(qProps, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) {
          // reduz volume: propostas do vendedor OU sem id_vendedor (fallback por lead)
          qProps = qProps.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);
        }
        const { data: propsRows } = await qProps;

        const propMap = {};
        (propsRows || []).forEach(p => {
          if (!p || !p.id_lead) return;
          propMap[p.id_lead] = propMap[p.id_lead] || { hasSeller: false, hasNull: false };
        if (state.selectedSeller) {
            if (p.id_vendedor === state.selectedSeller) propMap[p.id_lead].hasSeller = true;
            if (!p.id_vendedor) propMap[p.id_lead].hasNull = true;
          } else {
            propMap[p.id_lead].hasSeller = true; // sem filtro: basta existir
          }
        });

        const propLeadIds = Object.keys(propMap);
        const propCaptured = await filterCapturedLeadIds(propLeadIds);

        let leadsWithProposals = 0;
        if (!state.selectedSeller) {
          leadsWithProposals = propCaptured.size;
        } else {
          // Para fallback (id_vendedor null), precisa confirmar vendedorResponsavel==selectedSeller.
          for (const leadId of propCaptured) {
            const flags = propMap[leadId];
            if (!flags) continue;
            if (flags.hasSeller) { leadsWithProposals++; continue; }
            if (flags.hasNull) { leadsWithProposals++; }
          }
        }

        // CALCULAR TAXAS (%) — ordem exibida: Lead → Reunião → Proposta
        const taxaLead = denom > 0 ? parseFloat((((leadsWithSeller || 0) / denom) * 100).toFixed(1)) : 0;
        const taxaReuniao = denom > 0 ? parseFloat(((leadsWithMeetings / denom) * 100).toFixed(1)) : 0;
        const taxaProposta = denom > 0 ? parseFloat(((leadsWithProposals / denom) * 100).toFixed(1)) : 0;

        // Armazenar no estado
        state.conversionRates = [taxaLead, taxaReuniao, taxaProposta];

        console.log('Conversion Rates Calculated:', {
          totalLeads: denom,
          leadsWithSeller: leadsWithSeller || 0,
          leadsWithMeetings,
          leadsWithProposals,
          taxaLead,
          taxaReuniao,
          taxaProposta,
        });

        // Renderizar
        renderConversion();
      }

      async function fetchChannelData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);

        // 1. Buscar Leads (Total) por Canal
        // LP: leadLandingPage = true
        // WPP: leadLandingPage = false (assumindo WPP como principal canal direto)
        
        let queryLP = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .eq('leadLandingPage', true);
        queryLP = applyCutoffTimestamp(queryLP, 'created_at').gte('created_at', start).lte('created_at', end);
            
        let queryWPP = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .eq('leadLandingPage', false); // Simplificação conforme análise
        queryWPP = applyCutoffTimestamp(queryWPP, 'created_at').gte('created_at', start).lte('created_at', end);

        if (state.selectedSeller) {
            queryLP = queryLP.eq('vendedorResponsavel', state.selectedSeller);
            queryWPP = queryWPP.eq('vendedorResponsavel', state.selectedSeller);
        }

        const [resLP, resWPP] = await Promise.all([queryLP, queryWPP]);
        const leadsLP = resLP.count || 0;
        const leadsWPP = resWPP.count || 0;

        // 2. Buscar Receita (Leads com valorFechado) por Canal
        // Precisamos dos dados para somar no JS pois valorFechado é texto
        
        let queryRevLP = sbClient.from('leads').select('valorFechado')
            .eq('leadLandingPage', true)
            .not('valorFechado', 'is', null);
        queryRevLP = applyCutoffTimestamp(queryRevLP, 'dataFechamento').gte('dataFechamento', start).lte('dataFechamento', end);

        let queryRevWPP = sbClient.from('leads').select('valorFechado')
            .eq('leadLandingPage', false)
            .not('valorFechado', 'is', null);
        queryRevWPP = applyCutoffTimestamp(queryRevWPP, 'dataFechamento').gte('dataFechamento', start).lte('dataFechamento', end);

        if (state.selectedSeller) {
            queryRevLP = queryRevLP.eq('vendedorResponsavel', state.selectedSeller);
            queryRevWPP = queryRevWPP.eq('vendedorResponsavel', state.selectedSeller);
        }

        const [resRevLP, resRevWPP] = await Promise.all([queryRevLP, queryRevWPP]);

        const dataLP = resRevLP && resRevLP.data ? resRevLP.data : [];
        const dataWPP = resRevWPP && resRevWPP.data ? resRevWPP.data : [];

        // Vendas (quantidade de leads com valorFechado no período)
        const salesLP = dataLP.length;
        const salesWPP = dataWPP.length;

        // Receita (soma valorFechado no período)
        const revLP = dataLP.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0);
        const revWPP = dataWPP.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0);

        // 3. Calcular ROI
        // ROI = (Receita - Investimento) / Investimento * 100
        const calcROI = (rev, inv) => {
            if (!inv || inv === 0) return 0;
            return ((rev - inv) / inv) * 100;
        };

        const roiLP = calcROI(revLP, state.channelInvestments.landing);
        const roiWPP = calcROI(revWPP, state.channelInvestments.whatsapp);

        // 3.5. Calcular Taxa de Conversão (Vendas / Total Leads × 100)
        const convLP = leadsLP > 0 ? ((salesLP / leadsLP) * 100).toFixed(1) : '0.0';
        const convWPP = leadsWPP > 0 ? ((salesWPP / leadsWPP) * 100).toFixed(1) : '0.0';

        console.log('Channel Conversion Rates:', {
            landingPage: { leads: leadsLP, sales: salesLP, conv: convLP + '%' },
            whatsApp: { leads: leadsWPP, sales: salesWPP, conv: convWPP + '%' }
        });

        // 4. Atualizar Estado
        state.channelData = [
            {
                id: 'landing', n: "Landing Page", l: leadsLP,
                rev: revLP,
                roi: roiLP,
                gasto: null, conv: convLP,
                i: "globe", c: "primary", active: true, tone: "#3b82f6"
            },
            {
                id: 'whatsapp', n: "WhatsApp", l: leadsWPP,
                rev: revWPP,
                roi: roiWPP,
                gasto: null, conv: convWPP,
                i: "message-circle", c: "success", active: true, tone: "#22c55e"
            },
            { 
                id: 'outbound', n: "Outbound", l: 180, // Mock
                rev: null, 
                roi: null, 
                gasto: null, conv: null,
                i: "phone", c: "danger", active: false, tone: "#f97316"
            },
            { 
                id: 'social', n: "Social", l: 320, // Mock
                rev: null, 
                roi: null, 
                gasto: null, conv: null,
                i: "share-2", c: "purple", active: false, tone: "#8b5cf6"
            }
        ];

        renderChannels();
      }

      function pipelineRound(val, decimals = 1) {
        const n = Number(val);
        if (!Number.isFinite(n)) return null;
        const p = Math.pow(10, decimals);
        return Math.round(n * p) / p;
      }

      function formatPipelineValue(stageKey, val) {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) return '--';
        if (stageKey === 'atendimento') return `${Math.round(n)}m`;
        if (stageKey === 'reuniao') {
          const v = n < 10 ? pipelineRound(n, 1) : Math.round(n);
          return `${v}h`;
        }
        if (stageKey === 'fechamento') {
          const v = n < 10 ? pipelineRound(n, 1) : Math.round(n);
          return `${v}d`;
        }
        return `${Math.round(n)}`;
      }

      function pipelineEffFromAvgs(avgs) {
        const a = avgs && Number(avgs.atendimentoMin);
        const b = avgs && Number(avgs.meetingToProposalHours);
        const c = avgs && Number(avgs.proposalToCloseDays);
        const n1 = (Number.isFinite(a) && a > 0) ? Math.min(PIPELINE_TARGETS.atendimentoMin / a, 1) : 0;
        const n2 = (Number.isFinite(b) && b > 0) ? Math.min(PIPELINE_TARGETS.meetingToProposalHours / b, 1) : 0;
        const n3 = (Number.isFinite(c) && c > 0) ? Math.min(PIPELINE_TARGETS.proposalToCloseDays / c, 1) : 0;
        const eff = Math.round(100 * ((n1 + n2 + n3) / 3));
        return Number.isFinite(eff) ? eff : 0;
      }

      async function fetchPipelineData() {
        if (!sbClient) return;

        try {
          const stages = [
            { key: 'atendimento', label: 'Atendimento', tone: 'blue' },
            { key: 'reuniao', label: 'Reunião', tone: 'amber' },
            { key: 'fechamento', label: 'Fechamento', tone: 'green' }
          ];

          // Range geral (timestamp) continua até hoje; reuniões (agendamento.data) inclui futuro até fim do período (week/month)
          const { start, end } = getDateRange(state.dateFilter);
          const meetRange = getMeetingsDateRange(state.dateFilter);
          const startYmd = meetRange.startYmd;
          const endYmd = meetRange.endYmd;

          // 0) Vendedores reais do BD (colunas)
          const { data: sellersDb, error: sellersErr } = await sbClient
            .from('vendedores')
            .select('id, nome')
            .eq('usuarioInterno', false)
            .order('nome');
          if (sellersErr) console.error('[pipeline] erro vendedores:', sellersErr);

          const sellerIdToName = {};
          (sellersDb || []).forEach(s => { if (s && s.id) sellerIdToName[s.id] = s.nome || String(s.id); });
          // fallback p/ modo vendedor (quando não carregamos lista completa)
          if (access && access.sellerId && access.sellerName && !sellerIdToName[access.sellerId]) {
            sellerIdToName[access.sellerId] = access.sellerName;
          }

          // 1) Reuniões no período (âncora atendimento/reunião)
          let qMeet = sbClient
            .from('agendamento')
            .select('leadId, vendedor, data, hora')
            .not('leadId', 'is', null);
          qMeet = applyCutoffDateYmd(qMeet, 'data').gte('data', startYmd).lte('data', endYmd);
          qMeet = applyMeetingNotCanceledFilter(qMeet);
          if (state.selectedSeller) qMeet = qMeet.eq('vendedor', state.selectedSeller);

          const { data: meetingsRows, error: meetErr } = await qMeet;
          if (meetErr) console.error('[pipeline] erro agendamento:', meetErr);

          const leadMeet = {}; // leadId -> { meetingAt: Date, sellerId: uuid }
          (meetingsRows || []).forEach(m => {
            const leadId = m && m.leadId;
            if (!leadId) return;
            const dt = parseMeetingDateTimeYmdHm(m.data, m.hora);
            if (!dt) return;
            const t = dt.getTime();
            const prev = leadMeet[leadId];
            if (!prev || t < prev.meetingAt.getTime()) {
              leadMeet[leadId] = { meetingAt: dt, sellerId: m.vendedor || null };
            }
          });

          const meetingLeadIds = Object.keys(leadMeet);

          // Agregadores por vendedor
          const agg = {}; // sellerId -> sums/counts + avgs
          const ensureAgg = (sellerId) => {
            const k = sellerId || '__unknown__';
            if (!agg[k]) {
              agg[k] = {
                sellerId: sellerId || null,
                atendimentoSumMin: 0, atendimentoCount: 0,
                mtpSumHours: 0, mtpCount: 0,
                ptcSumDays: 0, ptcCount: 0
              };
            }
            return agg[k];
          };

          // 2) Atendimento: Novo Lead -> Agendamento (apenas leads com reunião)
          const novoLeadId = await getEtapaIdByName('Novo Lead');
          const entryByLead = {}; // leadId -> created_at ISO (min)

          if (novoLeadId && meetingLeadIds.length) {
            const chunks = chunkArray(meetingLeadIds, 500);
            for (const chunk of chunks) {
              let q = sbClient
                .from('loogsLeads')
                .select('lead, created_at')
                .eq('etapa_posterior', novoLeadId)
                .in('lead', chunk);
              q = applyCutoffTimestamp(q, 'created_at');
              const { data, error } = await q;
              if (error) console.error('[pipeline] erro loogsLeads:', error);
              (data || []).forEach(r => {
                if (!r || !r.lead || !r.created_at) return;
                const prev = entryByLead[r.lead];
                if (!prev || new Date(r.created_at).getTime() < new Date(prev).getTime()) {
                  entryByLead[r.lead] = r.created_at;
                }
              });
            }
          }

          const leadCreatedAt = {}; // leadId -> created_at ISO
          if (meetingLeadIds.length) {
            const chunks = chunkArray(meetingLeadIds, 500);
            for (const chunk of chunks) {
              let q = sbClient
                .from('leads')
                .select('lead_id, created_at')
                .in('lead_id', chunk);
              q = applyCutoffTimestamp(q, 'created_at');
              const { data, error } = await q;
              if (error) console.error('[pipeline] erro leads(created_at):', error);
              (data || []).forEach(l => { if (l && l.lead_id && l.created_at) leadCreatedAt[l.lead_id] = l.created_at; });
            }
          }

          // 2.1) Diferenças de atendimento
          meetingLeadIds.forEach(leadId => {
            const meet = leadMeet[leadId];
            if (!meet || !meet.meetingAt) return;
            const meetingAt = meet.meetingAt;
            const sellerId = meet.sellerId;
            const novoIso = entryByLead[leadId] || leadCreatedAt[leadId] || null;
            if (!novoIso) return;
            const novoAt = new Date(novoIso);
            const diffMin = (meetingAt.getTime() - novoAt.getTime()) / 60000;
            if (!(diffMin > 0) || diffMin > PIPELINE_LIMITS.atendimentoMaxMin) return;
            const bucket = ensureAgg(sellerId);
            bucket.atendimentoSumMin += diffMin;
            bucket.atendimentoCount += 1;
          });

          // 3) Reunião -> Proposta (primeira proposta após a reunião)
          const proposalsByLead = {}; // leadId -> [Date... sorted asc]
          if (meetingLeadIds.length) {
            const chunks = chunkArray(meetingLeadIds, 500);
            for (const chunk of chunks) {
              let q = sbClient
                .from('imagemProposta')
                .select('id_lead, created_at')
                .not('id_lead', 'is', null)
                .in('id_lead', chunk)
                .order('created_at', { ascending: true });
              q = applyCutoffTimestamp(q, 'created_at');
              const { data, error } = await q;
              if (error) console.error('[pipeline] erro imagemProposta (mtp):', error);
              (data || []).forEach(p => {
                if (!p || !p.id_lead || !p.created_at) return;
                const dt = new Date(p.created_at);
                if (Number.isNaN(dt.getTime())) return;
                proposalsByLead[p.id_lead] = proposalsByLead[p.id_lead] || [];
                proposalsByLead[p.id_lead].push(dt);
              });
            }
          }

          meetingLeadIds.forEach(leadId => {
            const meet = leadMeet[leadId];
            if (!meet || !meet.meetingAt) return;
            const sellerId = meet.sellerId;
            const meetingAt = meet.meetingAt;
            const arr = proposalsByLead[leadId] || [];
            if (!arr.length) return;
            // primeira proposta após meetingAt
            let proposalAt = null;
            for (let i = 0; i < arr.length; i++) {
              if (arr[i].getTime() > meetingAt.getTime()) { proposalAt = arr[i]; break; }
            }
            if (!proposalAt) return;
            const diffHours = (proposalAt.getTime() - meetingAt.getTime()) / 3600000;
            if (!(diffHours > 0) || diffHours > PIPELINE_LIMITS.meetingToProposalMaxHours) return;
            const bucket = ensureAgg(sellerId);
            bucket.mtpSumHours += diffHours;
            bucket.mtpCount += 1;
          });

          // 4) Proposta -> Fechamento (âncora por dataFechamento)
          let qClose = sbClient
            .from('leads')
            .select('lead_id, dataFechamento, vendedorResponsavel')
            .not('lead_id', 'is', null)
            .not('dataFechamento', 'is', null);
          qClose = applyCutoffTimestamp(qClose, 'dataFechamento').gte('dataFechamento', start).lte('dataFechamento', end);
          if (state.selectedSeller) qClose = qClose.eq('vendedorResponsavel', state.selectedSeller);

          const { data: closedRows, error: closeErr } = await qClose;
          if (closeErr) console.error('[pipeline] erro leads(fechamento):', closeErr);

          const closedLeads = (closedRows || []).filter(r => r && r.lead_id && r.dataFechamento);
          const closedLeadIds = closedLeads.map(r => r.lead_id);

          const closeAtByLead = {};
          let minCloseAt = null;
          let maxCloseAt = null;
          closedLeads.forEach(r => {
            const dt = new Date(r.dataFechamento);
            if (Number.isNaN(dt.getTime())) return;
            closeAtByLead[r.lead_id] = dt;
            if (!minCloseAt || dt.getTime() < minCloseAt.getTime()) minCloseAt = dt;
            if (!maxCloseAt || dt.getTime() > maxCloseAt.getTime()) maxCloseAt = dt;
            // garante bucket do responsável (mesmo se ainda não tiver dados de reunião)
            ensureAgg(r.vendedorResponsavel || null);
          });

          const closePropsByLead = {}; // leadId -> [Date... sorted asc]
          if (closedLeadIds.length && minCloseAt && maxCloseAt) {
            const lookback = new Date(minCloseAt.getTime() - PIPELINE_LIMITS.proposalLookbackDays * 24 * 3600000).toISOString();
            const maxIso = maxCloseAt.toISOString();
            const chunks = chunkArray(closedLeadIds, 500);
            for (const chunk of chunks) {
              let q = sbClient
                .from('imagemProposta')
                .select('id_lead, created_at')
                .not('id_lead', 'is', null)
                .in('id_lead', chunk)
                .gte('created_at', lookback)
                .lte('created_at', maxIso)
                .order('created_at', { ascending: true });
              q = applyCutoffTimestamp(q, 'created_at');
              const { data, error } = await q;
              if (error) console.error('[pipeline] erro imagemProposta (ptc):', error);
              (data || []).forEach(p => {
                if (!p || !p.id_lead || !p.created_at) return;
                const dt = new Date(p.created_at);
                if (Number.isNaN(dt.getTime())) return;
                closePropsByLead[p.id_lead] = closePropsByLead[p.id_lead] || [];
                closePropsByLead[p.id_lead].push(dt);
              });
            }
          }

          closedLeads.forEach(r => {
            const leadId = r.lead_id;
            const sellerId = r.vendedorResponsavel || null;
            const closeAt = closeAtByLead[leadId];
            if (!closeAt) return;
            const arr = closePropsByLead[leadId] || [];
            if (!arr.length) return;

            // última proposta <= closeAt
            let proposalAt = null;
            for (let i = 0; i < arr.length; i++) {
              if (arr[i].getTime() <= closeAt.getTime()) proposalAt = arr[i];
              else break;
            }
            if (!proposalAt) return;
            const diffDays = (closeAt.getTime() - proposalAt.getTime()) / (1000 * 60 * 60 * 24);
            if (!(diffDays > 0) || diffDays > PIPELINE_LIMITS.proposalToCloseMaxDays) return;
            const bucket = ensureAgg(sellerId);
            bucket.ptcSumDays += diffDays;
            bucket.ptcCount += 1;
          });

          // 5) Montar rows (somente vendedores reais do BD) + pivot por 1 vendedor
          const rows = [];

          const wantOnly = state.selectedSeller || null;
          const sellerIds = Object.keys(sellerIdToName);

          // Se não tiver lista de vendedores (edge), ainda assim renderiza o selecionado
          if (wantOnly && !sellerIdToName[wantOnly]) sellerIdToName[wantOnly] = wantOnly;

          const iterIds = wantOnly ? [wantOnly] : sellerIds;
          iterIds.forEach(sellerId => {
            if (!sellerId) return;
            const bucket = agg[sellerId] || null;

            const atendimentoAvg = bucket && bucket.atendimentoCount > 0 ? (bucket.atendimentoSumMin / bucket.atendimentoCount) : null;
            const mtpAvg = bucket && bucket.mtpCount > 0 ? (bucket.mtpSumHours / bucket.mtpCount) : null;
            const ptcAvg = bucket && bucket.ptcCount > 0 ? (bucket.ptcSumDays / bucket.ptcCount) : null;

            const avgs = {
              atendimentoMin: atendimentoAvg,
              meetingToProposalHours: mtpAvg,
              proposalToCloseDays: ptcAvg
            };

            const hasAny = (bucket && (bucket.atendimentoCount || bucket.mtpCount || bucket.ptcCount)) ? true : false;
            if (!wantOnly && !hasAny) return; // evita coluna vazia no modo "Todos" (conforme plano)

            const eff = pipelineEffFromAvgs(avgs);
            rows.push({
              id: sellerId,
              name: sellerIdToName[sellerId] || sellerId,
              eff,
              avgs,
              times: {
                atendimento: atendimentoAvg,
                reuniao: mtpAvg,
                fechamento: ptcAvg
              }
            });
          });

          rows.sort((a, b) => (b.eff || 0) - (a.eff || 0));

          state.pipelineRows = rows;
          renderPipeline();
        } catch (e) {
          console.error('[pipeline] erro geral:', e);
          state.pipelineRows = [];
          renderPipeline();
        }
      }

      function renderChannels() {
        const c = document.getElementById('channel-grid');
        if(!c) return;
        
        c.innerHTML = state.channelData.map(ch => {
          const tone = ch.tone || '#3b82f6';
          const tint = `${tone}1a`;
          const isActive = !!ch.active;
          const rev = ch.rev != null ? formatCurrencyCompact(ch.rev) : '--';
          const gasto = ch.gasto != null ? formatCurrencyCompact(ch.gasto) : '--';
          const conv = ch.conv != null ? `${ch.conv}%` : '--';
          const roiVal = ch.roi != null ? `${ch.roi > 0 ? '+' : ''}${ch.roi.toFixed(1)}%` : '--';
          return `
          <div class="channel-card ${isActive ? '' : 'disabled'}">
            <div class="channel-header">
              <div class="channel-pill" style="border-color:${tone}; background:${tint}; color:${tone};">
                <i data-lucide="${ch.i}"></i>
              </div>
              <div class="channel-meta">
                <span class="name">${ch.n}</span>
                <span class="leads">${ch.l} leads</span>
              </div>
            </div>
            <div class="channel-main" style="border-color:${tone}33; background:${isActive ? tint : 'var(--bg-card)'}; color:${tone};">
              ${rev}
              <span class="label">Receita</span>
            </div>
            <div class="channel-progress">
              <div class="channel-progress-fill" style="width:${isActive ? '100%' : '35%'}; background:${tone}; opacity:${isActive ? 1 : 0.35};"></div>
            </div>
            <div class="channel-footer">
              <div class="channel-stat">
                <div class="value" style="color:${tone};">${gasto}</div>
                <div class="label">Gasto</div>
              </div>
              <div class="channel-stat">
                <div class="value">${conv}</div>
                <div class="label">Conv.</div>
              </div>
              <div class="channel-stat">
                <div class="value">${roiVal}</div>
                <div class="label">ROI</div>
              </div>
            </div>
          </div>
          `;
        }).join('');
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      function renderPipeline() {
        const c = document.getElementById('pipeline-container');
        if (!c) return;

        const stages = [
          { key: 'atendimento', label: 'Atendimento', tone: 'blue' },
          { key: 'reuniao', label: 'Reunião', tone: 'amber' },
          { key: 'fechamento', label: 'Fechamento', tone: 'green' }
        ];

        const rows = Array.isArray(state.pipelineRows) ? state.pipelineRows : [];

        // Modo pivot: 1 vendedor (ex.: filtro no header)
        const isPivot = rows.length === 1;
        c.classList.toggle('pipeline-diagram-scroll--pivot', isPivot);

        if (!rows.length) {
          c.innerHTML = `
            <div class="pipeline-diagram-header">
              <div class="pipeline-hint">Sem dados no período • ajuste o filtro de data/vendedor</div>
              <div class="pipeline-sort-pill">Ranking por Eficiência</div>
            </div>
          `;
          return;
        }

        if (isPivot) {
          const r = rows[0];
          c.innerHTML = `
            <div class="pipeline-pivot">
              <div class="pipeline-pivot-header">
                <div class="pipeline-avatar-wrap">
                  <img class="pipeline-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.name)}" alt="${escapeHtmlLite(r.name)}">
                </div>
                <div class="pipeline-pivot-head-meta">
                  <div class="pipeline-pivot-name">${escapeHtmlLite(r.name)}</div>
                </div>
              </div>

              <div class="pipeline-pivot-rows">
                ${stages.map((s) => {
                  const val = r && r.times ? r.times[s.key] : null;
                  const pill = formatPipelineValue(s.key, val);
                  return `
                    <div class="pipeline-pivot-row">
                      <div class="pipeline-pivot-stage">
                        <span class="pipeline-dot" style="position:static; transform:none; box-shadow:none; background:${s.tone === 'blue' ? 'var(--col-primary)' : (s.tone === 'amber' ? 'var(--col-warning)' : 'var(--col-success)')}"></span>
                        <span>${s.label}</span>
                      </div>
                      <div class="pipeline-pill pipeline-pill--${s.tone}">${pill}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
          return;
        }

        c.innerHTML = `
          <div class="pipeline-diagram-header">
            <div class="pipeline-hint">${rows.length} executivos • arraste para ver mais →</div>
            <div class="pipeline-sort-pill">Ranking por Eficiência</div>
          </div>
          <div class="pipeline-grid" style="grid-template-columns: 160px repeat(${rows.length}, 112px);">
            <div class="pipeline-stage-label pipeline-stage-label--header"></div>
            ${rows.map((r, idx) => {
              return `
              <div class="pipeline-seller-header">
                <div class="pipeline-avatar-wrap">
                    <img class="pipeline-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.name)}" alt="${escapeHtmlLite(r.name)}">
                  <div class="pipeline-rank-badge">#${idx + 1}</div>
                </div>
                  <div class="pipeline-seller-name">${escapeHtmlLite(r.name)}</div>
              </div>
              `;
            }).join('')}

            ${stages.map((s, stageIdx) => `
              <div class="pipeline-stage-label">${s.label}</div>
              ${rows.map((r) => {
                const val = r && r.times ? r.times[s.key] : null;
                const pill = formatPipelineValue(s.key, val);
                const firstClass = stageIdx === 0 ? 'pipeline-cell--first' : '';
                const lastClass = stageIdx === (stages.length - 1) ? 'pipeline-cell--last' : '';
                return `
                  <div class="pipeline-cell ${firstClass} ${lastClass}">
                    <div class="pipeline-dot" style="background:${s.tone === 'blue' ? 'var(--col-primary)' : (s.tone === 'amber' ? 'var(--col-warning)' : 'var(--col-success)')}"></div>
                    <div class="pipeline-pill pipeline-pill--${s.tone}">${pill}</div>
                  </div>
                `;
              }).join('')}
            `).join('')}
          </div>
        `;
      }

      function renderGauge(gaugePct = 0, currentRevenue = 0, targetRevenue = TARGET_REVENUE_MONTHLY, prevRevenue = 0, missing = 0) {
        const chartEl = document.querySelector("#gauge-chart");
        if (!chartEl) return;
        chartEl.innerHTML = "";

        // Colors adaptation for dark mode if needed
        const isDark = state.theme === 'dark';
        const trackColor = isDark ? "#334155" : "#f1f5f9";

        var options = {
          series: [gaugePct],
          chart: {
            height: 320,
            type: 'radialBar',
            offsetY: -20,
            sparkline: { enabled: true },
            background: 'transparent'
          },
          plotOptions: {
            radialBar: {
              startAngle: -100,
              endAngle: 100,
              hollow: {
                margin: 0,
                size: '60%',
                background: 'transparent',
                image: undefined,
              },
              track: {
                background: trackColor,
                strokeWidth: '100%',
                margin: 5,
              },
              dataLabels: { show: false }
            }
          },
          fill: { type: "solid" },
          stroke: { lineCap: "butt" },
          colors: [isDark ? "#60a5fa" : "#2563eb"],
          labels: ['Progresso'],
          theme: { mode: isDark ? 'dark' : 'light' }
        };

        new ApexCharts(chartEl, options).render();

        // --- UPDATE TEXT OVERLAYS ---

        // 1. Percentage
        const pctEl = document.getElementById('gauge-percentage');
        if (pctEl) pctEl.textContent = Math.round(gaugePct) + '%';

        // 2. Trend vs previous period
        const trendVariation = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);
        const isPositive = trendVariation >= 0;

        const trendEl = document.getElementById('gauge-trend');
        const trendTextEl = document.getElementById('gauge-trend-text');
        const trendIconEl = document.getElementById('gauge-trend-icon');

        if (trendEl && trendTextEl && trendIconEl) {
          const trendClass = isPositive ? 'text-success' : 'text-danger';
          const trendBg = isPositive ? (isDark ? 'rgba(34,197,94,0.15)' : '#f0fdf4') : (isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2');
          const trendIcon = isPositive ? 'trending-up' : 'trending-down';

          trendEl.className = `text-xs font-bold flex items-center gap-1 mt-2 px-2 py-1 rounded-full ${trendClass}`;
          trendEl.style.background = trendBg;
          trendTextEl.textContent = (isPositive ? '+' : '') + Math.abs(trendVariation).toFixed(1) + '% vs mês anterior';

          // Update icon
          trendIconEl.setAttribute('data-lucide', trendIcon);
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // 3. Current / Target values
        const currentEl = document.getElementById('gauge-current');
        const targetEl = document.getElementById('gauge-target');
        if (currentEl) currentEl.textContent = formatCurrencyCompact(currentRevenue);
        if (targetEl) targetEl.textContent = formatCurrencyCompact(targetRevenue);

        // 4. Missing amount
        const missingEl = document.getElementById('gauge-missing');
        if (missingEl) {
          if (missing > 0) {
            missingEl.textContent = 'Faltam ' + formatCurrencyCompact(missing);
          } else {
            missingEl.textContent = 'Meta atingida! 🎉';
          }
        }

        // 5. Status badge
        const statusEl = document.getElementById('gauge-status');
        const statusTextEl = document.getElementById('gauge-status-text');
        const statusIconEl = document.getElementById('gauge-status-icon');

        if (statusEl && statusTextEl && statusIconEl) {
          let statusVariant, statusIcon, statusText;

          if (gaugePct >= 100) {
            statusVariant = 'success';
            statusIcon = 'check-circle-2';
            statusText = 'Meta alcançada!';
          } else if (gaugePct >= 90) {
            statusVariant = 'success';
            statusIcon = 'trending-up';
            statusText = Math.round(gaugePct) + '% da meta';
          } else if (gaugePct >= 70) {
            statusVariant = 'warning';
            statusIcon = 'alert-triangle';
            statusText = Math.round(gaugePct) + '% da meta';
          } else {
            statusVariant = 'danger';
            statusIcon = 'alert-circle';
            statusText = Math.round(gaugePct) + '% da meta';
          }

          statusEl.className = `gauge-status gauge-status--${statusVariant}`;
          statusTextEl.textContent = statusText;
          statusIconEl.setAttribute('data-lucide', statusIcon);
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }

      // Helper function for compact currency formatting
      function formatCurrencyCompact(val) {
        if (val >= 1000000) return 'R$ ' + (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return 'R$ ' + (val / 1000).toFixed(0) + 'k';
        return formatCurrency(val);
      }

      function renderRevenue(chartData) {
        const chartEl = document.querySelector("#revenue-chart");
        if(!chartEl) return;
        // Evita acumular SVGs e mantém handlers consistentes
        try {
          if (revenueChart) {
            revenueChart.destroy();
            revenueChart = null;
          }
        } catch (e) {
          revenueChart = null;
        }
        chartEl.innerHTML = ""; 
        
        const isDark = state.theme === 'dark';
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const labelColor = isDark ? '#94a3b8' : '#64748b';

        // Usa a altura real do container (evita “vazio” quando o CSS aumenta a altura)
        const chartHeight = chartEl.clientHeight && chartEl.clientHeight > 0 ? chartEl.clientHeight : 320;

        // Copiar arrays localmente para podermos “pad” quando o range é muito curto (ex.: hoje / semana na segunda)
        // ApexCharts frequentemente não desenha line/area quando há apenas 1 ponto.
        let categories = chartData ? [...(chartData.categories || [])] : ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        let rawDates = chartData ? (chartData.rawDates ? [...chartData.rawDates] : null) : null;
        const isYearly = chartData ? chartData.isYearly : false;

        let seriesDataLocal = chartData ? [...(chartData.seriesData || [])] : [0, 0, 0, 0];
        let seriesMetaLocal = chartData ? [...(chartData.seriesMeta || [])] : [0, 0, 0, 0];

        // Garantir mínimo de 2 pontos
        if (categories.length === 1 && seriesDataLocal.length === 1 && seriesMetaLocal.length === 1) {
          const onlyCat = categories[0];
          categories.push(''); // não poluir labels
          seriesDataLocal.push(seriesDataLocal[0]);
          seriesMetaLocal.push(seriesMetaLocal[0]);
          if (rawDates && rawDates.length === 1) {
            try {
              const d0 = new Date(rawDates[0]);
              if (!Number.isNaN(d0.getTime())) {
                d0.setDate(d0.getDate() + 1);
                rawDates.push(d0.toISOString().split('T')[0]);
              } else {
                rawDates.push(rawDates[0]);
              }
            } catch (e) {
              rawDates.push(rawDates[0]);
            }
          }
        }
        const isDaily = !!(rawDates && !isYearly);
        const firstWednesdayIndex = isDaily && rawDates
          ? rawDates.findIndex(d => new Date(d).getDay() === 3) // quarta-feira
          : null;

        let displayCategories = categories;
        if (isDaily && rawDates && firstWednesdayIndex !== null && firstWednesdayIndex !== -1) {
          displayCategories = categories.map((c, idx) => ((idx - firstWednesdayIndex) % 7 === 0 ? c : ''));
        }

        // Incluir ambas séries, mas Meta pode iniciar oculta/visível conforme regra/ação do usuário
        const series = [
          { name: "Realizado", data: seriesDataLocal },
          { name: "Meta", data: seriesMetaLocal }
        ];

        // Se não há faturamento no período (Realizado todo zero), mostrar Meta automaticamente
        // para evitar a sensação de “gráfico quebrado/vazio” em filtros curtos (Hoje/Semana).
        try {
          const realizedVals = Array.isArray(seriesDataLocal) ? seriesDataLocal : [];
          const realizedMax = realizedVals
            .map(v => (typeof v === 'number' ? v : parseFloat(String(v))))
            .filter(v => Number.isFinite(v))
            .reduce((m, v) => Math.max(m, v), 0);
          if (!Number.isFinite(realizedMax) || realizedMax <= 0) {
            revenueMetaVisible = true;
          }
        } catch (e) {}

        const computeRevenueYRange = (includeMeta) => {
          let yMin = undefined;
          let yMax = undefined;
          try {
            const valsReal = (Array.isArray(seriesDataLocal) ? seriesDataLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const valsMeta = (includeMeta && Array.isArray(seriesMetaLocal) ? seriesMetaLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const vals = [...valsReal, ...valsMeta];
            if (vals.length > 0) {
              const minVal = Math.min(...vals);
              const maxVal = Math.max(...vals);
              if (Number.isFinite(minVal) && Number.isFinite(maxVal) && maxVal > 0) {
                const stepPow = Math.max(0, Math.floor(Math.log10(maxVal)) - 1);
                const step = Math.pow(10, stepPow);
                yMin = Math.max(0, Math.floor((minVal * 0.98) / step) * step);
                yMax = Math.ceil((maxVal * 1.02) / step) * step;
                if (yMax <= yMin) yMax = yMin + step;
              }
            }
          } catch (e) {}
          return { yMin, yMax };
        };

        const revenueYAxisLabelsFormatter = (value) => {
          const n = (typeof value === 'number') ? value : parseFloat(String(value));
          if (!Number.isFinite(n)) return '';
          if (n >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1).replace('.', ',') + 'M';
          if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(0) + 'k';
          return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
        };

        const buildRevenueYAxis = (includeMeta) => {
          const r = computeRevenueYRange(includeMeta);
          return {
            min: r.yMin,
            max: r.yMax,
            decimalsInFloat: 0,
            forceNiceScale: true,
            labels: {
              style: { fontSize: '11px', colors: labelColor },
              formatter: revenueYAxisLabelsFormatter
            }
          };
        };

        const applyRevenueYAxis = (chartContext, includeMeta) => {
          try {
            chartContext.updateOptions({ yaxis: buildRevenueYAxis(includeMeta) }, false, true);
          } catch (e) {}
        };

        // Por padrão, otimiza escala olhando só Realizado; se Meta estiver visível, inclui Meta no range.
        const initialRange = computeRevenueYRange(!!revenueMetaVisible);
        let yMin = initialRange.yMin;
        let yMax = initialRange.yMax;

        revenueChart = new ApexCharts(chartEl, {
          series: series,
          chart: {
            type: 'area',
            height: chartHeight,
            fontFamily: 'inherit',
            toolbar: { show: false },
            zoom: { enabled: false },
            background: 'transparent',
            events: {
              mounted: function(chartContext) {
                // Respeitar escolha do usuário (Meta começa oculta por padrão)
                if (!revenueMetaVisible) {
                chartContext.hideSeries('Meta');
                }
              },
              legendClick: function(chartContext, seriesIndex) {
                try {
                  const name = chartContext?.w?.globals?.seriesNames?.[seriesIndex];
                  if (name === 'Meta') {
                    // Toggle acontece depois do handler; aplicamos range no próximo tick
                    setTimeout(() => {
                      try {
                        const names = chartContext.w.globals.seriesNames || [];
                        const metaIdx = names.indexOf('Meta');
                        const collapsed = chartContext.w.globals.collapsedSeriesIndices || [];
                        const metaHidden = metaIdx >= 0 ? collapsed.includes(metaIdx) : true;
                        revenueMetaVisible = !metaHidden;
                        applyRevenueYAxis(chartContext, revenueMetaVisible);
                        syncRevenuePills();
                      } catch (e) {}
                    }, 0);
                  }
                } catch (e) {}
                return undefined;
              }
            }
          },
          colors: ['#3b82f6', '#10b981'], 
          stroke: { curve: 'smooth', width: 2 },
          fill: {
            type: 'gradient',
            gradient: {
              shadeIntensity: 1,
              opacityFrom: 0.4,
              opacityTo: 0.05,
              stops: [0, 100]
            }
          },
          dataLabels: { enabled: false }, 
          xaxis: { 
            categories: displayCategories, 
            labels: { 
                style: { fontSize: '11px', colors: labelColor },
                hideOverlappingLabels: true,
                offsetY: -2
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
            tooltip: { enabled: false }
          },
          yaxis: {
            min: yMin,
            max: yMax,
            decimalsInFloat: 0,
            forceNiceScale: true,
            labels: {
                style: { fontSize: '11px', colors: labelColor },
                formatter: revenueYAxisLabelsFormatter
            }
          },
          tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: {
                formatter: function (val) {
                    const n = (typeof val === 'number') ? val : parseFloat(String(val));
                    if (!Number.isFinite(n)) return '--';
                    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
                }
            }
          },
          grid: { 
            borderColor: gridColor,
            strokeDashArray: 4,
            padding: { top: 0, right: 18, bottom: -6, left: 8 } 
          }, 
          legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -20,
            fontSize: '12px',
            fontFamily: 'inherit',
            fontWeight: 500,
            labels: { colors: labelColor },
            itemMargin: { horizontal: 10, vertical: 0 },
            onItemClick: {
              toggleDataSeries: true
            },
            markers: {
              onClick: undefined
            }
          },
          theme: { mode: isDark ? 'dark' : 'light' }
        });

        // Renderizar chart (Meta será escondida automaticamente pelo evento 'mounted')
        revenueChart.render();

        // --- Pills (Atual / Anterior / Meta) ---
        // Realizado/Meta: Meta alterna a série no chart.
        function syncRevenuePills() {
          const elMeta = document.getElementById('rev-pill-meta');
          if (!elMeta) return;
          elMeta.style.cursor = 'pointer';
          elMeta.style.opacity = revenueMetaVisible ? '1' : '0.72';
          elMeta.style.filter = revenueMetaVisible ? 'none' : 'grayscale(0.15)';
        }

        const bindOnce = (id, fn) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.dataset && el.dataset.bound === '1') return;
          if (el.dataset) el.dataset.bound = '1';
          el.style.cursor = 'pointer';
          el.addEventListener('click', fn);
        };

        bindOnce('rev-pill-meta', () => {
          if (!revenueChart) return;
          try {
            revenueChart.toggleSeries('Meta');
            // Recalcular range conforme visibilidade
            const names = revenueChart.w.globals.seriesNames || [];
            const metaIdx = names.indexOf('Meta');
            const collapsed = revenueChart.w.globals.collapsedSeriesIndices || [];
            const metaHidden = metaIdx >= 0 ? collapsed.includes(metaIdx) : true;
            revenueMetaVisible = !metaHidden;
            applyRevenueYAxis(revenueChart, revenueMetaVisible);
            syncRevenuePills();
          } catch (e) {}
        });

        // Realizado é a série principal (sem toggle necessário)
        bindOnce('rev-pill-realizado', () => {});

        syncRevenuePills();
      }

      function renderConversion() {
        const el = document.querySelector("#conversion-chart");
        if (!el) return;

        // Evita bug ao trocar filtros/tema: sem destruir, o Apex acumula SVG/canvas e quebra layout.
        try {
          if (conversionChart) {
            conversionChart.destroy();
            conversionChart = null;
          }
        } catch (e) {
          conversionChart = null;
        }
        el.innerHTML = "";

        const isDark = state.theme === 'dark';
        const labelColor = isDark ? '#f8fafc' : '#0f172a';

        // Usar dados dinâmicos do state, com fallback para [0, 0, 0]
        const data = (state.conversionRates && state.conversionRates.length === 3)
          ? state.conversionRates
          : [0, 0, 0];

        const chartHeight = el.clientHeight && el.clientHeight > 0 ? el.clientHeight : 220;
        const dataLabelColor = 'rgba(255,255,255,0.82)'; // “cinzinha” bem leve sobre as barras coloridas

        conversionChart = new ApexCharts(el, {
          series: [{ data: data }],
          chart: { type: 'bar', height: chartHeight, toolbar: {show:false}, background: 'transparent' },
          plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%', distributed: true } },
          // Lead (azul), Reunião (laranja), Proposta (verde)
          colors: ['#3b82f6', '#f59e0b', '#22c55e'],
          dataLabels: {
            enabled: true,
            formatter: function (val) { return val + "%" },
            offsetX: 0,
            style: {
              colors: [dataLabelColor],
              fontSize: '12px',
              fontWeight: 700
            }
          },
          xaxis: { categories: ['Lead', 'Reunião', 'Proposta'], labels: { show: false } },
          yaxis: { labels: { style: { colors: labelColor, fontSize: '12px' }, maxWidth: 90 } },
          grid: { show: false },
          theme: { mode: isDark ? 'dark' : 'light' }
        });

        conversionChart.render();
      }

      // No framework, o HTML já foi injetado no container antes do init() ser chamado.
      // Mantemos o comportamento, mas não dependemos de DOMContentLoaded.
      init();
    })();
  }

  // Registro no registry do loader
  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};
  window.CDN_WIDGET_REGISTRY[WIDGET_KEY] = window.CDN_WIDGET_REGISTRY[WIDGET_KEY] || {};
  window.CDN_WIDGET_REGISTRY[WIDGET_KEY].init = async function init(root, params) {
    // idempotência por container
    try {
      if (root && root.getAttribute && root.getAttribute("data-wish-board-inited") === "1") return;
      if (root && root.setAttribute) root.setAttribute("data-wish-board-inited", "1");
    } catch (e) {}

    // Permite opcionalmente receber o id do vendedor via params, sem mudar comportamento se não vier.
    try {
      if (params && params.loggedSellerId && !window.BUBBLE_LOGGED_SELLER_ID) {
        window.BUBBLE_LOGGED_SELLER_ID = params.loggedSellerId;
      }
    } catch (e) {}

    // Disponibiliza params (incluindo corte) para o dashboard principal
    try { window.__WISH_BOARD_PARAMS__ = params || {}; } catch (e) {}

    await ensureDeps();
    runDashboardMain();
  };
})();
  
