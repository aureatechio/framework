
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

      // DATA (Estado Global)
      let state = {
        dateFilter: 'month', // today, week, month, year
        selectedSeller: null, // null = todos
        marketingInvestment: 120000,
        channelInvestments: { landing: 5000, whatsapp: 2000, outbound: 0, social: 0 },
        theme: 'light',
        rankingData: [],
        conversionRates: [0, 0, 0], // [taxaLead, taxaProposta, taxaReuniao]
        channelData: [], // { name, leads, revenue, roi, icon, color, active }
        kpis: [
           { t:"Faturamento", v:"R$ --", i:"dollar-sign", bg:"icon-bg-blue", vs1: {v:0, l:"vs mês anterior", up:true}, vs2: {v:0, l:"vs meta", up:true}, vs3: {v:0, l:"vs ano ant", up:true} },
           { t:"Vendas Realizadas", v:"--", i:"shopping-cart", bg:"icon-bg-green", vs1: { v: 12, l: "vs mês anterior", up: true }, vs2: { v: 15, l: "vs méd. pond.", up: true }, vs3: { v: 28, l: "vs 2024", up: true } },
           { t:"Ticket Médio", v:"R$ --", i:"trending-up", bg:"icon-bg-blue", vs1: { v: 5, l: "vs mês anterior", up: true }, vs2: { v: 8, l: "vs méd. pond.", up: true }, vs3: { v: 12, l: "vs 2024", up: true } },
           { t:"Leads Ativos", v:"--", i:"users", bg:"icon-bg-gray", vs1: { v: 3, l: "vs mês anterior", up: false }, vs2: { v: 2, l: "vs méd. pond.", up: true }, vs3: { v: 18, l: "vs 2024", up: true } },
           { t:"Investimento Mkt", v:"R$ --", i:"target", bg:"icon-bg-orange", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } },
           { t:"CAC", v:"R$ --", i:"credit-card", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: false }, vs2: { v: 0, l: "vs méd. pond.", up: false }, vs3: { v: 0, l: "vs 2024", up: false } },
           { t:"ROAS", v:"--", i:"bar-chart-3", bg:"icon-bg-purple", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs 2024", up: true } }
        ]
      };

      // --- REFRESH (debounce + last updated) ---
      const REFRESH_DEBOUNCE_MS = 1000;
      let refreshTimer = null;
      let lastUpdatedAt = null;
      let lastUpdatedSource = null;
      let refreshFlags = { meetings: false, ranking: false, revenue: false };
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
        // Default: Ranking + Reuniões; Receita apenas quando necessário (ex: mudança em leads).
        refreshFlags.meetings = true;
        refreshFlags.ranking = true;
        if (opts.revenue) refreshFlags.revenue = true;

        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
          const doMeetings = refreshFlags.meetings;
          const doRanking = refreshFlags.ranking;
          const doRevenue = refreshFlags.revenue;
          refreshFlags = { meetings: false, ranking: false, revenue: false };
          refreshTimer = null;

          try {
            const tasks = [];
            if (doRevenue) tasks.push(fetchRevenue());
            if (doMeetings) tasks.push(fetchMeetings());
            if (doRanking) tasks.push(fetchRankingData());
            await Promise.all(tasks);
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
        
        const metaBase = TARGET_REVENUE_MONTHLY;
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
        
        let query = sbClient.from('leads').select('valorFechado, dataFechamento').not('valorFechado', 'is', null).gte('dataFechamento', start).lte('dataFechamento', end);
        if (state.selectedSeller) query = query.eq('vendedorResponsavel', state.selectedSeller);
        const { data: dataCurr } = await query;

        if(dataCurr) {
            const chartData = processRevenueData(dataCurr, start, end);
            renderRevenue(chartData); 
        }

        let queryPrev = sbClient.from('leads').select('valorFechado').not('valorFechado', 'is', null).gte('dataFechamento', prevRange.start).lte('dataFechamento', prevRange.end);
        if (state.selectedSeller) queryPrev = queryPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { data: dataPrev } = await queryPrev;

        const currentSales = dataCurr ? dataCurr.length : 0;
        const currentRevenue = dataCurr ? dataCurr.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0) : 0;
        const prevSales = dataPrev ? dataPrev.length : 0;
        const prevRevenue = dataPrev ? dataPrev.reduce((acc, curr) => acc + parseCurrency(curr.valorFechado), 0) : 0;
        const currentTicket = currentSales > 0 ? currentRevenue / currentSales : 0;
        const prevTicket = prevSales > 0 ? prevRevenue / prevSales : 0;

        // Query para contar Leads Ativos do período atual (com vendedor responsável)
        let queryLeads = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null)
          .gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryLeads = queryLeads.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeads } = await queryLeads;

        // Query para contar Leads Ativos do período anterior (para comparação)
        let queryLeadsPrev = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null)
          .gte('created_at', prevRange.start)
          .lte('created_at', prevRange.end);
        if (state.selectedSeller) queryLeadsPrev = queryLeadsPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeadsPrev } = await queryLeadsPrev;

        const investment = state.marketingInvestment;
        const cac = currentSales > 0 ? investment / currentSales : 0;
        const roas = investment > 0 ? currentRevenue / investment : 0;

        const updateKPI = (index, value, prevValue, formatFunc = (v)=>v) => {
            const variation = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0);
            state.kpis[index].v = formatFunc(value);
            state.kpis[index].vs1.v = Math.abs(variation).toFixed(1);
            state.kpis[index].vs1.up = variation >= 0;
        };

        updateKPI(0, currentRevenue, prevRevenue, formatCurrency);
        updateKPI(1, currentSales, prevSales, (v) => v.toString());
        updateKPI(2, currentTicket, prevTicket, formatCurrency);
        updateKPI(3, countLeads || 0, countLeadsPrev || 0, (v) => v.toLocaleString('pt-BR'));
        state.kpis[4].v = formatCurrency(investment);
        state.kpis[5].v = formatCurrency(cac);
        state.kpis[6].v = roas.toFixed(2) + "x";

        renderKPIs();

        // --- UPDATE GAUGE WITH REAL DATA (SEMPRE MENSAL) ---
        // Regra: o Velocímetro do Mês NÃO respeita o filtro de data do cabeçalho;
        // ele sempre calcula Mês Atual vs Meta Mensal e só respeita o filtro de vendedor.
        const targetRevenue = TARGET_REVENUE_MONTHLY; // R$ 2.1M Meta Mensal

        let gaugeCurrentRevenue = currentRevenue;
        let gaugePrevRevenue = prevRevenue;

        if (state.dateFilter !== 'month') {
          const monthRange = getDateRange('month');
          const prevMonthRange = getPreviousDateRange('month');

          let queryGaugeCurr = sbClient
            .from('leads')
            .select('valorFechado')
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', monthRange.start)
            .lte('dataFechamento', monthRange.end);

          let queryGaugePrev = sbClient
            .from('leads')
            .select('valorFechado')
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', prevMonthRange.start)
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
      }

      async function fetchMeetings() {
        if (!sbClient) return;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay(); 
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); 
        startOfWeek.setDate(diff);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6); 

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const getCount = async (filterType) => {
            let query = sbClient.from('agendamento').select('id', { count: 'exact', head: true });
            // Apenas reuniões com status "agendado"
            query = query.eq('statusReuniao', 'agendado');
            if (state.selectedSeller) query = query.eq('vendedor', state.selectedSeller);

            if (filterType === 'today') {
                query = query.eq('data', todayStr);
            } else if (filterType === 'week') {
                query = query.gte('data', startOfWeek.toISOString().split('T')[0]).lte('data', endOfWeek.toISOString().split('T')[0]);
            } else if (filterType === 'month') {
                query = query.gte('data', startOfMonth.toISOString().split('T')[0]).lte('data', endOfMonth.toISOString().split('T')[0]);
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
        let queryNow = sbClient.from('agendamento').select('hora, data').eq('data', todayStr).eq('statusReuniao', 'agendado');
        if (state.selectedSeller) queryNow = queryNow.eq('vendedor', state.selectedSeller);
        const { data: dataNow } = await queryNow;
        if (dataNow) {
            const currentHour = now.getHours();
            countNow = dataNow.filter(r => {
                if(!r.hora) return false;
                const h = parseInt(r.hora.split(':')[0]);
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

        // SLAs are absolute, ignoring date filters
        console.log(`--- Fetching SLAs (Absolute) ---`);
        
        // --- 1. FRT Pré-vendas ---
        let queryFRT = sbClient
            .from('loogsLeads')
            .select('created_at, lead, descrição')
            .ilike('descrição', '%Novo Lead%');

        const { data: logsFRT } = await queryFRT;
        let frtTotalMinutes = 0;
        let frtCount = 0;

        if (logsFRT && logsFRT.length > 0) {
            const logsSaida = logsFRT.filter(l => l.descrição && (l.descrição.includes('Novo Lead →') || l.descrição.includes('Novo Lead ->')));
            
            if (logsSaida.length > 0) {
                const leadIds = [...new Set(logsSaida.map(l => l.lead))];
                let queryLeadsFRT = sbClient.from('leads').select('lead_id, created_at, vendedorResponsavel').in('lead_id', leadIds);
                if (state.selectedSeller) queryLeadsFRT = queryLeadsFRT.eq('vendedorResponsavel', state.selectedSeller);
                
                const { data: leadsFRT } = await queryLeadsFRT;
                
                if (leadsFRT) {
                    const leadsMap = {};
                    leadsFRT.forEach(l => leadsMap[l.lead_id] = l);

                    logsSaida.forEach(log => {
                        const lead = leadsMap[log.lead];
                        if (lead) {
                            const exitTime = new Date(log.created_at);
                            const entryTime = new Date(lead.created_at);
                            const diffMinutes = (exitTime - entryTime) / (1000 * 60);
                            if (diffMinutes > 0 && diffMinutes < 43200) { 
                                frtTotalMinutes += diffMinutes;
                                frtCount++;
                            }
                        }
                    });
                }
            }
        }
        const avgFRT = frtCount > 0 ? Math.round(frtTotalMinutes / frtCount) : 0;
        console.log(`FRT: ${avgFRT}min (${frtCount})`);

        // --- 2. Ciclo de Venda ---
        let queryCiclo = sbClient
            .from('leads')
            .select('created_at, dataFechamento')
            .not('dataFechamento', 'is', null);
            
        if (state.selectedSeller) queryCiclo = queryCiclo.eq('vendedorResponsavel', state.selectedSeller);
        
        const { data: leadsCiclo } = await queryCiclo;
        let cicloTotalDays = 0;
        let cicloCount = 0;
        
        if (leadsCiclo) {
            leadsCiclo.forEach(l => {
                const endT = new Date(l.dataFechamento);
                const startT = new Date(l.created_at);
                const diffDays = (endT - startT) / (1000 * 60 * 60 * 24);
                if (diffDays > 0) {
                    cicloTotalDays += diffDays;
                    cicloCount++;
                }
            });
        }
        const avgCiclo = cicloCount > 0 ? (cicloTotalDays / cicloCount).toFixed(1) : "0.0";
        console.log(`Ciclo: ${avgCiclo}d (${cicloCount})`);

        // --- 3. Tempo Proposta ---
        let queryProp = sbClient
            .from('imagemProposta')
            .select('created_at, id_lead');
            
        const { data: props } = await queryProp;
        let propTotalHours = 0;
        let propCount = 0;

        if (props && props.length > 0) {
            const leadIdsProp = [...new Set(props.map(p => p.id_lead).filter(id => id))];
            let queryLeadsProp = sbClient.from('leads').select('lead_id, created_at, vendedorResponsavel').in('lead_id', leadIdsProp);
            if (state.selectedSeller) queryLeadsProp = queryLeadsProp.eq('vendedorResponsavel', state.selectedSeller);
            
            const { data: leadsProp } = await queryLeadsProp;
            
            if (leadsProp) {
                const leadsMapProp = {};
                leadsProp.forEach(l => leadsMapProp[l.lead_id] = l);

                props.forEach(p => {
                    const lead = leadsMapProp[p.id_lead];
                    if (lead) {
                        const propTime = new Date(p.created_at);
                        const createTime = new Date(lead.created_at);
                        const diffHours = (propTime - createTime) / (1000 * 60 * 60);
                        if (diffHours > 0 && diffHours < 720) {
                            propTotalHours += diffHours;
                            propCount++;
                        }
                    }
                });
            }
        }
        const avgProp = propCount > 0 ? Math.round(propTotalHours / propCount) : 0;
        console.log(`Proposta: ${avgProp}h (${propCount})`);

        // --- 4. Follow-up ---
        let followTotalHours = 0;
        let followCount = 0;

        const calcFollowDiff = (tEndStr, tStartStr) => {
            if (!tEndStr || !tStartStr) return 0;
            const tEnd = new Date(tEndStr);
            const tStart = new Date(tStartStr);
            const diff = (tEnd - tStart) / (1000 * 60 * 60);
            return diff > 0 ? diff : 0;
        };
        
        const fetchFollowUpType = async (colName, colPrevName) => {
            let q = sbClient.from('leads')
                .select(`created_at, ${colName}, ${colPrevName || 'created_at'}, vendedorResponsavel`);
            
            if (state.selectedSeller) q = q.eq('vendedorResponsavel', state.selectedSeller);
            
            const { data } = await q;
            if (data) {
                data.forEach(l => {
                    const tEnd = l[colName];
                    const tStart = colPrevName ? l[colPrevName] : l.created_at;
                    const h = calcFollowDiff(tEnd, tStart);
                    if (h > 0) {
                        followTotalHours += h;
                        followCount++;
                    }
                });
            }
        };

        await Promise.all([
            fetchFollowUpType('follow_up_1_enviado_em', null),
            fetchFollowUpType('follow_up_2_enviado_em', 'follow_up_1_enviado_em'),
            fetchFollowUpType('follow_up_3_enviado_em', 'follow_up_2_enviado_em')
        ]);

        const avgFollow = followCount > 0 ? Math.round(followTotalHours / followCount) : 0;
        console.log(`Follow: ${avgFollow}h (${followCount})`);

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
      }

      async function fetchRankingData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        
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
        let queryMeetings = sbClient.from('agendamento').select('vendedor, score_final').gte('data', start.split('T')[0]).lte('data', end.split('T')[0]);
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
        const { data: proposals } = await sbClient
          .from('imagemProposta')
          .select('id_lead, id_vendedor')
          .gte('created_at', start)
          .lte('created_at', end);
        
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
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', start)
            .lte('dataFechamento', end);
            
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

        // 5. Fetch FRT (First Response Time)
        // Busca logs de "Novo Lead ->" para calcular o tempo de atendimento
        const { data: logsFRT } = await sbClient
            .from('loogsLeads')
            .select('created_at, lead, descrição')
            .ilike('descrição', '%Novo Lead%')
            .gte('created_at', start)
            .lte('created_at', end);

        if (logsFRT && logsFRT.length > 0) {
             const logsSaida = logsFRT.filter(l => l.descrição && (l.descrição.includes('Novo Lead →') || l.descrição.includes('Novo Lead ->')));
             if (logsSaida.length > 0) {
                 const leadIdsFRT = [...new Set(logsSaida.map(l => l.lead))];
                 const { data: leadsFRT } = await sbClient
                    .from('leads')
                    .select('lead_id, created_at, vendedorResponsavel')
                    .in('lead_id', leadIdsFRT);

                 if (leadsFRT) {
                     const leadsMapFRT = {};
                     leadsFRT.forEach(l => leadsMapFRT[l.lead_id] = l);

                     logsSaida.forEach(log => {
                         const lead = leadsMapFRT[log.lead];
                         if (lead && lead.vendedorResponsavel && sellerMap[lead.vendedorResponsavel]) {
                             const exitTime = new Date(log.created_at);
                             const entryTime = new Date(lead.created_at);
                             const diffMinutes = (exitTime - entryTime) / (1000 * 60);
                             
                             if (diffMinutes > 0 && diffMinutes < 43200) { 
                                 sellerMap[lead.vendedorResponsavel].frtSum += diffMinutes;
                                 sellerMap[lead.vendedorResponsavel].frtCount++;
                             }
                         }
                     });
                 }
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
         await Promise.all([
             fetchRevenue(),
             fetchMeetings(),
             fetchSLAs(),
             fetchRankingData(),
             fetchFunnelData(),
             fetchConversionRates(),
             fetchChannelData()
         ]);
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
        renderFunnel();
        renderConversion();
        renderChannels();
        renderPipeline();
        try { renderGauge(); } catch(e) {}
        try { renderRevenue(); } catch(e) {}

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
        c.innerHTML = state.kpis.map(k => {
          const renderComp = (item) => `
            <div class="kpi-comp-item">
              <div class="kpi-comp-val ${item.up ? 'trend-up' : 'trend-down'}">
                <i data-lucide="${item.up ? 'trending-up' : 'trending-down'}" size="10"></i> ${item.v}%
              </div>
              <div class="kpi-comp-label">${item.l}</div>
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
        const visibleRanking = (state.rankingData || []).slice(0, 3);

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
          <div class="rank-card" style="padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 12px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
            <div class="rank-card-header" style="margin-bottom: 12px;">
                <div class="rank-user-info" style="gap: 12px;">
                    <div class="rank-avatar-wrapper" style="width: 40px; height: 40px;">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${r.name}" class="rank-avatar" alt="${r.name}" style="background: #f1f5f9;">
                        <div class="rank-badge rank-${rank <= 3 ? rank : 'other'}" style="width: 16px; height: 16px; font-size: 10px; border: 2px solid #fff; bottom: -2px; right: -2px;">${rank}</div>
                    </div>
                    <div class="rank-details">
                        <div class="rank-name" style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 2px;">${r.name}</div>
                        <div class="rank-role" style="font-size: 11px; color: #64748b; font-weight: 400;">${role}</div>
                    </div>
                </div>
                <div class="rank-score-box">
                    <div class="rank-score-val" style="font-size: 18px; font-weight: 700; color: #10b981; letter-spacing: -0.02em;">${scoreDisplay}</div>
                    ${showTrend ? `
                    <div class="rank-trend" style="color: ${isUp ? '#10b981' : '#ef4444'}; font-size: 10px; font-weight: 600; margin-top: 2px;">
                        <i data-lucide="${isUp ? 'trending-up' : 'trending-down'}" size="12" style="margin-right: 2px;"></i> ${trend}%
                    </div>` : '<div class="rank-trend" style="color:#94a3b8; font-size: 10px;">--</div>'}
                </div>
            </div>
            
            <div class="rank-separator" style="height: 4px; background: #f1f5f9; border-radius: 2px; margin-bottom: 16px;">
                <div class="rank-separator-fill" style="width: ${scoreVal}%; background: #3b82f6; border-radius: 2px;"></div>
            </div>
            
            <div class="rank-metrics" style="display: flex; gap: 8px; margin-bottom: 12px;">
                <div class="rank-metric-pill" style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:#3b82f6; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="file-text" size="14"></i> ${r.proposals}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: #64748b; font-weight: 500;">Propostas</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:#64748b; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="users" size="14"></i> ${r.meetings}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: #64748b; font-weight: 500;">Reuniões</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="rank-metric-val" style="color:#10b981; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="zap" size="14"></i> ${r.sales > 0 ? (r.sales/1000).toFixed(0) : 0}
                    </div>
                    <div class="rank-metric-label" style="font-size: 10px; color: #64748b; font-weight: 500;">Vendas</div>
                </div>
            </div>
            
            <div class="rank-footer" style="display: flex; gap: 16px; font-size: 11px; color: #64748b; padding-left: 4px;">
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="clock" size="12"></i> Ciclo: <span style="font-weight: 600; color: #475569;">${r.avgCycle !== '-' ? Math.round(r.avgCycle)+'d' : '--'}</span>
                </div>
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="timer" size="12" style="color:#3b82f6"></i> FRT: <span style="font-weight: 600; color: #475569;">${r.avgFRT !== '-' ? r.avgFRT+'min' : '--'}</span>
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
                          <span class="funnel-badge">${idx === 0 ? '100%' : `${d.c}%`}</span>
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
        
        // 1. Leads Captados
        let queryCaptados = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) queryCaptados = queryCaptados.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countCaptados } = await queryCaptados;

        // 2. Leads Qualificados (Classificação != 'Frio' OU Nulo)
        // Inclui leads sem classificação definida ainda
        let queryQualif = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .gte('created_at', start).lte('created_at', end)
            .or('classificacao.neq.Frio,classificacao.is.null');
        if (state.selectedSeller) queryQualif = queryQualif.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countQualificados } = await queryQualif;

        // 3. Propostas
        let countPropostas = 0;
        if (state.selectedSeller) {
             const { data: props } = await sbClient.from('imagemProposta').select('id_lead').gte('created_at', start).lte('created_at', end);
             if (props && props.length > 0) {
                 const ids = props.map(p => p.id_lead).filter(i => i);
                 if (ids.length > 0) {
                    const { count } = await sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
                        .in('lead_id', ids)
                        .eq('vendedorResponsavel', state.selectedSeller);
                    countPropostas = count || 0;
                 }
             }
        } else {
             const { count } = await sbClient.from('imagemProposta').select('id_lead', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end);
             countPropostas = count || 0;
        }

        // 4. Reuniões
        let queryReunioes = sbClient.from('agendamento').select('leadId', { count: 'exact', head: true })
            .gte('data', start.split('T')[0]).lte('data', end.split('T')[0]);
        if (state.selectedSeller) queryReunioes = queryReunioes.eq('vendedor', state.selectedSeller);
        const { count: countReunioes } = await queryReunioes;

        // 5. Vendas
        let queryVendas = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', start).lte('dataFechamento', end);
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
            const globalConversion = total > 0 ? Math.round((item.v / total) * 100) : 0;
            return { ...item, c: index === 0 ? 100 : conversion, gc: index === 0 ? 100 : globalConversion };
        });

        renderFunnel(processedFunnel);
      }

      async function fetchConversionRates() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);

        // DENOMINADOR COMUM: Total de leads fechados (vendas)
        let queryLeadsFechados = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('valorFechado', 'is', null)
          .gte('dataFechamento', start)
          .lte('dataFechamento', end);

        if (state.selectedSeller) {
          queryLeadsFechados = queryLeadsFechados.eq('vendedorResponsavel', state.selectedSeller);
        }

        const { count: leadsClosedTotal } = await queryLeadsFechados;

        // TAXA LEAD: Leads fechados COM vendedorResponsavel / Total leads fechados
        let queryLeadsFechadosComVendedor = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('valorFechado', 'is', null)
          .not('vendedorResponsavel', 'is', null)
          .gte('dataFechamento', start)
          .lte('dataFechamento', end);

        if (state.selectedSeller) {
          queryLeadsFechadosComVendedor = queryLeadsFechadosComVendedor.eq('vendedorResponsavel', state.selectedSeller);
        }

        const { count: leadsClosedWithVendor } = await queryLeadsFechadosComVendedor;

        // TAXA PROPOSTA: Leads com reunião agendada / Total leads fechados
        let queryReunioes = sbClient
          .from('agendamento')
          .select('leadId', { count: 'exact', head: true })
          .gte('data', start.split('T')[0])
          .lte('data', end.split('T')[0]);

        if (state.selectedSeller) {
          queryReunioes = queryReunioes.eq('vendedor', state.selectedSeller);
        }

        const { count: countMeetings } = await queryReunioes;

        // TAXA REUNIÃO: Leads que receberam proposta / Total leads fechados
        let countProposals = 0;

        if (state.selectedSeller) {
          // Buscar propostas no período
          const { data: props } = await sbClient
            .from('imagemProposta')
            .select('id_lead')
            .gte('created_at', start)
            .lte('created_at', end);

          if (props && props.length > 0) {
            const leadIds = [...new Set(props.map(p => p.id_lead).filter(id => id))];

            if (leadIds.length > 0) {
              // Filtrar por vendedor via leads
              const { count } = await sbClient
                .from('leads')
                .select('lead_id', { count: 'exact', head: true })
                .in('lead_id', leadIds)
                .eq('vendedorResponsavel', state.selectedSeller);

              countProposals = count || 0;
            }
          }
        } else {
          // Sem filtro de vendedor, apenas contar propostas
          const { count } = await sbClient
            .from('imagemProposta')
            .select('id_lead', { count: 'exact', head: true })
            .gte('created_at', start)
            .lte('created_at', end);

          countProposals = count || 0;
        }

        // CALCULAR TAXAS
        const taxaLead = leadsClosedTotal > 0
          ? parseFloat(((leadsClosedWithVendor / leadsClosedTotal) * 100).toFixed(1))
          : 0;

        const taxaProposta = leadsClosedTotal > 0
          ? parseFloat(((countMeetings / leadsClosedTotal) * 100).toFixed(1))
          : 0;

        const taxaReuniao = leadsClosedTotal > 0
          ? parseFloat(((countProposals / leadsClosedTotal) * 100).toFixed(1))
          : 0;

        // Armazenar no estado
        state.conversionRates = [taxaLead, taxaProposta, taxaReuniao];

        console.log('Conversion Rates Calculated:', {
          leadsClosedTotal,
          leadsClosedWithVendor,
          countMeetings,
          countProposals,
          taxaLead,
          taxaProposta,
          taxaReuniao
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
            .eq('leadLandingPage', true)
            .gte('created_at', start).lte('created_at', end);
            
        let queryWPP = sbClient.from('leads').select('lead_id', { count: 'exact', head: true })
            .eq('leadLandingPage', false) // Simplificação conforme análise
            .gte('created_at', start).lte('created_at', end);

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
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', start).lte('dataFechamento', end);

        let queryRevWPP = sbClient.from('leads').select('valorFechado')
            .eq('leadLandingPage', false)
            .not('valorFechado', 'is', null)
            .gte('dataFechamento', start).lte('dataFechamento', end);

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

        // Mock (até termos dados reais por vendedor/etapa)
        const sellers = [
          'Ana', 'Lucas', 'Matheus', 'Felipe', 'Pedro', 'Fernanda', 'Carolina', 'Marina',
          'Thiago', 'Rodrigo', 'Carlos', 'Camila', 'Patrícia', 'Beatriz', 'Amanda', 'Mariana',
          'Rafael', 'Diego'
        ];
        const stages = [
          { key: 'atendimento', label: 'Atendimento', tone: 'blue' },
          { key: 'reuniao', label: 'Reunião', tone: 'amber' },
          { key: 'fechamento', label: 'Fechamento', tone: 'green' }
        ];

        const rows = sellers.map((name, idx) => {
          // Eficiência (mock): diminui conforme índice só para visual
          const eff = Math.max(8, Math.round(55 - idx * 2.4));
          // Tempos (mock)
          const t1 = 15 + (idx % 6) * 2;
          const t2 = 20 + (idx % 5) * 5;
          const t3 = 25 + (idx % 4) * 5;
          return { name, eff, times: { atendimento: t1, reuniao: t2, fechamento: t3 } };
        }).sort((a, b) => b.eff - a.eff);

        const colCount = rows.length + 1; // +1 para coluna de labels
        c.innerHTML = `
          <div class="pipeline-diagram-header">
            <div class="pipeline-hint">${rows.length} executivos • arraste para ver mais →</div>
            <div class="pipeline-sort-pill">Ranking por Eficiência</div>
          </div>
          <div class="pipeline-grid" style="grid-template-columns: 160px repeat(${rows.length}, 112px);">
            <div class="pipeline-stage-label pipeline-stage-label--header"></div>
            ${rows.map((r, idx) => `
              <div class="pipeline-seller-header">
                <div class="pipeline-avatar-wrap">
                  <img class="pipeline-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.name)}" alt="${r.name}">
                  <div class="pipeline-rank-badge">#${idx + 1}</div>
                </div>
                <div class="pipeline-seller-name">${r.name}</div>
                <div class="pipeline-seller-eff"><strong>${r.eff}%</strong> eficiência</div>
              </div>
            `).join('')}

            ${stages.map((s, stageIdx) => `
              <div class="pipeline-stage-label">${s.label}</div>
              ${rows.map((r) => {
                const min = r.times[s.key];
                const firstClass = stageIdx === 0 ? 'pipeline-cell--first' : '';
                const lastClass = stageIdx === (stages.length - 1) ? 'pipeline-cell--last' : '';
                return `
                  <div class="pipeline-cell ${firstClass} ${lastClass}">
                    <div class="pipeline-dot" style="background:${s.tone === 'blue' ? 'var(--col-primary)' : (s.tone === 'amber' ? 'var(--col-warning)' : 'var(--col-success)')}"></div>
                    <div class="pipeline-pill pipeline-pill--${s.tone}">${min}min</div>
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
        chartEl.innerHTML = ""; 
        
        const isDark = state.theme === 'dark';
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const labelColor = isDark ? '#94a3b8' : '#64748b';

        const categories = chartData ? chartData.categories : ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        const rawDates = chartData ? chartData.rawDates : null;
        const isYearly = chartData ? chartData.isYearly : false;
        const isDaily = !!(rawDates && !isYearly);
        const firstWednesdayIndex = isDaily && rawDates
          ? rawDates.findIndex(d => new Date(d).getDay() === 3) // quarta-feira
          : null;

        let displayCategories = categories;
        if (isDaily && rawDates && firstWednesdayIndex !== null && firstWednesdayIndex !== -1) {
          displayCategories = categories.map((c, idx) => ((idx - firstWednesdayIndex) % 7 === 0 ? c : ''));
        }

        // Incluir ambas séries, mas Meta será escondida após render (usuário pode clicar para mostrar)
        const series = chartData
            ? [
                { name: "Realizado", data: chartData.seriesData },
                { name: "Meta", data: chartData.seriesMeta }
              ]
            : [
                { name: "Realizado", data: [0, 0, 0, 0] },
                { name: "Meta", data: [0, 0, 0, 0] }
              ];

        const chart = new ApexCharts(chartEl, {
          series: series,
          chart: {
            type: 'area',
            height: 280,
            fontFamily: 'inherit',
            toolbar: { show: false },
            zoom: { enabled: false },
            background: 'transparent',
            events: {
              mounted: function(chartContext) {
                // Esconde Meta imediatamente após montar o chart
                chartContext.hideSeries('Meta');
              },
              updated: function(chartContext) {
                // Garante que Meta permaneça oculta após updates (primeira vez apenas)
                if (!chartContext._metaInitiallyHidden) {
                  chartContext.hideSeries('Meta');
                  chartContext._metaInitiallyHidden = true;
                }
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
                hideOverlappingLabels: true
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
            tooltip: { enabled: false }
          },
          yaxis: {
            labels: {
                style: { fontSize: '11px', colors: labelColor },
                formatter: (value) => {
                    if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1) + 'M';
                    if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                    return value;
                }
            }
          },
          tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: {
                formatter: function (val) {
                    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                }
            }
          },
          grid: { 
            borderColor: gridColor,
            strokeDashArray: 4,
            padding: { top: 0, right: 20, bottom: 0, left: 10 } 
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
        chart.render();
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

        conversionChart = new ApexCharts(el, {
          series: [{ data: data }],
          chart: { type: 'bar', height: 250, toolbar: {show:false}, background: 'transparent' },
          plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '50%', distributed: true } },
          colors: ['#3b82f6', '#22c55e', '#f59e0b'],
          dataLabels: { enabled: true, formatter: function (val) { return val + "%" }, offsetX: 0, style: { colors: ['#fff'] } },
          xaxis: { categories: ['Lead', 'Proposta', 'Reunião'], labels: { show: false } },
          yaxis: { labels: { style: { colors: labelColor, fontSize: '12px' } } },
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

    await ensureDeps();
    runDashboardMain();
  };
})();
  
