/**
 * ============================================================================
 * WIDGET: wish-board (Dashboard Aceleraí)
 * ============================================================================
 * 
 * DOCUMENTAÇÃO OBRIGATÓRIA PARA IAs:
 * ----------------------------------
 * - docs/AGENTS_GUIDE.md      → Guia de Multi-Agentes (10 agentes especializados)
 * - PROJECT_DOC.md            → Contexto geral do widget
 * - CHANGELOG.md              → Histórico de versões
 * 
 * DOCS DE REGRAS ESPECÍFICAS:
 * ---------------------------
 * - docs/frt_logica.md                    → FRT (hardcut, etapa base)
 * - docs/tempo_proposta_filtro.md         → Tempo Proposta (SLA 6h)
 * - docs/followup_horas_uteis.md          → Follow-up (SLA 24h)
 * - docs/horario_util_dinamico_params.md  → Horário útil dinâmico
 * - docs/confirmacoes_metricas_*.md       → Validação de valores
 * 
 * DEPLOY:
 * -------
 * - PULL antes de editar: python deploy.py pull wish-board dashboard
 * - DEPLOY nova versão:   python deploy.py vXXX wish-board dashboard
 * 
 * ============================================================================
 */

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
      // Observação: o gráfico "Evolução do Faturamento" permanece sendo do MÊS ATUAL (mês inteiro),
      // com Meta por steps + Realizado, e adicionalmente uma série do mesmo mês no ano passado.

      // --- CONTEXTO DE DATA (rótulos do UI) ---
      const getCurrentYear = () => {
        try { return new Date().getFullYear(); } catch (e) { return 2026; }
      };
      const getPrevYear = () => getCurrentYear() - 1;
      const isLeapYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0));
      const getMonthYearLabelPtBr = (d = null) => {
        try {
          const dt = d instanceof Date ? d : new Date();
          const month = dt.toLocaleDateString('pt-BR', { month: 'long' });
          const monthCap = month ? (month.charAt(0).toUpperCase() + month.slice(1)) : '';
          return `${monthCap} ${dt.getFullYear()}`;
        } catch (e) {
          return '';
        }
      };

      // --- CALENDÁRIO: dias úteis + feriados nacionais (BR) ---
      // Regra solicitada:
      // - Segunda a Sexta
      // - Horário útil: 09:00 até 19:00 (local)
      // - Excluir Sábado/Domingo
      // - Excluir feriados nacionais do Brasil (fixos + móveis)
      const __holidaysBrCacheByYear = {};

      const ymdFromParts = (y, m, d) => `${y}-${__pad2(m)}-${__pad2(d)}`;

      // Algoritmo de Páscoa (Meeus/Jones/Butcher) - calendário Gregoriano
      function getEasterSundayDate(year) {
        const y = Number(year) || new Date().getFullYear();
        const a = y % 19;
        const b = Math.floor(y / 100);
        const c = y % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Março, 4=Abril
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day, 12, 0, 0, 0); // meio-dia local (evita DST)
      }

      function addDaysLocal(date, days) {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + (Number(days) || 0));
        return d;
      }

      function getBrazilNationalHolidaysSet(year) {
        const y = Number(year) || new Date().getFullYear();
        if (__holidaysBrCacheByYear[y]) return __holidaysBrCacheByYear[y];

        // Fixos (nacionais)
        const fixed = [
          ymdFromParts(y, 1, 1),   // Confraternização Universal
          ymdFromParts(y, 4, 21),  // Tiradentes
          ymdFromParts(y, 5, 1),   // Dia do Trabalho
          ymdFromParts(y, 9, 7),   // Independência do Brasil
          ymdFromParts(y, 10, 12), // Nossa Senhora Aparecida
          ymdFromParts(y, 11, 2),  // Finados
          ymdFromParts(y, 11, 15), // Proclamação da República
          ymdFromParts(y, 12, 25), // Natal
        ];

        // Móveis (derivados da Páscoa) — comuns no Brasil
        const easter = getEasterSundayDate(y);
        const carnavalSeg = addDaysLocal(easter, -48);
        const carnavalTer = addDaysLocal(easter, -47);
        const sextaSanta = addDaysLocal(easter, -2);
        const corpusChristi = addDaysLocal(easter, 60);

        const movable = [
          formatYmdLocal(carnavalSeg),
          formatYmdLocal(carnavalTer),
          formatYmdLocal(sextaSanta),
          formatYmdLocal(corpusChristi),
        ].filter(Boolean);

        const set = new Set([...fixed, ...movable]);
        __holidaysBrCacheByYear[y] = set;
        return set;
      }

      function isBusinessDayBr(date) {
        try {
          if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
          const dow = date.getDay(); // 0=Dom, 6=Sáb
          if (dow === 0 || dow === 6) return false;
          const y = date.getFullYear();
          const ymd = formatYmdLocal(date);
          if (!ymd) return false;
          const holidays = getBrazilNationalHolidaysSet(y);
          return !holidays.has(ymd);
        } catch (e) {
          return false;
        }
      }

      function businessMinutesBetweenBr(start, end, opts = {}) {
        try {
          const s = (start instanceof Date) ? start : new Date(start);
          const e = (end instanceof Date) ? end : new Date(end);
          if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
          if (e <= s) return 0;

          const startHour = Number.isFinite(opts.startHour) ? opts.startHour : 9;
          const endHour = Number.isFinite(opts.endHour) ? opts.endHour : 19;
          if (!(endHour > startHour)) return 0;

          let totalMin = 0;
          let cursor = new Date(s.getTime());

          while (cursor < e) {
            const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
            const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
            const segEnd = (e < nextDay) ? e : nextDay;

            if (isBusinessDayBr(cursor)) {
              const workStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), startHour, 0, 0, 0);
              const workEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), endHour, 0, 0, 0);

              const a = cursor > workStart ? cursor : workStart;
              const b = segEnd < workEnd ? segEnd : workEnd;
              if (b > a) totalMin += (b.getTime() - a.getTime()) / 60000;
            }

            // avança para o próximo dia
            cursor = segEnd;
            if (cursor.getTime() === dayStart.getTime()) {
              // proteção (não deveria acontecer)
              cursor = nextDay;
            }
          }

          return Math.max(0, totalMin);
        } catch (e) {
          return 0;
        }
      }

      // --- PARAMS (Bubble -> widget) ---
      // Padrão: receber via `params` no Header do Bubble (loader chama init(root, params)).
      // Fallback: objeto global setado pelo wrapper do widget.
      const WISH_BOARD_PARAMS = (typeof window !== 'undefined' && window.__WISH_BOARD_PARAMS__) ? window.__WISH_BOARD_PARAMS__ : {};

      // --- BUSINESS HOURS (padrão B: SP seg–sex 09–19, sem feriados) ---
      // Nota: São Paulo está em UTC-3 (sem DST). Para não depender de Intl/timezone, usamos offset fixo.
      const __SP_OFFSET_MIN = -180; // UTC-3
      const __SP_OFFSET_MS = __SP_OFFSET_MIN * 60 * 1000;

      // --- HORÁRIO ÚTIL (dinâmico via params) ---
      // params.businessHours = { start: ISO_UTC, end: ISO_UTC, exclude_weekends?: boolean }
      const __DEFAULT_BUSINESS_HOURS_CFG = { mode: 'sp', startMin: 9 * 60, endMin: 19 * 60, excludeWeekends: true };

      function __parseBusinessHoursCfg(params) {
        try {
          const raw = params && params.businessHours ? params.businessHours : null;
          const startIso = raw && raw.start ? String(raw.start) : '';
          const endIso = raw && raw.end ? String(raw.end) : '';
          if (!startIso || !endIso) return __DEFAULT_BUSINESS_HOURS_CFG;

          const excludeWeekends = (() => {
            try {
              if (!raw || raw.exclude_weekends === undefined || raw.exclude_weekends === null) return true;
              const v = raw.exclude_weekends;
              if (typeof v === 'boolean') return v;
              const s = String(v).trim().toLowerCase();
              if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
              if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
              return !!v;
            } catch (e) {
              return true;
            }
          })();

          const startMs = Date.parse(startIso);
          const endMs = Date.parse(endIso);
          if (!(Number.isFinite(startMs) && Number.isFinite(endMs))) return __DEFAULT_BUSINESS_HOURS_CFG;

          const ds = new Date(startMs);
          const de = new Date(endMs);
          const startMin = (ds.getUTCHours() * 60) + ds.getUTCMinutes();
          const endMin = (de.getUTCHours() * 60) + de.getUTCMinutes();
          if (!(startMin >= 0 && startMin < 1440 && endMin > 0 && endMin <= 1440 && endMin > startMin)) {
            return __DEFAULT_BUSINESS_HOURS_CFG;
          }
          return { mode: 'utc', startMin, endMin, excludeWeekends };
        } catch (e) {
          return __DEFAULT_BUSINESS_HOURS_CFG;
        }
      }

      const __BUSINESS_HOURS_CFG = __parseBusinessHoursCfg(WISH_BOARD_PARAMS);

      function __businessMinutesBetweenWeekdaysMs(startMsUtc, endMsUtc, cfg) {
        const startMs = Number(startMsUtc);
        const endMs = Number(endMsUtc);
        if (!(Number.isFinite(startMs) && Number.isFinite(endMs))) return 0;
        if (!(endMs > startMs)) return 0;

        const conf = cfg || __DEFAULT_BUSINESS_HOURS_CFG;
        const mode = conf && conf.mode ? String(conf.mode) : 'sp';
        const startMin = (conf && Number.isFinite(conf.startMin)) ? Number(conf.startMin) : (9 * 60);
        const endMin = (conf && Number.isFinite(conf.endMin)) ? Number(conf.endMin) : (19 * 60);
        const excludeWeekends = (conf && typeof conf.excludeWeekends === 'boolean') ? conf.excludeWeekends : true;
        if (!(startMin >= 0 && startMin < 1440 && endMin > 0 && endMin <= 1440 && endMin > startMin)) return 0;

        const offsetMs = (mode === 'sp') ? __SP_OFFSET_MS : 0;
        const startLocalMs = startMs + offsetMs;
        const endLocalMs = endMs + offsetMs;

        const d0 = new Date(startLocalMs);
        d0.setUTCHours(0, 0, 0, 0);
        let dayStartLocalMs = d0.getTime();

        let totalMin = 0;
        const oneDayMs = 24 * 60 * 60 * 1000;

        while (dayStartLocalMs < endLocalMs) {
          const day = new Date(dayStartLocalMs);
          const dow = day.getUTCDay(); // 0=dom ... 6=sab (na timeline local)

          if (!excludeWeekends || (dow >= 1 && dow <= 5)) {
            const bStart = dayStartLocalMs + (startMin * 60 * 1000);
            const bEnd = dayStartLocalMs + (endMin * 60 * 1000);

            const a = Math.max(bStart, startLocalMs);
            const b = Math.min(bEnd, endLocalMs);
            if (b > a) totalMin += (b - a) / 60000;
          }

          dayStartLocalMs += oneDayMs;
        }

        return totalMin;
      }
      
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

      function getMonthlyTarget() {
        const raw = (WISH_BOARD_PARAMS && WISH_BOARD_PARAMS.monthlyTarget !== undefined)
          ? WISH_BOARD_PARAMS.monthlyTarget
          : null;
        const v = typeof raw === 'number' ? raw : parseFloat(String(raw || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(v) && v > 0 ? v : TARGET_REVENUE_MONTHLY;
      }

      // --- CRM METAS (Supabase) ---
      // Observação: usado APENAS para:
      // 1) meta do Velocímetro do mês
      // 2) meta do gráfico Evolução do Faturamento (meta por ciclo)
      const __crmMetasCache = {
        rpcByKey: {},       // key: `${ano}-${mes}-${refDateYmd}`
        metaGeralByMes: {}, // key: `${mes}`
        ciclosByGrupoId: {} // key: `${grupoId}` -> array
      };

      const __toNumber = (val) => {
        const n = (typeof val === 'number')
          ? val
          : parseFloat(String(val ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      };

      const __pad2 = (n) => String(n).padStart(2, '0');
      const formatYmdLocal = (d) => {
        try {
          if (!d || Number.isNaN(d.getTime())) return null;
          return `${d.getFullYear()}-${__pad2(d.getMonth() + 1)}-${__pad2(d.getDate())}`;
        } catch (e) {
          return null;
        }
      };
      const getTodayYmdLocal = () => {
        const d = new Date();
        return `${d.getFullYear()}-${__pad2(d.getMonth() + 1)}-${__pad2(d.getDate())}`;
      };

      const getCrmMetaContext = () => {
        const d = new Date();
        return {
          mes: d.getMonth() + 1,
          ano: d.getFullYear(),
          refDateYmd: getTodayYmdLocal()
        };
      };

      async function fetchCrmMetasRpc(mes, ano, refDateYmd) {
        if (!sbClient) return null;
        const key = `${ano}-${mes}-${refDateYmd}`;
        if (__crmMetasCache.rpcByKey[key]) return __crmMetasCache.rpcByKey[key];

        try {
          const { data, error } = await sbClient.rpc('crm_get_metas_vendedores', {
            p_mes: mes,
            p_ano: ano,
            p_ref_date: refDateYmd
          });
          if (error) throw error;

          const rows = Array.isArray(data) ? data : [];
          const byVendedorId = {};
          let cicloPercentual = null;

          for (const r of rows) {
            if (r && r.vendedor_id) byVendedorId[String(r.vendedor_id)] = r;
            if (cicloPercentual === null && r && r.ciclo_percentual !== undefined && r.ciclo_percentual !== null) {
              const pct = __toNumber(r.ciclo_percentual);
              if (Number.isFinite(pct) && pct > 0) cicloPercentual = pct;
            }
          }

          const cached = { rows, byVendedorId, cicloPercentual: cicloPercentual ?? 0 };
          __crmMetasCache.rpcByKey[key] = cached;
          return cached;
        } catch (e) {
          return null;
        }
      }

      // Meta geral mensal (Opção A): meta por mês (1–12), independente do ano.
      async function fetchCrmMetaGeralMes(mes) {
        if (!sbClient) return 0;
        const key = String(mes);
        if (__crmMetasCache.metaGeralByMes[key] !== undefined) return __crmMetasCache.metaGeralByMes[key];
        try {
          const m = parseInt(String(mes ?? ''), 10);
          const mOk = Number.isFinite(m) && m >= 1 && m <= 12;
          if (!mOk) {
            __crmMetasCache.metaGeralByMes[key] = 0;
            return 0;
          }

          // Busca por mês e pega o registro mais recente (segurança caso haja duplicatas).
          let q = sbClient
            .from('crm_metas_geral_mes')
            .select('meta_geral, mes_ref, mes')
            .eq('mes', mes);

          // Pega o registro mais recente do mês/ano (se houver mais de 1)
          q = q.order('mes_ref', { ascending: false }).limit(1).maybeSingle();

          const { data, error } = await q;
          if (error) throw error;
          const v = __toNumber(data && data.meta_geral);
          __crmMetasCache.metaGeralByMes[key] = v;
          return v;
        } catch (e) {
          __crmMetasCache.metaGeralByMes[key] = 0;
          return 0;
        }
      }

      async function fetchCiclosByGrupoId(grupoId) {
        if (!sbClient || !grupoId) return null;
        const key = String(grupoId);
        if (__crmMetasCache.ciclosByGrupoId[key]) return __crmMetasCache.ciclosByGrupoId[key];
        try {
          const { data, error } = await sbClient
            .from('crm_metas_grupos')
            .select('ciclos_json')
            .eq('id', grupoId)
            .maybeSingle();
          if (error) throw error;
          const ciclos = (data && data.ciclos_json) ? data.ciclos_json : null;
          const arr = Array.isArray(ciclos) ? ciclos : [];
          __crmMetasCache.ciclosByGrupoId[key] = arr;
          return arr;
        } catch (e) {
          __crmMetasCache.ciclosByGrupoId[key] = [];
          return [];
        }
      }

      async function getCiclosForCurrentContext() {
        // Preferência:
        // - vendedor selecionado: usa grupo_id dele (via RPC)
        // - global: usa o 1º grupo retornado pela RPC (assumimos ciclos padronizados)
        const { mes, ano, refDateYmd } = getCrmMetaContext();
        try {
          const rpc = await fetchCrmMetasRpc(mes, ano, refDateYmd);
          const rows = rpc && Array.isArray(rpc.rows) ? rpc.rows : [];
          let grupoId = null;
          if (state && state.selectedSeller && rpc && rpc.byVendedorId) {
            const row = rpc.byVendedorId[String(state.selectedSeller)] || null;
            grupoId = row && row.grupo_id ? row.grupo_id : null;
          }
          if (!grupoId) {
            const anyRow = rows.find(r => r && r.grupo_id) || null;
            grupoId = anyRow && anyRow.grupo_id ? anyRow.grupo_id : null;
          }
          if (!grupoId) return [];
          return await fetchCiclosByGrupoId(grupoId);
        } catch (e) {
          return [];
        }
      }

      // --- ROTACAO (elegibilidade do vendedor) ---
      // Regra: quando um vendedor selecionado NÃO é elegível à rotação,
      // a Meta Mensal do velocímetro deve aparecer como "--" (tracinho),
      // mas o cálculo interno do percentual continua normal.
      const __sellerRotacaoEligibilityCache = new Map(); // sellerId -> boolean (true=elegível)

      async function fetchSellerRotacaoEligibility(sellerId) {
        const id = sellerId ? String(sellerId) : '';
        if (!id || !sbClient) return true;
        if (__sellerRotacaoEligibilityCache.has(id)) return __sellerRotacaoEligibilityCache.get(id);
        try {
          const { data, error } = await sbClient
            .from('vendedores')
            .select('id, elegivel_rotacao')
            .eq('id', id)
            .maybeSingle();
          if (error) {
            // Best-effort: se falhar (RLS/coluna/etc), assume elegível para não quebrar UI.
            __sellerRotacaoEligibilityCache.set(id, true);
            return true;
          }
          const val = (data && data.elegivel_rotacao !== undefined && data.elegivel_rotacao !== null)
            ? !!data.elegivel_rotacao
            : true;
          __sellerRotacaoEligibilityCache.set(id, val);
          return val;
        } catch (e) {
          __sellerRotacaoEligibilityCache.set(id, true);
          return true;
        }
      }

      async function getGaugeTargetRevenueFromCrm() {
        // Meta do Velocímetro do Mês:
        // - vendedor selecionado: meta_mensal_final (RPC)
        // - sem vendedor: meta_geral do mês (tabela)
        const { mes, ano, refDateYmd } = getCrmMetaContext();
        try {
          if (state && state.selectedSeller) {
            // Define se o alvo do velocímetro deve ser ocultado (vendedor não elegível à rotação)
            try {
              const elegivel = await fetchSellerRotacaoEligibility(state.selectedSeller);
              state.gaugeHideTarget = (elegivel === false);
            } catch (e) {
              state.gaugeHideTarget = false;
            }

            const rpc = await fetchCrmMetasRpc(mes, ano, refDateYmd);
            const row = rpc && rpc.byVendedorId ? rpc.byVendedorId[String(state.selectedSeller)] : null;
            const metaVendedor = __toNumber(row && row.meta_mensal_final);
            if (metaVendedor > 0) return metaVendedor;
          }
          // Sem vendedor selecionado: sempre mostrar a meta
          try { state.gaugeHideTarget = false; } catch (e) {}
          const metaGeral = await fetchCrmMetaGeralMes(mes);
          if (metaGeral > 0) return metaGeral;
        } catch (e) {}
        // Fallback para não quebrar UI caso RPC/tabela não estejam disponíveis
        return getMonthlyTarget();
      }

      async function getRevenueCycleTargetFromCrm() {
        // Meta da Evolução do Faturamento (ciclo):
        // - vendedor selecionado: meta_ciclo (RPC) + datas do ciclo (RPC)
        // - sem vendedor: meta_geral do mês * ciclo_percentual (RPC) + datas do ciclo (RPC)
        //
        // Retorno:
        // { metaTotal, cicloDiaInicio, cicloDiaFim } | null
        const { mes, ano, refDateYmd } = getCrmMetaContext();
        const daysInMonth = new Date(ano, mes, 0).getDate();
        try {
          const rpc = await fetchCrmMetasRpc(mes, ano, refDateYmd);
          const rows = rpc && Array.isArray(rpc.rows) ? rpc.rows : [];

          // 1) Descobrir o ciclo (dia_inicio/dia_fim) para desenhar a linha corretamente
          let cicloRow = null;
          if (state && state.selectedSeller && rpc && rpc.byVendedorId) {
            cicloRow = rpc.byVendedorId[String(state.selectedSeller)] || null;
          }
          if (!cicloRow) {
            cicloRow = rows.find(r => r && (r.ciclo_dia_inicio !== null && r.ciclo_dia_inicio !== undefined)) || null;
          }

          const cicloDiaInicio = Math.max(1, parseInt(String(cicloRow && cicloRow.ciclo_dia_inicio != null ? cicloRow.ciclo_dia_inicio : 1), 10) || 1);
          const cicloDiaFimRaw = (cicloRow && cicloRow.ciclo_dia_fim != null) ? cicloRow.ciclo_dia_fim : null;
          const cicloDiaFim = Math.max(cicloDiaInicio, (cicloDiaFimRaw === null ? daysInMonth : (parseInt(String(cicloDiaFimRaw), 10) || daysInMonth)));

          // 2) Meta do ciclo (valor)
          let metaTotal = 0;
          if (state && state.selectedSeller) {
            const row = rpc && rpc.byVendedorId ? rpc.byVendedorId[String(state.selectedSeller)] : null;
            metaTotal = __toNumber(row && row.meta_ciclo);
          } else {
            const metaGeral = await fetchCrmMetaGeralMes(mes);
            const pct = rpc ? __toNumber(rpc.cicloPercentual) : 0;
            metaTotal = metaGeral > 0 && pct > 0 ? (metaGeral * pct) : 0;
          }

          if (!(metaTotal > 0)) return null;
          return { metaTotal, cicloDiaInicio, cicloDiaFim };
        } catch (e) {
          return null;
        }
      }

      // --- ETAPAS (cache) ---
      const __etapaIdCache = {};
      const __etapaNameByIdCache = new Map(); // etapaId -> name|null

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

      async function fetchEtapaNamesByIds(ids) {
        try {
          if (!sbClient) return new Map();
          const unique = Array.from(new Set((ids || []).map((v) => (v ? String(v) : '')).filter(Boolean)));
          if (!unique.length) return new Map();

          const missing = unique.filter((id) => !__etapaNameByIdCache.has(id));
          if (missing.length) {
            for (const chunk of chunkArray(missing, 500)) {
              const { data, error } = await sbClient
                .from('etapa')
                .select('id, name')
                .in('id', chunk);
              if (error) {
                // best-effort: não quebra o modal se falhar
                continue;
              }
              const found = new Set();
              (data || []).forEach((r) => {
                const id = r && r.id ? String(r.id) : '';
                if (!id) return;
                found.add(id);
                __etapaNameByIdCache.set(id, (r && r.name) ? String(r.name) : null);
              });
              chunk.forEach((id) => {
                if (!found.has(id)) __etapaNameByIdCache.set(id, null);
              });
            }
          }

          const out = new Map();
          unique.forEach((id) => out.set(id, __etapaNameByIdCache.has(id) ? __etapaNameByIdCache.get(id) : null));
          return out;
        } catch (e) {
          return new Map();
        }
      }

      const chunkArray = (arr, size = 500) => {
        const out = [];
        for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // --- FRT (igual ao dashboard_tela + docs/frt_logica.md) ---
      // Etapa-base (Oportunidade) — hardcoded para evitar drift por renome
      const ETAPA_OPORTUNIDADE_ID = 'a6709949-9857-4b25-965d-b4bf8270426b';

      // FRT: hardcut (sobrepõe filtros/cutoff): 15/01/2026 12:00 America/Sao_Paulo = 15:00 UTC
      const FRT_HARDCUT_UTC_ISO = '2026-01-15T15:00:00.000Z';

      function getFrtHardcutWindow() {
        const endIso = new Date().toISOString();
        return { startIso: FRT_HARDCUT_UTC_ISO, endIso };
      }

      let __frtEventsCache = { key: '', promise: null };

      const __FRT_BASE_ALIASES = ['novo lead', 'oportunidade'];

      function __normStageName(s) {
        try {
          return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/\s+/g, ' ')
            .trim();
        } catch (e) {
          return '';
        }
      }

      function __parseTransitionFromDescricao(descRaw) {
        const desc = __normStageName(descRaw);
        if (!desc) return null;
        const m = desc.match(/([a-z0-9 _-]{2,})\s*(?:->|→)\s*([a-z0-9 _-]{2,})/i);
        if (!m) return null;
        const from = __normStageName(m[1]);
        const to = __normStageName(m[2]);
        if (!from || !to) return null;
        return { from, to };
      }

      function __isBaseStageName(nameNorm) {
        const n = __normStageName(nameNorm);
        return __FRT_BASE_ALIASES.includes(n);
      }

      function __detectEnterExitFromLog(log) {
        if (!log) return { isEnter: false, isExit: false };
        const etapaAnterior = log.etapa_anterior || null;
        const etapaPosterior = log.etapa_posterior || null;
        const isEnter = !!(etapaPosterior && String(etapaPosterior) === ETAPA_OPORTUNIDADE_ID);
        const isExit = !!(etapaAnterior && String(etapaAnterior) === ETAPA_OPORTUNIDADE_ID);
        if (isEnter || isExit) return { isEnter, isExit };

        // fallback: parse da descrição quando etapas vêm nulas
        const trans = __parseTransitionFromDescricao(log['descrição']);
        if (!trans) return { isEnter: false, isExit: false };
        return {
          isEnter: __isBaseStageName(trans.to),
          isExit: __isBaseStageName(trans.from),
        };
      }

      async function computeFRTEventsHardcut() {
        const sel = state && state.selectedSeller ? String(state.selectedSeller) : '';
        const { startIso, endIso } = getFrtHardcutWindow();
        const cacheKey = `${sel}|${startIso}|${endIso.slice(0, 13)}`; // muda no máximo por hora
        if (__frtEventsCache && __frtEventsCache.key === cacheKey && __frtEventsCache.promise) {
          return __frtEventsCache.promise;
        }

        const p = (async () => {
          if (!sbClient) return [];
          if (!startIso) return [];

          try {
            if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) return [];
          } catch (e) {}

          let q = sbClient
            .from('loogsLeads')
            .select('created_at, lead, vendedor_id, etapa_anterior, etapa_posterior, descrição')
            .not('lead', 'is', null)
            .order('created_at', { ascending: true });

          // Importante: FRT hardcut sobrepõe cutoff e período — não usamos applyCutoffTimestamp aqui.
          q = q.gte('created_at', startIso);
          if (endIso) q = q.lte('created_at', endIso);

          try {
            q = q.or(
              [
                `etapa_anterior.eq.${ETAPA_OPORTUNIDADE_ID}`,
                `etapa_posterior.eq.${ETAPA_OPORTUNIDADE_ID}`,
                `descrição.ilike.%novo%lead%`,
                `descrição.ilike.%oportunidade%`,
              ].join(',')
            );
          } catch (e) {}

          const { data: logs, error } = await q;
          if (error) {
            console.warn('[FRT] erro loogsLeads:', error);
            return [];
          }

          const leadState = {}; // leadId -> { enteredAtIso, enteredVendorId, done }
          const events = []; // { leadId, diffMinutes, sellerCandidate }

          (logs || []).forEach((log) => {
            const leadId = log && log.lead ? String(log.lead) : '';
            const createdAt = log && log.created_at ? String(log.created_at) : '';
            if (!leadId || !createdAt) return;

            const st = leadState[leadId] || (leadState[leadId] = { enteredAtIso: null, enteredVendorId: null, done: false });
            if (st.done) return;

            const { isEnter, isExit } = __detectEnterExitFromLog(log);

            if (isEnter) {
              if (!st.enteredAtIso) {
                st.enteredAtIso = createdAt;
                st.enteredVendorId = log && log.vendedor_id ? String(log.vendedor_id) : null;
              }
              return;
            }

            if (isExit) {
              if (!st.enteredAtIso) return;
              const exitIso = createdAt;
              const entryIso = st.enteredAtIso;

              const exitMs = Date.parse(exitIso);
              const entryMs = Date.parse(entryIso);
              if (!(Number.isFinite(exitMs) && Number.isFinite(entryMs))) return;
              // diffMinutes = minutos úteis (horário configurável via params.businessHours)
              const diffMin = __businessMinutesBetweenWeekdaysMs(entryMs, exitMs, __BUSINESS_HOURS_CFG);
              if (!(diffMin > 0) || !(diffMin < 43200)) return;

              const sellerCandidate =
                (log && log.vendedor_id ? String(log.vendedor_id) : null) ||
                (st.enteredVendorId ? String(st.enteredVendorId) : null) ||
                null;

              events.push({ leadId, diffMinutes: diffMin, sellerCandidate });
              st.done = true; // 1 FRT por lead no período hardcut
            }
          });

          // Fallback final: leads.vendedorResponsavel quando não resolvemos vendedor via logs
          const missingVendorLeadIds = events.filter((e) => !e.sellerCandidate).map((e) => e.leadId);
          const vendorByLead = {};
          if (missingVendorLeadIds.length) {
            for (const chunk of chunkArray(missingVendorLeadIds, 500)) {
              const { data: rows, error: leadErr } = await sbClient
                .from('leads')
                .select('lead_id, vendedorResponsavel')
                .in('lead_id', chunk);
              if (leadErr) {
                console.warn('[FRT] erro leads(vendedorResponsavel):', leadErr);
                continue;
              }
              (rows || []).forEach((r) => {
                if (r && r.lead_id && r.vendedorResponsavel) vendorByLead[String(r.lead_id)] = String(r.vendedorResponsavel);
              });
            }
          }

          const out = events
            .map((e) => ({
              leadId: e.leadId,
              diffMinutes: e.diffMinutes,
              sellerId: e.sellerCandidate || vendorByLead[e.leadId] || null,
            }))
            .filter((e) => e && e.diffMinutes > 0);

          if (sel) return out.filter((e) => e.sellerId === sel);
          return out;
        })();

        __frtEventsCache = { key: cacheKey, promise: p };
        return p;
      }

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

      // Variante para casos em que precisamos aplicar um cutoff diferente (ex.: comparativo ano passado)
      function applyCutoffTimestampAt(query, column, cutoffIso) {
        if (!cutoffIso || !query) return query;
        try { return query.gt(column, cutoffIso); } catch (e) { return query; }
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
      const KPI_IDS = {
        FATURAMENTO: 'faturamento',
        CONVERSAO: 'conversao',
        CONV_OPORTUNIDADES: 'conv_oportunidades',
        OPORTUNIDADES: 'oportunidades',
        CAPTADOS: 'captados',
        PROPOSTAS: 'propostas',
        REUNIOES: 'reunioes',
        QTD_VENDAS: 'qtd_vendas',
        TICKET: 'ticket',
        INVEST: 'invest',
        CAC: 'cac',
        ROAS: 'roas',
      };

      let state = {
        dateFilter: 'month', // today, week, month, year
        customRange: null, // { start: ISO, end: ISO, startYmd:'YYYY-MM-DD', endYmd:'YYYY-MM-DD' }
        selectedSeller: null, // null = todos
        selectedAgencyId: '', // '' = Todos | UUID = filtra leads.agencia
        // Revenue Chart (Evolução do Faturamento) — controles independentes do header
        revenueChartMode: 'month', // month | semester | year (calendário)
        revenueChartZoomEnabled: false,
        revenueChartShowTodayMarker: true,
        revenueChartSeriesVisible: { Realizado: true, AnoPassado: true, Meta: true, Projecao: true },
        revenueChartZoom: null, // { min:number, max:number } em ms (xaxis)
        revenueChartData: null, // cache do último chartData renderizado
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
        metasData: {
          global: {
            propostas: { current: 0, target: 0, pct: 0 },
            reunioes: { current: 0, target: 0, pct: 0 }
          },
          sellers: [] // [{ id, name, avatarUrl, role, propostasPct, reunioesPct, avgPct }]
        },
        kpis: [
           // Linha 1 (6): Faturamento • Conversão Global • Conversão Oportunidades • Oportunidades • Propostas • Reuniões
           { id: KPI_IDS.FATURAMENTO, t:"Faturamento", v:"R$ --", i:"dollar-sign", bg:"icon-bg-blue", vs1: {v:0, l:"vs mês anterior", up:true}, vs2: {v:0, l:"vs meta", up:true}, vs3: {v:0, l:"vs ano ant", up:true} },
           { id: KPI_IDS.CONVERSAO, t:"Conversão Global", v:"--", i:"refresh-cw", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.CONV_OPORTUNIDADES, t:"Conversão Oportunidades", v:"--", i:"percent", bg:"icon-bg-cyan", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.OPORTUNIDADES, t:"Oportunidades", v:"--", i:"users", bg:"icon-bg-gray", vs1: { v: 0, l: "vs mês anterior", up: false }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.PROPOSTAS, t:"Propostas", v:"--", i:"file-text", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.REUNIOES, t:"Reuniões", v:"--", i:"video", bg:"icon-bg-gray", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },

           // Linha 2 (6): Leads Captados • Qtd Vendas • Ticket Médio • Investimento • CAC • ROAS
           { id: KPI_IDS.CAPTADOS, t:"Leads Captados", v:"--", i:"user-plus", bg:"icon-bg-blue", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.QTD_VENDAS, t:"Qtd Vendas", v:"--", i:"shopping-cart", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.TICKET, t:"Ticket Médio", v:"R$ --", i:"trending-up", bg:"icon-bg-blue", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.INVEST, t:"Investimento Mkt", v:"R$ --", i:"target", bg:"icon-bg-orange", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } },
           { id: KPI_IDS.CAC, t:"CAC", v:"R$ --", i:"credit-card", bg:"icon-bg-green", vs1: { v: 0, l: "vs mês anterior", up: false }, vs2: { v: 0, l: "vs méd. pond.", up: false }, vs3: { v: 0, l: "vs ano ant", up: false } },
           { id: KPI_IDS.ROAS, t:"ROAS", v:"--", i:"bar-chart-3", bg:"icon-bg-purple", vs1: { v: 0, l: "vs mês anterior", up: true }, vs2: { v: 0, l: "vs méd. pond.", up: true }, vs3: { v: 0, l: "vs ano ant", up: true } }
        ]
      };

      const AGENCY_IDS = {
        MGS: 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9',
        ACELERAI: '75f34688-c054-4519-a445-e350fe146870',
      };

      // Mapeamento: Agência → IDs de Campanhas Meta (Facebook)
      // Usado para segregar investimento/faturamento por agência nos filtros do header
      const META_CAMPAIGN_IDS_BY_AGENCY = {
        [AGENCY_IDS.MGS]: {
          landingPage: [
            '120239567789980521',
            '120239566956730521',
            '120239566738920521',
            '120239495678940521'
          ],
          whatsapp: []
        },
        [AGENCY_IDS.ACELERAI]: {
          landingPage: [
            '120239333024630521',  // AUREA
            '120239569742460521',
            '120239483099680521',
            '120239415394150521',
            '120239371495570521',
            '120239369908330521',
            '120239333616050521',
            '120239329104170521',
            '120239128942210521',
            '120235017912440521',
            '120224643258900521',
            '23861526663930520'
          ],
          whatsapp: []
        }
      };

      /**
       * Retorna IDs de campanhas Meta filtradas pela agência selecionada.
       * @param {string} channelType - 'landingPage' ou 'whatsapp'
       * @returns {string[]} Array de campaign IDs
       */
      function getMetaCampaignIdsByAgency(channelType) {
        const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';

        // FILTRO DE AGÊNCIA:
        // - state.selectedAgencyId vazio ('') = TODOS os IDs (todas agências)
        // - state.selectedAgencyId = MGS UUID = apenas IDs da MGS
        // - state.selectedAgencyId = Aceleraí UUID = apenas IDs da Aceleraí
        // Isso garante que investimento, CAC e ROAS sejam calculados
        // apenas com gastos da agência selecionada.

        // Sem filtro = retorna TODOS os IDs (todas agências)
        if (!agencyId) {
          const allIds = [];
          Object.values(META_CAMPAIGN_IDS_BY_AGENCY).forEach(agencyData => {
            const ids = agencyData[channelType] || [];
            allIds.push(...ids);
          });
          return allIds;
        }

        // Com filtro = retorna apenas IDs da agência selecionada
        const agencyData = META_CAMPAIGN_IDS_BY_AGENCY[agencyId];
        if (!agencyData) return [];
        return agencyData[channelType] || [];
      }

      function getSelectedAgencyLabel() {
        const id = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
        if (!id) return '';
        if (id === AGENCY_IDS.MGS) return 'MGS';
        if (id === AGENCY_IDS.ACELERAI) return 'Aceleraí';
        return 'Agência';
      }

      function updateDashboardSubtitle() {
        try {
          const el = document.getElementById('dashboard-period-subtitle');
          if (!el) return;
          let t = `Vendas e Marketing • ${getMonthYearLabelPtBr(new Date())}`;
          const agencyLabel = getSelectedAgencyLabel();
          if (agencyLabel) t += ` • Agência: ${agencyLabel}`;
          el.textContent = t;
        } catch (e) {}
      }

      function updateStaticUILabels() {
        // 1) Subtítulo
        try { updateDashboardSubtitle(); } catch (e) {}

        // 2) Rótulos "vs ano anterior" -> "vs <anoAnterior>"
        try {
          const prevYear = getPrevYear();
          (state.kpis || []).forEach((k) => {
            if (k && k.vs3 && k.vs3.l && String(k.vs3.l).toLowerCase().includes('ano ant')) {
              k.vs3.l = `vs ${prevYear}`;
            }
          });
        } catch (e) {}
      }

      // --- BASELINE ANO ANTERIOR (mocado) - RELAÇÕES ---
      // Fonte: números consolidados (mocado). Usamos apenas para comparação "vs ano anterior" (badges vs3),
      // escalando por dias do range do header.
      // Observação: aqui "Leads Captados" (KPI) mapeia para "Leads Recebidos" do consolidado.
      // "Leads Ativos" (KPI) não existe no consolidado; mapeamos para "Oportunidades" como proxy (qualificados).
      const MOCK_2024_TOTALS = (() => {
        const year = getPrevYear();

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

      // Baseline ano anterior equivalente ao range do header (pro-rata por dias)
      function getBaseline2024ForRange(rangeDays) {
        const y = MOCK_2024_TOTALS.year || getPrevYear();
        const daysInYear = isLeapYear(y) ? 366 : 365;
        const factor = Math.max(0, Math.min(1, (Number(rangeDays) || 0) / daysInYear));

        const investimento = MOCK_2024_TOTALS.investimento * factor;
        const faturamento = MOCK_2024_TOTALS.faturamento * factor;
        const captados = MOCK_2024_TOTALS.leadsRecebidos * factor;
        const reunioes = MOCK_2024_TOTALS.reunioes * factor;
        const vendas = MOCK_2024_TOTALS.vendas * factor;
        const propostas = MOCK_2024_TOTALS.propostas * factor;
        const leadsAtivosProxy = MOCK_2024_TOTALS.oportunidades * factor;

        const convPct = captados > 0 ? (vendas / captados) * 100 : 0;
        const convOportunidadesPct = leadsAtivosProxy > 0 ? (vendas / leadsAtivosProxy) * 100 : 0;
        const ticket = vendas > 0 ? (faturamento / vendas) : 0;
        const cac = vendas > 0 ? (investimento / vendas) : 0;
        const roas = investimento > 0 ? (faturamento / investimento) : 0;

        return {
          year: MOCK_2024_TOTALS.year,
          factor,
          investimento,
          faturamento,
          captados,
          reunioes,
          vendas,
          propostas,
          leadsAtivosProxy,
          convPct,
          convOportunidadesPct,
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
          const reunioes = MOCK_2025_YTD_TOTALS.reunioes * factor;
          const vendas = MOCK_2025_YTD_TOTALS.vendas * factor;
          const propostas = MOCK_2025_YTD_TOTALS.propostas * factor;
          const leadsAtivosProxy = MOCK_2025_YTD_TOTALS.oportunidades * factor;

          const convPct = captados > 0 ? (vendas / captados) * 100 : 0;
          const convOportunidadesPct = leadsAtivosProxy > 0 ? (vendas / leadsAtivosProxy) * 100 : 0;
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
            reunioes,
            vendas,
            propostas,
            leadsAtivosProxy,
            convPct,
            convOportunidadesPct,
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
            reunioes: 0,
            vendas: 0,
            propostas: 0,
            leadsAtivosProxy: 0,
            convPct: 0,
            convOportunidadesPct: 0,
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
      let refreshFlags = { meetings: false, ranking: false, revenue: false, pipeline: false, metas: false };
      let liveBadgeInterval = null;

      // --- CHART AUTO-RESIZE (Bubble reflow guard) ---
      // No Bubble, pequenas mudanças de layout (ex.: texto do badge) podem causar reflow e
      // deixar gráficos (ApexCharts) desalinhados/cortados. Fazemos um resize debounced.
      let __chartsResizeTimer = null;
      function scheduleChartsResize(reason) {
        try {
          if (__chartsResizeTimer) clearTimeout(__chartsResizeTimer);
        } catch (e) {}

        __chartsResizeTimer = setTimeout(() => {
          try {
            // esperar o layout “assentar”
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => {
                try {
                  window.dispatchEvent(new Event('resize'));
                } catch (e) {}
              });
            } else {
              try {
                window.dispatchEvent(new Event('resize'));
              } catch (e) {}
            }
          } catch (e) {}
        }, 180);
      }

      function setLastUpdated(source) {
        lastUpdatedAt = new Date();
        lastUpdatedSource = source || 'manual';
        updateLiveBadge();
      }

      function updateLiveBadge() {
        const el = document.getElementById('badge-live-text');
        if (!el) return;
        const prev = el.textContent || '';

        let next = '';
        if (!lastUpdatedAt) {
          next = 'Aguardando atualização...';
        } else {
          const diffMs = Date.now() - lastUpdatedAt.getTime();
          const diffSec = Math.floor(diffMs / 1000);
          if (diffSec < 60) next = 'Atualizado agora';
          else {
            const diffMin = Math.floor(diffSec / 60);
            next = `Atualizado há ${diffMin}min`;
          }
        }

        el.textContent = next;
        if (next !== prev) scheduleChartsResize('liveBadge');
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

        // Se NÃO vier id_vendedor (ex.: tela sem autenticação), abrir em "Todos os executivos"
        // (pedido: não selecionar nenhum vendedor por padrão).
        if (!sellerId) {
          console.warn('[Access] id_vendedor não informado; abrindo visão global (Todos os executivos).', { received: raw });

          access.sellerId = null;
          access.sellerName = null;
          // Tratar como líder para permitir visão global + seleção de executivos
          access.isLeader = true;
          access.ready = true;
          state.selectedSeller = null;

          // Ajuste do seletor de vendedor (UI): listar todos os executivos
          const select = document.getElementById('seller-select');
          const wrapper = select ? select.closest('.select-wrapper') : null;
          if (select) {
            select.disabled = false;
            if (wrapper) wrapper.style.display = '';

            try {
              const { data: sellersDb } = await sbClient
                .from('vendedores')
                .select('id, nome')
                .eq('usuarioInterno', false)
                .order('nome');
              const opts = (sellersDb || [])
                .filter(s => s && s.id)
                .map(s => `<option value="${s.id}">${escapeHtmlLite(s.nome || s.id)}</option>`)
                .join('');
              select.innerHTML = `<option value="">Todos os executivos</option>${opts}`;
            } catch (e) {
              select.innerHTML = `<option value="">Todos os executivos</option>`;
            }

            // Default: TODOS
            select.value = '';

            if (!select.dataset.scopeBound) {
              select.dataset.scopeBound = '1';
              select.addEventListener('change', (e) => {
                const val = (e.target && e.target.value) ? String(e.target.value) : '';
                state.selectedSeller = val || null;
                fetchDataWithStamp('seller');
              });
            }
          }

          return true;
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
        // Default: Ranking + Reuniões + Pipeline + Metas; Receita apenas quando necessário (ex: mudança em leads).
        refreshFlags.meetings = true;
        refreshFlags.ranking = true;
        refreshFlags.pipeline = true;
        refreshFlags.metas = true;
        if (opts.revenue) refreshFlags.revenue = true;

        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
          const doMeetings = refreshFlags.meetings;
          const doRanking = refreshFlags.ranking;
          const doRevenue = refreshFlags.revenue;
          const doPipeline = refreshFlags.pipeline;
          const doMetas = refreshFlags.metas;
          refreshFlags = { meetings: false, ranking: false, revenue: false, pipeline: false, metas: false };
          refreshTimer = null;

          try {
            const tasks = [];
            if (doRevenue) tasks.push(fetchRevenue());
            if (doMeetings) tasks.push(fetchMeetings());
            if (doMeetings) tasks.push(fetchMeetingsTab());
            if (doRanking) tasks.push(fetchRankingData());
            if (doPipeline) tasks.push(fetchPipelineData());
            if (doMetas) tasks.push(fetchMetasData());
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

      // Evita múltiplos fetches concorrentes (ex: clique repetido no header / filtro personalizado).
      // Colapsa chamadas enquanto um fetch está em andamento.
      let __fetchInFlight = null;
      let __fetchQueuedReason = null;
      async function fetchDataWithStamp(reason) {
        try {
          if (__fetchInFlight) {
            __fetchQueuedReason = reason || __fetchQueuedReason || 'queued';
            return __fetchInFlight;
          }

          __fetchInFlight = (async () => {
            await fetchData();
            setLastUpdated(reason || 'manual');
          })();

          return await __fetchInFlight;
        } finally {
          __fetchInFlight = null;
          if (__fetchQueuedReason) {
            const r = __fetchQueuedReason;
            __fetchQueuedReason = null;
            // Reexecuta uma vez com o último motivo (sem empilhar recursão infinita)
            try { fetchDataWithStamp(r); } catch (e) {}
          }
        }
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
      const formatNumber = (val) => {
        const n = typeof val === 'number' ? val : parseFloat(String(val || '0').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '0';
      };
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

      // Compras aprovadas (fonte de "faturamento" no dashboard)
      // Regra solicitada: usar a tabela `compras` e filtrar por aprovação.
      // No schema atual, o indicador de aprovação é `vendaaprovada` (boolean).
      // Extra (2026): ignorar compras de teste (`is_test=true`) quando a coluna existir.
      let __comprasIsTestSupported = null; // null = desconhecido, true = existe, false = não existe

      function __isMissingColumnError(err, columnName) {
        const msg = String(err?.message || err?.details || err || '').toLowerCase();
        const col = String(columnName || '').toLowerCase();
        return !!(msg.includes('column') && msg.includes(col) && (msg.includes('does not exist') || msg.includes('unknown')));
      }

      async function ensureComprasIsTestSupport() {
        if (__comprasIsTestSupported !== null) return __comprasIsTestSupported;
        if (!sbClient) { __comprasIsTestSupported = false; return false; }
        try {
          // Probe leve: se a coluna não existir, o PostgREST retorna erro de coluna inexistente.
          const { error } = await sbClient.from('compras').select('is_test').limit(1);
          if (error) {
            if (__isMissingColumnError(error, 'is_test')) {
              __comprasIsTestSupported = false;
              return false;
            }
            // Outros erros (RLS/transiente): manter comportamento atual (não bloquear dashboard).
            __comprasIsTestSupported = true;
            return true;
          }
          __comprasIsTestSupported = true;
          return true;
        } catch (e) {
          __comprasIsTestSupported = true;
          return true;
        }
      }

      const applyNotTestPurchaseFilter = (q) => {
        // "is not true" => inclui NULL e qualquer valor diferente de true
        try { return q.or('is_test.is.null,is_test.neq.true'); } catch (e) { return q; }
      };

      const applyApprovedPurchaseFilter = (q) => {
        // Filtro estrito: apenas vendas marcadas explicitamente como aprovadas.
        try {
          let qq = q.eq('vendaaprovada', true);
          if (__comprasIsTestSupported === true) {
            qq = applyNotTestPurchaseFilter(qq);
          }
          return qq;
        } catch (e) { return q; }
      };

      // --- AGENCY FILTER (leads.agencia) ---
      // Importante: várias métricas partem de tabelas que só têm leadId, sem FK. Para essas, fazemos lookup em `leads`.
      const __leadAgencyCache = new Map(); // lead_id -> agencia(uuid|null)

      function __toLeadId(v) {
        try { return extractUuid(v); } catch (e) { return null; }
      }

      async function fetchLeadAgencyMap(leadIds) {
        const out = new Map();
        if (!sbClient) return out;

        const ids = Array.from(new Set((leadIds || []).map(__toLeadId).filter(Boolean)));
        if (ids.length === 0) return out;

        const missing = [];
        ids.forEach((id) => {
          if (__leadAgencyCache.has(id)) out.set(id, __leadAgencyCache.get(id));
          else missing.push(id);
        });

        const CHUNK = 500;
        for (let i = 0; i < missing.length; i += CHUNK) {
          const chunk = missing.slice(i, i + CHUNK);
          try {
            const { data, error } = await sbClient
              .from('leads')
              .select('lead_id, agencia')
              .in('lead_id', chunk);
            if (error) {
              console.warn('[Agency] erro lookup leads.agencia:', error);
              continue;
            }
            const found = new Set();
            (data || []).forEach((r) => {
              const leadId = r && r.lead_id ? String(r.lead_id) : '';
              if (!leadId) return;
              found.add(leadId);
              const ag = r && r.agencia ? String(r.agencia) : null;
              __leadAgencyCache.set(leadId, ag);
              out.set(leadId, ag);
            });
            // ids não retornados: cacheia null para evitar refetch em loop
            chunk.forEach((leadId) => {
              if (!found.has(leadId)) {
                __leadAgencyCache.set(leadId, null);
                out.set(leadId, null);
              }
            });
          } catch (e) {
            console.warn('[Agency] erro lookup chunk:', e);
          }
        }

        // garante que todo id requerido exista no map
        ids.forEach((id) => {
          if (!out.has(id) && __leadAgencyCache.has(id)) out.set(id, __leadAgencyCache.get(id));
        });
        return out;
      }

      function applyAgencyFilterToLeadQuery(q) {
        if (!q) return q;
        const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
        if (!agencyId) return q;
        try { return q.eq('agencia', agencyId); } catch (e) { return q; }
      }

      async function filterRowsByAgencyViaLeadId(rows, getLeadId) {
        const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
        if (!agencyId) return rows || [];
        const list = Array.isArray(rows) ? rows : [];
        if (list.length === 0) return [];

        const leadIds = list.map((r) => __toLeadId(getLeadId ? getLeadId(r) : null)).filter(Boolean);
        const map = await fetchLeadAgencyMap(leadIds);
        return list.filter((r) => {
          const leadId = __toLeadId(getLeadId ? getLeadId(r) : null);
          if (!leadId) return false; // sem lead => não conseguimos garantir a agência
          const ag = map.get(leadId);
          return !!ag && String(ag) === agencyId;
        });
      }

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

        // Filtro por agência (via leadId -> leads.agencia)
        rows = await filterRowsByAgencyViaLeadId((rows || []), (r) => r && r.leadId);

        const leadIds = Array.from(new Set((rows || []).map(r => r && r.leadId).filter(Boolean)));
        const leadInfoById = {};
        for (const chunk of chunkArray(leadIds, 500)) {
          let q = sbClient
            .from('leads')
            .select('lead_id, nome, empresa, etapaVendedorFunil')
            .in('lead_id', chunk);
          q = applyAgencyFilterToLeadQuery(q);
          const { data: leadsChunk } = await q;
          (leadsChunk || []).forEach(l => {
            if (!l || !l.lead_id) return;
            leadInfoById[l.lead_id] = {
              nome: l.nome || null,
              empresa: l.empresa || null,
              etapaId: l.etapaVendedorFunil ? String(l.etapaVendedorFunil) : null,
            };
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
          const etapaId = leadInfo && leadInfo.etapaId ? String(leadInfo.etapaId) : null;

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
            etapaId,
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
        const avgEl = document.getElementById('meetings-score-avg');
        const total = state.meetingsTab?.total ?? 0;
        if (countEl) countEl.textContent = String(total);

        // Média global do score (respeita filtros atuais pois vem de fetchMeetingsTab)
        try {
          const all = [
            ...(state.meetingsTab?.upcoming || []),
            ...(state.meetingsTab?.past || []),
          ];
          let sum = 0;
          let cnt = 0;
          all.forEach((m) => {
            const s = m && Number.isFinite(m.score) ? Number(m.score) : null;
            if (s === null) return;
            sum += s;
            cnt += 1;
          });
          const avg = cnt > 0 ? (sum / cnt) : null;
          if (avgEl) avgEl.textContent = (avg === null) ? '--' : avg.toFixed(1);
        } catch (e) {
          if (avgEl) avgEl.textContent = '--';
        }

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
        const stageEl = document.getElementById('meeting-modal-stage');
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

        // Etapa atual do lead (pill ao lado do título) — best-effort, não quebra o modal
        try {
          if (overlay) overlay.dataset.meetingId = String(meetingId || '');
          const etapaId = m && m.etapaId ? String(m.etapaId) : '';
          const setStage = (name) => {
            if (!stageEl) return;
            const nm = (name && String(name).trim()) ? String(name).trim() : '';
            if (!nm) {
              stageEl.style.display = 'none';
              stageEl.textContent = '';
              return;
            }
            stageEl.textContent = nm;
            stageEl.style.display = '';
          };
          if (!etapaId) {
            setStage('');
          } else if (__etapaNameByIdCache.has(etapaId)) {
            setStage(__etapaNameByIdCache.get(etapaId));
          } else {
            // placeholder enquanto carrega
            setStage('');
            fetchEtapaNamesByIds([etapaId]).then((map) => {
              try {
                if (overlay && overlay.dataset.meetingId && overlay.dataset.meetingId !== String(meetingId || '')) return;
                const nm = map && map.get ? map.get(etapaId) : null;
                setStage(nm);
              } catch (e) {}
            }).catch(() => {});
          }
        } catch (e) {}

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

        // Subtítulo do topo: manter mês/ano atual (e agência, se houver)
        try { updateDashboardSubtitle(); } catch (e) {}
        
        // Reset manual dos botões do novo header (hardcoded IDs)
        const buttons = ['btn-today', 'btn-week', 'btn-month', 'btn-year', 'btn-semestre', 'btn-custom'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if(btn) {
              if (id === 'btn-custom' && state.customRange && state.customRange.startYmd && state.customRange.endYmd) {
                btn.className = 'control-btn-pill has-range';
                try { setCustomButtonAppliedLabel(); } catch (e) {}
              } else {
                btn.className = 'control-btn-pill';
              }
            }
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

        // Fix (Bubble): ao trocar filtros, força "hard reload" do gráfico de Evolução do Faturamento.
        // Isso evita comportamento cumulativo do ApexCharts (SVG/altura) que pode fazer o card crescer a cada troca.
        try {
          if (revenueChart) {
            try { revenueChart.destroy(); } catch (e) {}
            revenueChart = null;
          }
          const el = document.querySelector("#revenue-chart");
          if (el) el.innerHTML = "";
        } catch (e) {}

        fetchDataWithStamp(`filter:${filter}`);
      };

      window.setAgencyFilter = (agencyId) => {
        const idRaw = (agencyId === null || agencyId === undefined) ? '' : String(agencyId).trim();
        const id = idRaw && extractUuid(idRaw) ? extractUuid(idRaw) : ''; // '' = Todos
        state.selectedAgencyId = id;
        // Sync UI (select legado + pills)
        try {
          const sel = document.getElementById('agency-select');
          if (sel) sel.value = id || '';
        } catch (e) {}
        try { syncAgencySelectorUI(id); } catch (e) {}
        try { updateDashboardSubtitle(); } catch (e) {}

        // Mesma proteção do filtro de data: pode ser acionado várias vezes no Bubble, então evitamos drift do Apex.
        try {
          if (revenueChart) {
            try { revenueChart.destroy(); } catch (e) {}
            revenueChart = null;
          }
          const el = document.querySelector("#revenue-chart");
          if (el) el.innerHTML = "";
        } catch (e) {}

        fetchDataWithStamp(`agency:${id || 'all'}`);
      };

      function syncAgencySelectorUI(selectedId) {
        try {
          const root = document.getElementById('agency-selector');
          if (!root) return;
          const buttons = Array.from(root.querySelectorAll('.agency-segment-btn'));
          const sid = selectedId ? String(selectedId) : '';
          buttons.forEach((btn) => {
            const val = btn && btn.dataset ? (btn.dataset.agency || '') : '';
            const isActive = String(val || '') === sid;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        } catch (e) {}
      }

      // --- FILTRO PERSONALIZADO (popover) ---
      const __customPad2 = (n) => String(n).padStart(2, '0');
      const __ymdToIsoUtcStart = (ymd) => {
        const [y, m, d] = String(ymd || '').split('-').map(v => parseInt(v, 10));
        if (!y || !m || !d) return null;
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
      };
      const __ymdToIsoUtcEnd = (ymd) => {
        const [y, m, d] = String(ymd || '').split('-').map(v => parseInt(v, 10));
        if (!y || !m || !d) return null;
        return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString();
      };
      const __shiftIsoYear = (iso, deltaYears) => {
        try {
          const d = new Date(String(iso || ''));
          if (!d || isNaN(d.getTime())) return null;
          d.setUTCFullYear(d.getUTCFullYear() + (Number(deltaYears) || 0));
          return d.toISOString();
        } catch (e) {
          return null;
        }
      };
      const __shiftRangeByYears = (range, deltaYears) => {
        const s = __shiftIsoYear(range && range.start, deltaYears);
        const e = __shiftIsoYear(range && range.end, deltaYears);
        return { start: s || (range && range.start), end: e || (range && range.end) };
      };

      function __formatYmdToBr(ymd) {
        const [y, m, d] = String(ymd || '').split('-');
        if (!y || !m || !d) return '';
        return `${d}/${m}/${y}`;
      }

      function setCustomButtonAppliedLabel() {
        const btn = document.getElementById('btn-custom');
        if (!btn) return;
        const r = state.customRange;
        if (!r || !r.startYmd || !r.endYmd) {
          btn.textContent = 'Personalizado';
          btn.classList.remove('has-range');
          return;
        }
        // Importante no Bubble: se o texto ficar longo, o header quebra linha (flex-wrap) e o layout "cresce".
        // Mantemos um label compacto e previsível.
        const s = __formatYmdToBr(r.startYmd); // dd/mm/yyyy
        const e = __formatYmdToBr(r.endYmd);
        const sShort = s ? s.slice(0, 5) : ''; // dd/mm
        const eShort = e ? e.slice(0, 5) : '';
        const label = (sShort && eShort) ? `${sShort}–${eShort}` : `${s || ''}${s && e ? '–' : ''}${e || ''}`;
        btn.textContent = `Personalizado • ${label}`;
        btn.classList.add('has-range');
      }

      function getDateFilterLabelPtBr(filter) {
        const f = String(filter || '').trim();
        if (f === 'today') return 'Hoje';
        if (f === 'week') return 'Semana';
        if (f === 'month') return 'Mês';
        if (f === 'semester') return 'Semestre';
        if (f === 'year') return 'Ano';
        if (f === 'custom') return 'Personalizado';
        return 'Período';
      }

      function closeCustomDatePicker() {
        const pop = document.getElementById('custom-date-popover');
        if (pop) {
          pop.style.display = 'none';
          pop.setAttribute('aria-hidden', 'true');
        }
      }

      window.openCustomDatePicker = () => {
        const pop = document.getElementById('custom-date-popover');
        const startEl = document.getElementById('custom-date-start');
        const endEl = document.getElementById('custom-date-end');
        const btn = document.getElementById('btn-custom');
        if (!pop) return;

        const isOpen = pop.style.display !== 'none' && pop.getAttribute('aria-hidden') === 'false';
        if (isOpen) {
          closeCustomDatePicker();
          return;
        }

        try {
          if (state.customRange && state.customRange.startYmd && startEl) startEl.value = state.customRange.startYmd;
          if (state.customRange && state.customRange.endYmd && endEl) endEl.value = state.customRange.endYmd;
        } catch (e) {}

        pop.style.display = 'block';
        pop.setAttribute('aria-hidden', 'false');

        // Posicionar como popover "de verdade" no Bubble (evitar clipping por overflow/containers)
        try {
          if (btn && btn.getBoundingClientRect) {
            // medir tamanho real
            pop.style.visibility = 'hidden';
            const rect = btn.getBoundingClientRect();
            const popW = pop.offsetWidth || 340;
            const popH = pop.offsetHeight || 140;
            const margin = 10;
            let left = rect.right - popW;
            left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
            let top = rect.bottom + 8;
            // se estourar embaixo, tenta abrir pra cima
            if (top + popH > window.innerHeight - margin) {
              top = Math.max(margin, rect.top - popH - 8);
            }
            pop.style.left = `${Math.round(left)}px`;
            pop.style.top = `${Math.round(top)}px`;
            pop.style.visibility = 'visible';
          }
        } catch (e) {}

        try { if (startEl) startEl.focus(); } catch (e) {}
        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
      };

      // Abrir o calendário nativo (quando suportado) ao clicar no ícone
      window.openDatePicker = (inputId) => {
        try {
          const el = document.getElementById(String(inputId || ''));
          if (!el) return;
          if (typeof el.showPicker === 'function') {
            el.showPicker();
          } else {
            // fallback: foco/click abre o date picker em navegadores sem showPicker()
            el.focus();
            el.click();
          }
        } catch (e) {}
      };

      function initCustomDatePickerUI() {
        const pop = document.getElementById('custom-date-popover');
        const btn = document.getElementById('btn-custom');
        const startEl = document.getElementById('custom-date-start');
        const endEl = document.getElementById('custom-date-end');
        const applyBtn = document.getElementById('custom-date-apply');
        const clearBtn = document.getElementById('custom-date-clear');
        if (!pop || !btn || !startEl || !endEl || !applyBtn || !clearBtn) return;
        if (pop.dataset.bound) return;
        pop.dataset.bound = '1';

        // Portal: move popover para o body para evitar ser cortado por containers/overflow do Bubble
        try {
          if (!pop.dataset.portal && document.body && pop.parentNode !== document.body) {
            document.body.appendChild(pop);
            pop.dataset.portal = '1';
          }
        } catch (e) {}

        setCustomButtonAppliedLabel();

        applyBtn.addEventListener('click', () => {
          const sYmdRaw = String(startEl.value || '').trim();
          const eYmdRaw = String(endEl.value || '').trim();
          if (!sYmdRaw || !eYmdRaw) return;

          // Normaliza caso usuário inverta
          const sProbe = new Date(`${sYmdRaw}T12:00:00.000Z`);
          const eProbe = new Date(`${eYmdRaw}T12:00:00.000Z`);
          if (isNaN(sProbe.getTime()) || isNaN(eProbe.getTime())) return;

          let startYmd = sYmdRaw;
          let endYmd = eYmdRaw;
          if (sProbe.getTime() > eProbe.getTime()) {
            startYmd = eYmdRaw;
            endYmd = sYmdRaw;
          }

          const startIso = __ymdToIsoUtcStart(startYmd);
          const endIso = __ymdToIsoUtcEnd(endYmd);
          if (!startIso || !endIso) return;

          state.customRange = { start: startIso, end: endIso, startYmd, endYmd };
          setCustomButtonAppliedLabel();
          closeCustomDatePicker();
          window.setDateFilter('custom');
        });

        clearBtn.addEventListener('click', () => {
          state.customRange = null;
          try { startEl.value = ''; endEl.value = ''; } catch (e) {}
          setCustomButtonAppliedLabel();
          closeCustomDatePicker();
        });

        // fecha ao clicar fora
        document.addEventListener('click', (e) => {
          const target = e && e.target ? e.target : null;
          if (!target) return;
          if (target === btn || btn.contains(target)) return;
          if (target === pop || pop.contains(target)) return;
          closeCustomDatePicker();
        });

        // fecha no ESC
        document.addEventListener('keydown', (e) => {
          if (e && e.key === 'Escape') closeCustomDatePicker();
        });
      }
      
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
          // Bubble às vezes muda layout em idle/troca de tema; garantir resize dos charts
          try { scheduleChartsResize('theme'); } catch (e) {}
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
        if (filter === 'custom' && state.customRange && state.customRange.start && state.customRange.end) {
          return { start: state.customRange.start, end: state.customRange.end };
        }
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

      // Range do MÊS INTEIRO (para o gráfico de evolução mensal):
      // - start: 1º dia 00:00
      // - end: último dia 23:59:59.999
      function getFullMonthRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0,0,0,0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23,59,59,999);
        return { start: start.toISOString(), end: end.toISOString() };
      }

      function getRevenueChartRangeByMode(mode) {
        const m = String(mode || 'month');
        const now = new Date();
        const y = now.getFullYear();
        const monthIdx = now.getMonth(); // 0-11

        if (m === 'year') {
          const start = new Date(y, 0, 1, 0, 0, 0, 0).toISOString();
          const end = new Date(y, 11, 31, 23, 59, 59, 999).toISOString();
          return { start, end };
        }

        if (m === 'semester') {
          const semStartMonth = (monthIdx <= 5) ? 0 : 6; // Jan ou Jul
          const semEndMonth = (monthIdx <= 5) ? 5 : 11; // Jun ou Dez
          const start = new Date(y, semStartMonth, 1, 0, 0, 0, 0).toISOString();
          const end = new Date(y, semEndMonth + 1, 0, 23, 59, 59, 999).toISOString();
          return { start, end };
        }

        // month (default): mês atual inteiro
        return getFullMonthRange();
      }

      // Range específico para Reuniões (agendamento.data):
      // - Incluir FUTURO até o fim do período para todos os filtros (week/month/semester/year).
      // - Isso garante que reuniões agendadas para o futuro apareçam corretamente.
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
        } else if (filter === 'semester') {
          // fim do semestre: último dia do mês atual (6 meses a partir do start)
          const now = new Date();
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
        } else if (filter === 'year') {
          // fim do ano (31/12 23:59)
          end = new Date(start.getFullYear(), 11, 31);
          end.setHours(23, 59, 59, 999);
        }

        return {
          start: start.toISOString(),
          end: end.toISOString(),
          startYmd: toYmd(start),
          endYmd: toYmd(end),
        };
      }

      // Prorrateia uma meta mensal por um range arbitrário.
      // Estratégia: somar frações mês-a-mês, baseado no overlap de dias do range com cada mês:
      // metaPeriodo = metaMensal * Σ(overlapDiasNoMes / diasNoMes)
      function computeProratedTargetForRange(monthlyTarget, startIso, endIso) {
        const mt = Number(monthlyTarget) || 0;
        if (!(mt > 0)) return 0;
        try {
          const s0 = new Date(String(startIso));
          const e0 = new Date(String(endIso));
          if (Number.isNaN(s0.getTime()) || Number.isNaN(e0.getTime())) return mt;

          // Normaliza para datas locais (dia inteiro), para prorratear por dias.
          const s = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate());
          const e = new Date(e0.getFullYear(), e0.getMonth(), e0.getDate());
          if (e.getTime() < s.getTime()) return mt;

          const MS_DAY = 24 * 60 * 60 * 1000;
          const maxDate = (a, b) => (a.getTime() >= b.getTime() ? a : b);
          const minDate = (a, b) => (a.getTime() <= b.getTime() ? a : b);

          const endMonth = new Date(e.getFullYear(), e.getMonth(), 1);
          let cursor = new Date(s.getFullYear(), s.getMonth(), 1);
          let acc = 0;

          while (cursor.getTime() <= endMonth.getTime()) {
            const y = cursor.getFullYear();
            const m = cursor.getMonth();
            const monthStart = new Date(y, m, 1);
            const monthEnd = new Date(y, m + 1, 0); // último dia do mês (00:00 local)
            const daysInMonth = monthEnd.getDate() || 30;

            const os = maxDate(s, monthStart);
            const oe = minDate(e, monthEnd);
            if (oe.getTime() >= os.getTime()) {
              const overlapDays = Math.floor((oe.getTime() - os.getTime()) / MS_DAY) + 1; // inclusivo
              const frac = Math.max(0, Math.min(1, overlapDays / daysInMonth));
              acc += (mt * frac);
            }

            cursor = new Date(y, m + 1, 1);
          }

          return acc > 0 ? acc : mt;
        } catch (e) {
          return mt;
        }
      }

      function getPreviousDateRange(filter) {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);

        if (filter === 'custom' && state.customRange && state.customRange.start && state.customRange.end) {
          try {
            const s = new Date(String(state.customRange.start));
            const e = new Date(String(state.customRange.end));
            if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
              // período anterior: mesma duração imediatamente antes do início do custom
              const rangeDays = getInclusiveRangeDays(state.customRange.start, state.customRange.end);
              const prevEnd = new Date(s.getTime());
              prevEnd.setDate(prevEnd.getDate() - 1);
              prevEnd.setHours(23, 59, 59, 999);
              const prevStart = new Date(prevEnd.getTime());
              prevStart.setDate(prevStart.getDate() - Math.max(0, rangeDays - 1));
              prevStart.setHours(0, 0, 0, 0);
              return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
            }
          } catch (e) {}
        }

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

      function processRevenueData(leads, startDate, endDate, metaTotalOverride) {
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
                // IMPORTANT: usar chave em data LOCAL (evita deslocamento por UTC e quebra de ciclos 1–7, 8–14, etc)
                const dateKey = formatYmdLocal(currentDate);
                const displayDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                
                dataMap[dateKey] = { val: 0, display: displayDate, rawDate: dateKey, order: currentDate.getTime(), dom: currentDate.getDate() };
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // Preencher dados reais
        // Fonte: `compras` (aprovadas) => { data_compra, valor_total }
        if (leads && leads.length > 0) {
          leads.forEach(l => {
            if (!l || !l.data_compra) return;

            let key;
            const raw = String(l.data_compra);
            if (isYearly) {
              key = raw.substring(0, 7); // YYYY-MM
            } else {
              // Converter para data local para casar com o dataMap
              try {
                const dd = new Date(l.data_compra);
                key = formatYmdLocal(dd) || raw.substring(0, 10);
              } catch (e) {
                key = raw.substring(0, 10); // YYYY-MM-DD (fallback)
              }
            }

            if (dataMap[key]) {
              dataMap[key].val += parseCurrency(l.valor_total);
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
        
        // Meta Linear:
        // - padrão: meta mensal (getMonthlyTarget) e, se anual, * 12
        // - override: usado apenas para a evolução do faturamento com meta por ciclo (CRM/Supabase)
        
        const metaBase = getMonthlyTarget();
        let metaTotal = metaBase;

        // Override pode ser:
        // - number: metaTotal (meta linear diária no range)
        // - object: { metaTotal, cicloDiaInicio, cicloDiaFim } (meta por ciclo — fixo)
        // - object: { metaTotal, ciclos, mode: 'monthly_steps' } (meta mensal em steps por ciclos_json)
        let overrideTotal = null;
        let overrideCicloInicio = null;
        let overrideCicloFim = null;
        let overrideCiclos = null;
        let overrideMode = null;
        try {
          if (metaTotalOverride && typeof metaTotalOverride === 'object') {
            overrideTotal = __toNumber(metaTotalOverride.metaTotal);
            overrideCicloInicio = parseInt(String(metaTotalOverride.cicloDiaInicio ?? ''), 10);
            overrideCicloFim = parseInt(String(metaTotalOverride.cicloDiaFim ?? ''), 10);
            overrideCiclos = Array.isArray(metaTotalOverride.ciclos) ? metaTotalOverride.ciclos : null;
            overrideMode = metaTotalOverride.mode ? String(metaTotalOverride.mode) : null;
          } else if (Number.isFinite(metaTotalOverride)) {
            overrideTotal = metaTotalOverride;
          }
        } catch (e) {}

        if (Number.isFinite(overrideTotal) && overrideTotal > 0) {
          metaTotal = overrideTotal;
        } else if (isYearly) {
          metaTotal = metaBase * 12;
        }

        const useMonthlySteps = !isYearly
          && overrideMode === 'monthly_steps'
          && Number.isFinite(overrideTotal) && overrideTotal > 0
          && Array.isArray(overrideCiclos) && overrideCiclos.length > 0;

        const useCycleFixed = !isYearly
          && !useMonthlySteps
          && Number.isFinite(overrideTotal) && overrideTotal > 0
          && Number.isFinite(overrideCicloInicio) && Number.isFinite(overrideCicloFim)
          && overrideCicloFim >= overrideCicloInicio;

        const steps = sortedKeys.length;
        const stepGoal = steps > 0 ? metaTotal / steps : 0;
        let runningGoal = 0;

        sortedKeys.forEach(k => {
            runningTotal += dataMap[k].val;

            let metaPoint = 0;
            if (useMonthlySteps) {
              // Meta mensal em degraus conforme ciclos_json:
              // 1..7 => meta*%c1, 8..14 => meta*(%c1+%c2), ...
              try {
                const day = (dataMap && dataMap[k] && Number.isFinite(dataMap[k].dom)) ? dataMap[k].dom : null;
                if (day === null) {
                  runningGoal += stepGoal;
                  metaPoint = runningGoal;
                } else {
                  const endD = new Date(endDate);
                  const daysInMonthLocal = (endD && !Number.isNaN(endD.getTime()))
                    ? new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getDate()
                    : 31;
                  const ciclosSorted = (overrideCiclos || [])
                    .slice()
                    .sort((a, b) => (__toNumber(a && a.ciclo) - __toNumber(b && b.ciclo)));

                  // Suavização dos "steps": ao invés de salto vertical,
                  // a cada início de ciclo (exceto o 1º) aplicamos uma rampa curta.
                  // Ex.: ciclo começa dia 8 -> dia 8 mantém pct anterior, dia 9 já aplica o novo pct.
                  const SMOOTH_DAYS = 2; // 2 => 1 dia de rampa (di -> di+1). Ajustável.

                  let cumPct = 0;
                  for (const c of ciclosSorted) {
                    if (!c) continue;
                    // Suporta variações de schema: dia_inicio/dia_fim OU diaInicio/diaFim
                    // Fallback (se não vier): inferir por ciclo (1..4) => 1–7, 8–14, 15–21, 22–fim
                    const cicloN = parseInt(String(c.ciclo ?? ''), 10);
                    let diRaw = (c.dia_inicio !== undefined ? c.dia_inicio : (c.diaInicio !== undefined ? c.diaInicio : null));
                    let dfRaw = (c.dia_fim !== undefined ? c.dia_fim : (c.diaFim !== undefined ? c.diaFim : null));

                    let di = parseInt(String(diRaw ?? ''), 10);
                    if (!Number.isFinite(di) || di <= 0) {
                      if (cicloN === 1) di = 1;
                      else if (cicloN === 2) di = 8;
                      else if (cicloN === 3) di = 15;
                      else if (cicloN === 4) di = 22;
                      else di = 1;
                    }
                    di = Math.max(1, di);

                    // dia_fim pode ser null (=> fim do mês)
                    let df = null;
                    if (dfRaw === null || dfRaw === undefined || String(dfRaw).trim() === '') {
                      df = (cicloN === 4) ? daysInMonthLocal : null;
                    } else {
                      const dfParsed = parseInt(String(dfRaw), 10);
                      df = Number.isFinite(dfParsed) ? dfParsed : null;
                    }
                    if (df === null) {
                      // Inferir fim do ciclo se não veio
                      if (cicloN === 1) df = 7;
                      else if (cicloN === 2) df = 14;
                      else if (cicloN === 3) df = 21;
                      else df = daysInMonthLocal;
                    }
                    df = Math.max(di, Math.min(daysInMonthLocal, df));
                    const pct = __toNumber(c.percentual);
                    // Step: conta o ciclo inteiro a partir do primeiro dia do ciclo
                    if (day >= di) {
                      // Ciclo 1 (di=1): aplica direto no dia 1
                      if (di === 1) {
                        cumPct += pct;
                      } else {
                        // Rampa curta: nos primeiros dias do ciclo, aplica fração do pct
                        const elapsed = (day - di); // 0 no 1º dia do ciclo
                        const denom = Math.max(1, SMOOTH_DAYS - 1); // SMOOTH_DAYS=2 => denom=1
                        const frac = Math.max(0, Math.min(1, elapsed / denom));
                        cumPct += (pct * frac);
                      }
                    }
                    // Se ainda não chegou no início do próximo ciclo, paramos (cumPct já reflete os ciclos "ativados")
                  }
                  // clamp de segurança (percentual pode passar de 1 por inconsistência)
                  if (cumPct > 1) cumPct = 1;
                  if (cumPct < 0) cumPct = 0;
                  metaPoint = metaTotal * cumPct;
                }
              } catch (e) {
                runningGoal += stepGoal;
                metaPoint = runningGoal;
              }
            } else if (useCycleFixed) {
              try {
                const d = new Date(String(k)); // k = YYYY-MM-DD
                const day = d && !Number.isNaN(d.getTime()) ? d.getDate() : null;
                if (day === null) {
                  runningGoal += stepGoal;
                  metaPoint = runningGoal;
                } else if (day < overrideCicloInicio) {
                  metaPoint = 0;
                } else {
                  // Meta por ciclo (fixa): mostra o alvo total do ciclo como linha horizontal.
                  // (Evita valores "pro-rata" no tooltip quando o range tem poucos dias, ex.: 01/01 => 1/7 da meta)
                  metaPoint = metaTotal;
                }
              } catch (e) {
                runningGoal += stepGoal;
                metaPoint = runningGoal;
              }
            } else {
              runningGoal += stepGoal;
              metaPoint = runningGoal;
            }
            
            categories.push(dataMap[k].display);
            seriesData.push(runningTotal);
            seriesMeta.push(metaPoint);
            rawDates.push(dataMap[k].rawDate);
        });

        return { categories, seriesData, seriesMeta, rawDates, isYearly };
      }

      async function fetchRevenue() {
        if (!sbClient) return;

        const { start, end } = getDateRange(state.dateFilter);
        const prevRange = getPreviousDateRange(state.dateFilter);
        const monthFullRange = getFullMonthRange();

        // Mesmo range do ano anterior (para "vs ano passado" via compras)
        const lastYearRange = __shiftRangeByYears({ start, end }, -1);
        const lastYearLabel = (() => {
          try { return new Date(String(lastYearRange.end || lastYearRange.start)).getFullYear(); } catch (e) { return getPrevYear(); }
        })();
        // Cutoff ajustado para o ano passado (evita zerar a série quando o cutoff é recente)
        const cutoffLastYearIso = (cutoff && cutoff.enabled && cutoff.cutoffInstantIso)
          ? __shiftIsoYear(cutoff.cutoffInstantIso, -1)
          : null;
        
        // Faturamento/Vendas: compras aprovadas (compras.valor_total) por data_compra
        // Observação importante: NÃO aplicar cutoff por `created_at` em compras, pois existem compras
        // “backdated” (data_compra no período, mas created_at antigo), o que zera/corta dias no gráfico.
        let query = sbClient
          .from('compras')
          .select('valor_total, data_compra, leadid, vendedoresponsavel');
        query = applyApprovedPurchaseFilter(query);
        query = applyCutoffTimestamp(query, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        if (state.selectedSeller) query = query.eq('vendedoresponsavel', state.selectedSeller);
        const { data: dataCurr } = await query;
        let dataCurrRows = dataCurr || [];
        // Filtro por agência (via leadid -> leads.agencia)
        dataCurrRows = await filterRowsByAgencyViaLeadId(dataCurrRows, (r) => r && r.leadid);

        // --- GRÁFICO: EVOLUÇÃO DO FATURAMENTO (período próprio) ---
        // O gráfico tem controles próprios (Mês/Semestre/Ano), independentes do header.
        const fetchRevenueChartData = async () => {
          const mode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month';
          const range = getRevenueChartRangeByMode(mode);
          const chartStart = range.start;
          const chartEnd = range.end;

          // 1) Dados do período do gráfico
          let q = sbClient
            .from('compras')
            .select('valor_total, data_compra, leadid, vendedoresponsavel');
          q = applyApprovedPurchaseFilter(q);
          q = applyCutoffTimestamp(q, 'data_compra').gte('data_compra', chartStart).lte('data_compra', chartEnd);
          if (state.selectedSeller) q = q.eq('vendedoresponsavel', state.selectedSeller);
          const { data: rowsRaw } = await q;
          const rows = await filterRowsByAgencyViaLeadId((rowsRaw || []), (r) => r && r.leadid);

          // 2) Meta (mês = steps por ciclos; semestre/ano = linear (meta mensal × meses))
          const monthlyMeta = await getGaugeTargetRevenueFromCrm();
          let metaOverride = monthlyMeta;
          if (mode === 'month') {
            const ciclos = await getCiclosForCurrentContext();
            metaOverride = (Array.isArray(ciclos) && ciclos.length > 0)
              ? { mode: 'monthly_steps', metaTotal: monthlyMeta, ciclos }
              : monthlyMeta;
          } else if (mode === 'semester') {
            metaOverride = (Number(monthlyMeta) || 0) * 6;
          } else if (mode === 'year') {
            metaOverride = (Number(monthlyMeta) || 0) * 12;
          }

          const chartData = processRevenueData((rows || []), chartStart, chartEnd, metaOverride);

          // 3) Série "Ano passado" (alinhada ao período do gráfico)
          try {
            const refStart = new Date(String(chartStart));
            const currentYear = (refStart && !Number.isNaN(refStart.getTime())) ? refStart.getFullYear() : getCurrentYear();
            const isYearly = !!chartData.isYearly;

            const lyStart = __shiftIsoYear(chartStart, -1) || chartStart;
            const lyEnd = __shiftIsoYear(chartEnd, -1) || chartEnd;

            let qLY = sbClient
              .from('compras')
              .select('valor_total, data_compra, leadid');
            qLY = applyApprovedPurchaseFilter(qLY);
            qLY = applyCutoffTimestampAt(qLY, 'data_compra', cutoffLastYearIso)
              .gte('data_compra', lyStart)
              .lte('data_compra', lyEnd);
            if (state.selectedSeller) qLY = qLY.eq('vendedoresponsavel', state.selectedSeller);
            const { data: rowsLYraw } = await qLY;
            const rowsLY = await filterRowsByAgencyViaLeadId((rowsLYraw || []), (r) => r && r.leadid);

            const keys = Array.isArray(chartData.rawDates) ? chartData.rawDates : [];
            const totalsByKey = {};
            keys.forEach(k => { totalsByKey[k] = 0; });

            if (isYearly) {
              // keys: YYYY-MM (mapeia mês do ano passado para o ano atual)
              (rowsLY || []).forEach(r => {
                if (!r || !r.data_compra) return;
                try {
                  const d = new Date(r.data_compra);
                  if (Number.isNaN(d.getTime())) return;
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const mappedKey = `${currentYear}-${mm}`;
                  if (Object.prototype.hasOwnProperty.call(totalsByKey, mappedKey)) {
                    totalsByKey[mappedKey] += parseCurrency(r.valor_total);
                  }
                } catch (e) {}
              });
            } else {
              // keys: YYYY-MM-DD (mapeia dia do mês do ano passado para o mês atual no ano atual)
              const refMonthStart = new Date(String(chartStart));
              const currentMonth = (refMonthStart && !Number.isNaN(refMonthStart.getTime())) ? refMonthStart.getMonth() : (new Date().getMonth());
              (rowsLY || []).forEach(r => {
                if (!r || !r.data_compra) return;
                try {
                  const d = new Date(r.data_compra);
                  if (Number.isNaN(d.getTime())) return;
                  const dom = d.getDate();
                  const mapped = new Date(currentYear, currentMonth, dom, 12, 0, 0, 0);
                  const mappedKey = formatYmdLocal(mapped);
                  if (mappedKey && Object.prototype.hasOwnProperty.call(totalsByKey, mappedKey)) {
                    totalsByKey[mappedKey] += parseCurrency(r.valor_total);
                  }
                } catch (e) {}
              });
            }

            let run = 0;
            const seriesLastYear = keys.map(k => {
              run += (Number.isFinite(totalsByKey[k]) ? totalsByKey[k] : 0);
              return run;
            });

            chartData.seriesLastYear = seriesLastYear;
            chartData.seriesLastYearName = `${currentYear - 1}`;
          } catch (e) {}

          // 4) Série "Projeção" (Run Rate) — apenas para modos month e year
          try {
            if (mode === 'month' || mode === 'year') {
              const projRawDates = Array.isArray(chartData.rawDates) ? chartData.rawDates : [];
              const projSeriesData = Array.isArray(chartData.seriesData) ? chartData.seriesData : [];
              const isYearly = !!chartData.isYearly || mode === 'year';
              
              // Determinar chave atual baseado no modo
              let currentKey;
              if (isYearly) {
                // Modo anual: usar formato YYYY-MM (mês atual)
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                currentKey = `${year}-${month}`;
              } else {
                // Modo mensal: usar formato YYYY-MM-DD (dia atual)
                currentKey = formatYmdLocal(new Date());
              }
              
              let currentIdx = projRawDates.indexOf(currentKey);
              // Se não encontrou, usar último índice disponível
              if (currentIdx < 0) currentIdx = projSeriesData.length - 1;
              if (currentIdx < 0) currentIdx = 0;

              const acumuladoHoje = projSeriesData[currentIdx] || 0;
              
              // Calcular taxa e projeção baseado no modo
              let taxaMedia, projecaoFinal;
              if (isYearly) {
                // Modo anual: meses passados / meses totais (12)
                const mesesPassados = currentIdx + 1;
                const mesesTotais = 12; // sempre 12 meses no ano
                taxaMedia = mesesPassados > 0 ? acumuladoHoje / mesesPassados : 0;
                projecaoFinal = taxaMedia * mesesTotais;
              } else {
                // Modo mensal: dias passados / dias totais do mês
                const diasPassados = currentIdx + 1;
                const diasTotais = projSeriesData.length;
                taxaMedia = diasPassados > 0 ? acumuladoHoje / diasPassados : 0;
                projecaoFinal = taxaMedia * diasTotais;
              }

              // Série de projeção: null até hoje, depois interpolação linear até projecaoFinal
              const seriesProjecao = projSeriesData.map((_, i) => {
                if (i < currentIdx) return null; // antes do período atual: sem dados
                if (i === currentIdx) return acumuladoHoje; // ponto de conexão
                // interpolação linear do ponto atual até projeção final
                const restante = projSeriesData.length - 1 - currentIdx;
                if (restante <= 0) return projecaoFinal;
                const progresso = (i - currentIdx) / restante;
                return acumuladoHoje + (projecaoFinal - acumuladoHoje) * progresso;
              });

              chartData.seriesProjecao = seriesProjecao;
              chartData.projecaoFinal = projecaoFinal;
            }
          } catch (e) {}

          return chartData;
        };

        try {
          const chartData = await fetchRevenueChartData();
          state.revenueChartData = chartData;
          renderRevenue(chartData);
        } catch (e) {}

        let queryPrev = sbClient
          .from('compras')
          .select('valor_total, leadid');
        queryPrev = applyApprovedPurchaseFilter(queryPrev);
        queryPrev = applyCutoffTimestamp(queryPrev, 'data_compra').gte('data_compra', prevRange.start).lte('data_compra', prevRange.end);
        if (state.selectedSeller) queryPrev = queryPrev.eq('vendedoresponsavel', state.selectedSeller);
        const { data: dataPrev } = await queryPrev;
        const dataPrevRows = await filterRowsByAgencyViaLeadId((dataPrev || []), (r) => r && r.leadid);

        const currentSales = dataCurrRows ? dataCurrRows.length : 0;
        const currentRevenue = dataCurrRows ? dataCurrRows.reduce((acc, curr) => acc + parseCurrency(curr.valor_total), 0) : 0;
        const prevSales = dataPrevRows ? dataPrevRows.length : 0;
        const prevRevenue = dataPrevRows ? dataPrevRows.reduce((acc, curr) => acc + parseCurrency(curr.valor_total), 0) : 0;
        const currentTicket = currentSales > 0 ? currentRevenue / currentSales : 0;
        const prevTicket = prevSales > 0 ? prevRevenue / prevSales : 0;

        // --- FATURAMENTO "ANO PASSADO" via compras (mesmo range, -1 ano) ---
        let lastYearRevenue = 0;
        let lastYearSales = 0;
        let lastYearTicket = 0;
        try {
          let qLastYear = sbClient
            .from('compras')
            .select('valor_total, leadid');
          qLastYear = applyApprovedPurchaseFilter(qLastYear);
          qLastYear = applyCutoffTimestampAt(qLastYear, 'data_compra', cutoffLastYearIso)
            .gte('data_compra', lastYearRange.start)
            .lte('data_compra', lastYearRange.end);
          if (state.selectedSeller) qLastYear = qLastYear.eq('vendedoresponsavel', state.selectedSeller);
          const { data: rowsLYraw } = await qLastYear;
          const rowsLY = await filterRowsByAgencyViaLeadId((rowsLYraw || []), (r) => r && r.leadid);
          lastYearSales = (rowsLY || []).length;
          lastYearRevenue = (rowsLY || []).reduce((acc, r) => acc + parseCurrency(r.valor_total), 0);
          lastYearTicket = lastYearSales > 0 ? (lastYearRevenue / lastYearSales) : 0;
        } catch (e) {}

        // --- Conversão global (no período): leads fechados / leads captados ---
        // leads captados = leads.created_at no range (respeita seller e cutoff)
        let queryCaptados = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true });
        queryCaptados = applyAgencyFilterToLeadQuery(queryCaptados);
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
        queryCaptadosPrev = applyAgencyFilterToLeadQuery(queryCaptadosPrev);
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
        queryLeads = applyAgencyFilterToLeadQuery(queryLeads);
        queryLeads = applyCutoffTimestamp(queryLeads, 'created_at').gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryLeads = queryLeads.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeads } = await queryLeads;

        // Query para contar Leads Ativos do período anterior (para comparação)
        let queryLeadsPrev = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        queryLeadsPrev = applyAgencyFilterToLeadQuery(queryLeadsPrev);
        queryLeadsPrev = applyCutoffTimestamp(queryLeadsPrev, 'created_at').gte('created_at', prevRange.start)
          .lte('created_at', prevRange.end);
        if (state.selectedSeller) queryLeadsPrev = queryLeadsPrev.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countLeadsPrev } = await queryLeadsPrev;

        // --- Conversão de Oportunidades -> Vendas (no período): vendas / oportunidades ---
        const convOportunidadesPct = (countLeads && countLeads > 0)
          ? (currentSales / countLeads) * 100
          : 0;
        const convOportunidadesPctPrev = (countLeadsPrev && countLeadsPrev > 0)
          ? (prevSales / countLeadsPrev) * 100
          : 0;

        const investment = state.marketingInvestment;
        const investmentPrev = state.marketingInvestmentPrev || 0;
        const cac = currentSales > 0 ? investment / currentSales : 0;
        const cacPrev = prevSales > 0 ? (investmentPrev / prevSales) : 0;
        const roas = investment > 0 ? currentRevenue / investment : 0;
        const roasPrev = investmentPrev > 0 ? (prevRevenue / investmentPrev) : 0;

        // --- REUNIÕES (KPI): contagem de linhas em agendamento no período (exclui Cancelada e diretores) ---
        // NOTA: Usa getMeetingsDateRange para incluir reuniões futuras até fim do mês (igual ao card lateral)
        // FILTRO: Exclui reuniões de vendedores que são diretores (diretorVendas = true)
        const meetingsRange = getMeetingsDateRange(state.dateFilter);
        
        // Buscar lista de IDs de diretores para filtrar reuniões
        let directorIds = [];
        try {
          const { data: directors } = await sbClient
            .from('vendedores')
            .select('id')
            .eq('diretorVendas', true);
          directorIds = (directors || []).map(d => d.id).filter(Boolean);
        } catch (e) {}
        
        const countMeetingRowsForRange = async (startYmd, endYmd) => {
          try {
            if (!startYmd || !endYmd) return 0;

            let q = sbClient
              .from('agendamento')
              .select('leadId, statusReuniao, vendedor')
              .not('leadId', 'is', null);
            q = applyCutoffDateYmd(q, 'data').gte('data', startYmd).lte('data', endYmd);
            q = applyMeetingNotCanceledFilter(q);
            if (state.selectedSeller) q = q.eq('vendedor', state.selectedSeller);
            const { data } = await q;
            const rows = await filterRowsByAgencyViaLeadId((data || []), (r) => r && r.leadId);
            // Excluir reuniões de diretores
            const filteredRows = (rows || []).filter(r => !directorIds.includes(r.vendedor));
            return filteredRows.length;
          } catch (e) {
            return 0;
          }
        };

        // --- PROPOSTAS (KPI): contagem de LEADS ÚNICOS com proposta no período ---
        // FILTRO: Deduplicar por id_lead (1 proposta por lead, não conta múltiplas propostas do mesmo lead)
        // FILTRO: Exclui propostas de diretores (alinhado com ranking de metas)
        const countProposalRowsForRange = async (rangeStartIso, rangeEndIso) => {
          try {
            let qProps = sbClient
              .from('imagemProposta')
              .select('id_lead, id_vendedor')
              .not('id_lead', 'is', null);
            qProps = applyCutoffTimestamp(qProps, 'created_at').gte('created_at', rangeStartIso).lte('created_at', rangeEndIso);
            if (state.selectedSeller) {
              // reduz volume: propostas do vendedor OU sem id_vendedor (fallback por lead)
              qProps = qProps.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);
            }
            const { data: propsRaw } = await qProps;
            const props = await filterRowsByAgencyViaLeadId((propsRaw || []), (p) => p && p.id_lead);

            // Filtrar propostas de diretores e contar leads únicos por vendedor não-diretor
            // (Mesmo comportamento do fetchMetasData - só conta proposta se o vendedor não é diretor)
            const proposedLeadIdsBySeller = {};
            const proposalsNeedingLeadFallback = [];

            (props || []).forEach(p => {
              if (!p) return;
              if (p.id_vendedor) {
                // Se é diretor, ignorar
                if (directorIds.includes(p.id_vendedor)) return;
                const sid = String(p.id_vendedor);
                if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
              } else if (p.id_lead) {
                proposalsNeedingLeadFallback.push(p);
              }
            });

            // Fallback: buscar vendedorResponsavel dos leads sem id_vendedor
            if (proposalsNeedingLeadFallback.length > 0) {
              const leadIds = [...new Set(proposalsNeedingLeadFallback.map(p => p && p.id_lead).filter(Boolean))];
              for (const chunk of chunkArray(leadIds, 500)) {
                let qLead = sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', chunk);
                qLead = applyAgencyFilterToLeadQuery(qLead);
                const { data: leads } = await qLead;
                (leads || []).forEach(l => {
                  if (!l || !l.lead_id || !l.vendedorResponsavel) return;
                  // Se vendedorResponsavel é diretor, ignorar
                  if (directorIds.includes(l.vendedorResponsavel)) return;
                  const sid = String(l.vendedorResponsavel);
                  if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                  proposedLeadIdsBySeller[sid].add(String(l.lead_id));
                });
              }
            }

            // Se há filtro de vendedor, contar apenas leads desse vendedor
            if (state.selectedSeller) {
              const sellerLeads = proposedLeadIdsBySeller[state.selectedSeller];
              return sellerLeads ? sellerLeads.size : 0;
            }

            // Contar leads únicos globalmente (mesmo lead em múltiplos vendedores conta 1x)
            const allUniqueLeads = new Set();
            Object.values(proposedLeadIdsBySeller).forEach(leadSet => {
              leadSet.forEach(lid => allUniqueLeads.add(lid));
            });
            return allUniqueLeads.size;
          } catch (e) {
            return 0;
          }
        };

        const proposalsCount = await countProposalRowsForRange(start, end);
        const proposalsPrev = await countProposalRowsForRange(prevRange.start, prevRange.end);
        // Reuniões: usa getMeetingsDateRange para incluir futuro até fim do período (unificado com card lateral)
        const meetingsCount = await countMeetingRowsForRange(meetingsRange.startYmd, meetingsRange.endYmd);
        // Para período anterior: calcula o mês anterior completo (mesmo comportamento)
        const meetingsPrevYmd = (() => {
          const s = new Date(meetingsRange.start);
          const e = new Date(meetingsRange.end);
          s.setMonth(s.getMonth() - 1);
          e.setMonth(e.getMonth() - 1);
          const pad2 = (n) => String(n).padStart(2, '0');
          const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          return { startYmd: toYmd(s), endYmd: toYmd(e) };
        })();
        const meetingsPrev = await countMeetingRowsForRange(meetingsPrevYmd.startYmd, meetingsPrevYmd.endYmd);

        const kpiById = {};
        (state.kpis || []).forEach((k) => { if (k && k.id) kpiById[k.id] = k; });
        const kpi = (id) => kpiById[id];

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
        try {
          const kFat = kpi(KPI_IDS.FATURAMENTO);
          if (kFat && kFat.vs2) {
            const metaMissing = !(metaForPeriod > 0) || !(currentRevenue > 0);
            kFat.vs2.missing = metaMissing;
            kFat.vs2.v = metaMissing ? 0 : Math.abs(metaVar).toFixed(1);
            kFat.vs2.neutral = metaMissing ? true : metaIsFlat;
            kFat.vs2.up = (metaMissing || metaIsFlat) ? true : (metaVar >= 0);
            kFat.vs2.l = 'vs meta';
          }
        } catch (e) {}

        // --- Comparativo "Méd." (vs2) - média ponderada YTD 2025 (mocado) ---
        // Objetivo: comparar o período selecionado com a média do ano (ponderada por dias decorridos).
        // Observação: KPI 0 (Faturamento) usa vs2 = Meta (mantemos).
        const rangeDaysForAvg = getInclusiveRangeDays(start, end);
        const baseline2025Avg = getBaseline2025YtdForRange(rangeDaysForAvg);

        const setVs2 = (id, current, baseline, opts = {}) => {
          const betterWhenLower = !!opts.betterWhenLower;
          const baselineVal = Number.isFinite(baseline) ? baseline : 0;
          const currentVal = Number.isFinite(current) ? current : 0;
          const missing = !(baselineVal > 0) || !(currentVal > 0);
          const variation = baselineVal > 0
            ? ((currentVal - baselineVal) / baselineVal) * 100
            : (currentVal > 0 ? 100 : 0);
          const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
          const k = kpi(id);
          if (k && k.vs2) {
            k.vs2.missing = missing;
            k.vs2.v = missing ? 0 : Math.abs(variation).toFixed(1);
            k.vs2.neutral = missing ? true : isFlat;
            k.vs2.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
          }
        };

        // Aplica "Méd." apenas onde o card realmente usa vs2 como média (todos, exceto Faturamento que usa Meta)
        setVs2(KPI_IDS.CONVERSAO, convGlobalPct, baseline2025Avg.convPct);
        setVs2(KPI_IDS.OPORTUNIDADES, (countLeads || 0), baseline2025Avg.leadsAtivosProxy);
        setVs2(KPI_IDS.CAPTADOS, (countCaptados || 0), baseline2025Avg.captados);
        setVs2(KPI_IDS.PROPOSTAS, proposalsCount, baseline2025Avg.propostas);
        setVs2(KPI_IDS.REUNIOES, meetingsCount, baseline2025Avg.reunioes);
        setVs2(KPI_IDS.QTD_VENDAS, currentSales, baseline2025Avg.vendas);
        setVs2(KPI_IDS.TICKET, currentTicket, baseline2025Avg.ticket);
        setVs2(KPI_IDS.INVEST, investment, baseline2025Avg.investimento);
        setVs2(KPI_IDS.CAC, cac, baseline2025Avg.cac, { betterWhenLower: true });
        setVs2(KPI_IDS.ROAS, roas, baseline2025Avg.roas);
        setVs2(KPI_IDS.CONV_OPORTUNIDADES, convOportunidadesPct, baseline2025Avg.convOportunidadesPct);

        // --- Comparativo vs ANO ANTERIOR (vs3) MOCADO com pro-rata por dias ---
        // Funciona para qualquer filtro do header (Hoje/Semana/Mês/Ano/Semestre/Custom),
        // usando o MESMO range do KPI (getDateRange) e escalando os totais do ano anterior por rangeDays/diasNoAno.
        const rangeDays = getInclusiveRangeDays(start, end);
        const baseline2024 = getBaseline2024ForRange(rangeDays);

        const setVs3 = (id, current, baseline, opts = {}) => {
          const betterWhenLower = !!opts.betterWhenLower;
          const baselineVal = Number.isFinite(baseline) ? baseline : 0;
          const currentVal = Number.isFinite(current) ? current : 0;
          const missing = !(baselineVal > 0) || !(currentVal > 0);
          const variation = baselineVal > 0
            ? ((currentVal - baselineVal) / baselineVal) * 100
            : (currentVal > 0 ? 100 : 0);
          const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
          const k = kpi(id);
          if (k && k.vs3) {
            k.vs3.missing = missing;
            k.vs3.v = missing ? 0 : Math.abs(variation).toFixed(1);
            k.vs3.neutral = missing ? true : isFlat;
            k.vs3.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
            const yLabel = (opts && opts.yearLabel) ? opts.yearLabel : baseline2024.year;
            k.vs3.l = `vs ${yLabel}`;
          }
        };

        // Mapeamento KPIs -> baseline 2024 pro-rata
        // KPIs de compras: comparar com compras do ano anterior (mesmo range)
        setVs3(KPI_IDS.FATURAMENTO, currentRevenue, lastYearRevenue, { yearLabel: lastYearLabel });
        setVs3(KPI_IDS.CONVERSAO, convGlobalPct, baseline2024.convPct);
        setVs3(KPI_IDS.OPORTUNIDADES, (countLeads || 0), baseline2024.leadsAtivosProxy);
        setVs3(KPI_IDS.CAPTADOS, (countCaptados || 0), baseline2024.captados);
        setVs3(KPI_IDS.PROPOSTAS, proposalsCount, baseline2024.propostas);
        setVs3(KPI_IDS.REUNIOES, meetingsCount, baseline2024.reunioes);
        setVs3(KPI_IDS.QTD_VENDAS, currentSales, lastYearSales, { yearLabel: lastYearLabel });
        setVs3(KPI_IDS.TICKET, currentTicket, lastYearTicket, { yearLabel: lastYearLabel });
        setVs3(KPI_IDS.INVEST, investment, baseline2024.investimento);
        setVs3(KPI_IDS.CAC, cac, baseline2024.cac, { betterWhenLower: true });
        setVs3(KPI_IDS.ROAS, roas, baseline2024.roas);
        setVs3(KPI_IDS.CONV_OPORTUNIDADES, convOportunidadesPct, baseline2024.convOportunidadesPct);

        const updateKPI = (id, value, prevValue, formatFunc = (v)=>v, opts = {}) => {
            const betterWhenLower = !!opts.betterWhenLower;
            const variation = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0);
            const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
            const missing = !(prevValue > 0) || !(value > 0);
            const k = kpi(id);
            if (!k || !k.vs1) return;
            k.v = formatFunc(value);
            k.vs1.missing = missing;
            k.vs1.v = missing ? 0 : Math.abs(variation).toFixed(1);
            // 0% (igualdade) deve ser neutro, não verde/vermelho
            k.vs1.neutral = missing ? true : isFlat;
            k.vs1.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
        };

        updateKPI(KPI_IDS.FATURAMENTO, currentRevenue, prevRevenue, formatCurrency);
        updateKPI(KPI_IDS.CONVERSAO, convGlobalPct, convGlobalPctPrev, (v) => v.toFixed(2) + "%");
        updateKPI(KPI_IDS.OPORTUNIDADES, countLeads || 0, countLeadsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(KPI_IDS.CAPTADOS, countCaptados || 0, countCaptadosPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(KPI_IDS.PROPOSTAS, proposalsCount || 0, proposalsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(KPI_IDS.REUNIOES, meetingsCount || 0, meetingsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(KPI_IDS.QTD_VENDAS, currentSales, prevSales, (v) => String(Number(v || 0)));
        updateKPI(KPI_IDS.TICKET, currentTicket, prevTicket, formatCurrency);
        updateKPI(KPI_IDS.INVEST, investment, investmentPrev, formatCurrency);
        // CAC: menor é melhor no comparativo vs mês
        updateKPI(KPI_IDS.CAC, cac, cacPrev, formatCurrency, { betterWhenLower: true });
        updateKPI(KPI_IDS.ROAS, roas, roasPrev, (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '0.00') + "x");
        updateKPI(KPI_IDS.CONV_OPORTUNIDADES, convOportunidadesPct, convOportunidadesPctPrev, (v) => v.toFixed(2) + "%");

        renderKPIs();

        // --- UPDATE GAUGE WITH REAL DATA (SEGUE O HEADER) ---
        // Regra (ajuste): o Velocímetro deve respeitar o mesmo período do header.
        // Meta:
        // - quando filtro = "month": usar a meta do mês INTEIRO (não prorrateada até hoje)
        // - demais filtros: prorratear a meta mensal (CRM) pelo range selecionado
        const monthlyTarget = await getGaugeTargetRevenueFromCrm(); // Meta Mensal (CRM) — vendedor selecionado ou global
        const targetRevenue = (state && state.dateFilter === 'month')
          ? (Number(monthlyTarget) || 0)
          : computeProratedTargetForRange(monthlyTarget, start, end);

        const gaugeCurrentRevenue = currentRevenue;
        const gaugePrevRevenue = prevRevenue;

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
            .from('compras')
            .select('valor_total, data_compra, leadid');
          qProj = applyApprovedPurchaseFilter(qProj);
          qProj = applyCutoffTimestamp(qProj, 'data_compra')
            .gte('data_compra', monthStartIso)
            .lte('data_compra', nowIso);
          qProj = applyCutoffTimestamp(qProj, 'created_at');
          if (state.selectedSeller) qProj = qProj.eq('vendedoresponsavel', state.selectedSeller);

          const { data: projRowsRaw } = await qProj;
          const projRows = await filterRowsByAgencyViaLeadId((projRowsRaw || []), (r) => r && r.leadid);
          const revenueToDate = (projRows || []).reduce((acc, r) => acc + parseCurrency(r.valor_total), 0);
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
        const periodRange = getMeetingsDateRange(state.dateFilter);

        // Buscar lista de IDs de diretores para excluir das contagens
        let directorIds = [];
        try {
          const { data: directors } = await sbClient
            .from('vendedores')
            .select('id')
            .eq('diretorVendas', true);
          directorIds = (directors || []).map(d => d.id).filter(Boolean);
        } catch (e) {
          console.warn('[Meetings] Erro ao buscar diretores:', e);
        }

        // Labels dinâmicos conforme regra do produto:
        // - Manter 4 cards, mas fazer 3 deles refletirem o filtro do header.
        //   meetings-today => Total no período
        //   meetings-week  => Futuras no período
        //   meetings-month => Ocorridas no período
        try {
          const a = document.getElementById('meetings-label-a');
          const b = document.getElementById('meetings-label-b');
          const c = document.getElementById('meetings-label-c');
          if (a) a.textContent = getDateFilterLabelPtBr(state.dateFilter);
          if (b) b.textContent = 'Agendadas';
          if (c) c.textContent = 'Realizadas';
        } catch (e) {}

        let countTotal = 0;
        let countFuture = 0;
        let countPast = 0;
        try {
          let query = sbClient
            .from('agendamento')
            .select('data, hora, leadId, statusReuniao, vendedor')
            .not('leadId', 'is', null);
          query = applyMeetingNotCanceledFilter(query);
          if (state.selectedSeller) query = query.eq('vendedor', state.selectedSeller);
          query = applyCutoffDateYmd(query, 'data').gte('data', periodRange.startYmd).lte('data', periodRange.endYmd);

          const { data } = await query;
          let rows = await filterRowsByAgencyViaLeadId((data || []), (r) => r && r.leadId);
          // Filtrar: excluir reuniões de diretores
          rows = (rows || []).filter(r => !directorIds.includes(r.vendedor));
          const todayYmd = todayRange.startYmd;

          const cmpYmd = (a, b) => String(a || '').localeCompare(String(b || ''), 'en');
          (rows || []).forEach((r) => {
            if (!r) return;
            countTotal += 1;
            const dt = parseMeetingDateTimeYmdHm(r.data, r.hora);
            if (dt && !Number.isNaN(dt.getTime())) {
              if (dt.getTime() > now.getTime()) countFuture += 1;
              else countPast += 1;
              return;
            }
            // Fallback sem hora: compara apenas a data (YMD)
            const d = r.data ? String(r.data) : '';
            if (d && cmpYmd(d, todayYmd) > 0) countFuture += 1;
            else countPast += 1;
          });
        } catch (e) {
          // mantém 0/0/0 em caso de erro
        }

        let countNow = 0;
        // “Acontecendo agora”: faz sentido manter apenas agendadas (não realizadas/canceladas)
        let queryNow = sbClient.from('agendamento').select('hora, data, leadId, vendedor').eq('statusReuniao', 'agendado');
        queryNow = applyCutoffDateYmd(queryNow, 'data').eq('data', todayRange.startYmd);
        if (state.selectedSeller) queryNow = queryNow.eq('vendedor', state.selectedSeller);
        const { data: dataNow } = await queryNow;
        if (dataNow) {
            let rowsAgency = await filterRowsByAgencyViaLeadId((dataNow || []), (r) => r && r.leadId);
            // Filtrar: excluir reuniões de diretores
            rowsAgency = (rowsAgency || []).filter(r => !directorIds.includes(r.vendedor));
            const currentHour = now.getHours();
            countNow = rowsAgency.filter(r => {
                if(!r.hora) return false;
                const h = parseInt(String(r.hora).split(':')[0], 10);
                return h === currentHour;
            }).length;
        }

        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setTxt('meetings-now', countNow);
        setTxt('meetings-today', countTotal);
        setTxt('meetings-week', countFuture);
        setTxt('meetings-month', countPast);
      }

      async function fetchSLAs() {
        if (!sbClient) return;

        // SLAs respeitam o MESMO filtro de datas do header
        const { start, end } = getDateRange(state.dateFilter);
        const startYmd = (start || '').split('T')[0];
        const endYmd = (end || '').split('T')[0];
        console.log(`--- Fetching SLAs (Filtered: ${state.dateFilter}) ---`);
        
        // --- 1. FRT Pré-vendas (hardcut + Oportunidade) ---
        // Regra: sobrepõe filtro do header/cutoff (ver computeFRTEventsHardcut()).
        let frtTotalMinutes = 0;
        let frtCount = 0;
        let frtWithin = 0;
        try {
          let frtEvents = await computeFRTEventsHardcut();
          frtEvents = await filterRowsByAgencyViaLeadId((frtEvents || []), (e) => e && e.leadId);
          frtCount = Array.isArray(frtEvents) ? frtEvents.length : 0;
          frtTotalMinutes = (frtEvents || []).reduce((acc, e) => acc + (Number(e && e.diffMinutes) || 0), 0);
          frtWithin = (frtEvents || []).reduce((acc, e) => acc + (((Number(e && e.diffMinutes) || 0) <= 20) ? 1 : 0), 0);
        } catch (e) {
          console.warn('[FRT] erro computeFRTEventsHardcut (SLA):', e);
        }

        const avgFRT = frtCount > 0 ? Math.round(frtTotalMinutes / frtCount) : 0;
        const slaFRT = frtCount > 0 ? Math.round((frtWithin / frtCount) * 100) : 0;
        console.log(`FRT(hardcut): ${avgFRT}min (${frtCount}) SLA:${slaFRT}%`);

        // --- 2. Ciclo de Venda ---
        // Novo cálculo: lead.created_at -> compras.data_compra (aprovada)
        let qComprasCiclo = sbClient
          .from('compras')
          .select('leadid, data_compra, vendedoresponsavel, valor_total');
        qComprasCiclo = applyApprovedPurchaseFilter(qComprasCiclo);
        qComprasCiclo = applyCutoffTimestamp(qComprasCiclo, 'data_compra')
          .gte('data_compra', start)
          .lte('data_compra', end);
        qComprasCiclo = applyCutoffTimestamp(qComprasCiclo, 'created_at');
        if (state.selectedSeller) qComprasCiclo = qComprasCiclo.eq('vendedoresponsavel', state.selectedSeller);

        const { data: comprasCicloRaw } = await qComprasCiclo;
        const comprasCiclo = await filterRowsByAgencyViaLeadId((comprasCicloRaw || []), (r) => r && r.leadid);

        // Buscar created_at dos leads envolvidos para calcular ciclo
        const leadCreatedAtMap = {};
        const leadIdsCiclo = [...new Set((comprasCiclo || []).map(r => r && r.leadid).filter(Boolean))];
        for (const chunk of chunkArray(leadIdsCiclo, 500)) {
          let qLeads = sbClient
            .from('leads')
            .select('lead_id, created_at')
            .in('lead_id', chunk);
          qLeads = applyAgencyFilterToLeadQuery(qLeads);
          qLeads = applyCutoffTimestamp(qLeads, 'created_at');
          const { data: leadsRows } = await qLeads;
          (leadsRows || []).forEach(l => { if (l && l.lead_id && l.created_at) leadCreatedAtMap[l.lead_id] = l.created_at; });
        }

        const leadsCiclo = (comprasCiclo || []).map(c => ({
          created_at: leadCreatedAtMap[c.leadid],
          data_compra: c.data_compra
        }));
        let cicloTotalDays = 0;
        let cicloCount = 0;
        let cicloWithin = 0;
        
        if (leadsCiclo) {
            leadsCiclo.forEach(l => {
                if (!l || !l.created_at || !l.data_compra) return;
                const endT = new Date(l.data_compra);
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

        // --- 3. Tempo Proposta (SLA 6h) ---
        // Regra (docs/tempo_proposta_filtro.md):
        // - t0: 1ª entrada na etapa âncora (loogsLeads.etapa_posterior = PROPOSAL_STAGE_ID) DENTRO do período do header
        // - t1: 1ª proposta (imagemProposta.created_at) com created_at > t0 (pode ocorrer depois do fim do período)
        // - delta: horas úteis (mesmo relógio/config do horário útil dinâmico)
        let propTotalHours = 0;
        let propCount = 0;
        let propWithin = 0;
        const PROPOSAL_STAGE_ID = 'a22c3ad3-6093-4c57-a633-da16a5b4514c';

        try {
          // 1) Entradas na etapa dentro do range do header (t0 por lead = primeira entrada)
          const entryByLead = {}; // leadId -> { t0Ms, entryVendorId }
          let qEnter = sbClient
            .from('loogsLeads')
            .select('lead, created_at, vendedor_id')
            .eq('etapa_posterior', PROPOSAL_STAGE_ID)
            .not('lead', 'is', null)
            .order('created_at', { ascending: true });
          qEnter = applyCutoffTimestamp(qEnter, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);
          // Importante (docs/tempo_proposta_filtro.md):
          // Não filtrar aqui por vendedor_id, pois a autoria final é por prioridade:
          // proposta.id_vendedor -> log(vendedor_id) -> leads.vendedorResponsavel.
          // O filtro por selectedSeller é aplicado depois, no sellerId resolvido.

          const { data: enterRows } = await qEnter;
          (enterRows || []).forEach((r) => {
            const lid = r && r.lead ? String(r.lead) : '';
            if (!lid || !r.created_at) return;
            const t0Ms = Date.parse(String(r.created_at));
            if (!Number.isFinite(t0Ms)) return;
            if (entryByLead[lid]) return; // query está ordenada asc
            entryByLead[lid] = { t0Ms, entryVendorId: r && r.vendedor_id ? String(r.vendedor_id) : null };
          });

          let leadIds = Object.keys(entryByLead);
          // Filtro por agência (por lead)
          if (state && state.selectedAgencyId) {
            try {
              const map = await fetchLeadAgencyMap(leadIds);
              leadIds = leadIds.filter((lid) => map.get(String(lid)) && String(map.get(String(lid))) === String(state.selectedAgencyId));
            } catch (e) {}
          }
          if (leadIds.length) {
            // 2) Propostas (t1) podem ocorrer após o fim do período
            const nowIso = new Date().toISOString();
            const proposalsBestByLead = {}; // leadId -> { t1Ms, proposalVendorId }

            for (const chunk of chunkArray(leadIds, 500)) {
              let qProps2 = sbClient
                .from('imagemProposta')
                .select('created_at, id_lead, id_vendedor')
                .in('id_lead', chunk)
                .not('id_lead', 'is', null);
              qProps2 = applyCutoffTimestamp(qProps2, 'created_at')
                .gte('created_at', start)
                .lte('created_at', nowIso);
              if (state.selectedSeller) qProps2 = qProps2.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);

              const { data: propsRows } = await qProps2;
              (propsRows || []).forEach((p) => {
                const lid = p && p.id_lead ? String(p.id_lead) : '';
                const entry = lid && entryByLead[lid] ? entryByLead[lid] : null;
                if (!entry || !p.created_at) return;
                const t1Ms = Date.parse(String(p.created_at));
                if (!Number.isFinite(t1Ms)) return;
                if (!(t1Ms > entry.t0Ms)) return;

                const prev = proposalsBestByLead[lid];
                if (prev && Number.isFinite(prev.t1Ms) && prev.t1Ms <= t1Ms) return;

                // se selectedSeller e id_vendedor existe, respeitar autoria
                if (state.selectedSeller && p.id_vendedor && String(p.id_vendedor) !== String(state.selectedSeller)) return;

                proposalsBestByLead[lid] = {
                  t1Ms,
                  proposalVendorId: p && p.id_vendedor ? String(p.id_vendedor) : null,
                };
              });
            }

            // 3) Fallback de vendedor (leads.vendedorResponsavel) quando necessário
            const needLeadVendor = [];
            Object.keys(proposalsBestByLead).forEach((lid) => {
              const entry = entryByLead[lid];
              const p = proposalsBestByLead[lid];
              if (!entry || !p) return;
              const hasSeller = !!(p.proposalVendorId || entry.entryVendorId);
              if (!hasSeller) needLeadVendor.push(lid);
            });

            const vendorByLead = {};
            if (needLeadVendor.length) {
              for (const chunk of chunkArray(needLeadVendor, 500)) {
                let qLeads = sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', chunk);
                qLeads = applyAgencyFilterToLeadQuery(qLeads);
                qLeads = applyCutoffTimestamp(qLeads, 'created_at');
                if (state.selectedSeller) qLeads = qLeads.eq('vendedorResponsavel', state.selectedSeller);
                const { data: leadsRows } = await qLeads;
                (leadsRows || []).forEach((l) => {
                  if (l && l.lead_id && l.vendedorResponsavel) vendorByLead[String(l.lead_id)] = String(l.vendedorResponsavel);
                });
              }
            }

            // 4) Agregar métricas
            const sel = state && state.selectedSeller ? String(state.selectedSeller) : '';
            Object.keys(proposalsBestByLead).forEach((lid) => {
              const entry = entryByLead[lid];
              const p = proposalsBestByLead[lid];
              if (!entry || !p) return;

              const sellerId =
                (p.proposalVendorId ? String(p.proposalVendorId) : null) ||
                (entry.entryVendorId ? String(entry.entryVendorId) : null) ||
                (vendorByLead[lid] ? String(vendorByLead[lid]) : null) ||
                null;

              if (sel && (!sellerId || sellerId !== sel)) return;

              const minutes = __businessMinutesBetweenWeekdaysMs(entry.t0Ms, p.t1Ms, __BUSINESS_HOURS_CFG);
              const h = minutes / 60;
              if (h > 0 && h < 720) {
                propTotalHours += h;
                propCount += 1;
                if (h <= 6) propWithin += 1;
              }
            });
          }
        } catch (e) {
          console.warn('[SLA] erro tempo proposta (novo):', e);
        }

        const avgProp = propCount > 0 ? Math.round(propTotalHours / propCount) : 0;
        const slaProp = propCount > 0 ? Math.round((propWithin / propCount) * 100) : 0;
        console.log(`Proposta: ${avgProp}h (${propCount}) SLA:${slaProp}%`);

        // --- 4. Follow-up ---
        // Regra (padrão B): horas úteis SP (seg–sex, 09–19), sem feriados.
        // - considerar 1ª entrada em FLW1/2/3
        // - usar prev_t1 (último evento antes do t1) para o delta do FLW1
        // - incluir no cálculo somente se a 1ª entrada da etapa ocorreu dentro do período do header
        let followTotalHours = 0;
        let followCount = 0;
        let followWithin = 0;

        // IDs hardcoded (doc)
        const follow1Id = 'dde9e8fa-142f-411b-b6f3-6c1f9f6cc0c9';
        const follow2Id = '169eb74f-ee37-4b49-9848-6866fd3b8af9';
        const follow3Id = 'f9e89423-7b32-4680-90aa-be7480a5dc0a';

        try {
          const startT = new Date(start);
          const endT = new Date(end);
          if (!Number.isNaN(startT.getTime()) && !Number.isNaN(endT.getTime())) {
            // 1) Candidatos: leads que entraram (1ª entrada) em FLW1/2/3 dentro do header
            let qCandidates = sbClient
              .from('loogsLeads')
              .select('created_at, lead, etapa_posterior')
              .in('etapa_posterior', [follow1Id, follow2Id, follow3Id])
              .not('lead', 'is', null)
              .order('created_at', { ascending: true });
            qCandidates = applyCutoffTimestamp(qCandidates, 'created_at')
              .gte('created_at', start)
              .lte('created_at', end);
            if (state.selectedSeller) qCandidates = qCandidates.eq('vendedor_id', state.selectedSeller);

            const { data: candidates } = await qCandidates;
            let candidateLeadIds = [...new Set((candidates || []).map(r => r && r.lead).filter(Boolean))];
            if (state && state.selectedAgencyId && candidateLeadIds.length) {
              try {
                const map = await fetchLeadAgencyMap(candidateLeadIds);
                candidateLeadIds = candidateLeadIds.filter((lid) => map.get(String(lid)) && String(map.get(String(lid))) === String(state.selectedAgencyId));
              } catch (e) {}
            }

            if (candidateLeadIds.length) {
              // 2) Lookback para achar prev_t1 e primeiras entradas (180d)
              const lookbackStart = (() => {
                try {
                  const lb = new Date(startT.getTime());
                  lb.setDate(lb.getDate() - 180);
                  return lb.toISOString();
                } catch (e) {
                  return start;
                }
              })();

              const allLogsByLead = {};
              for (const chunk of chunkArray(candidateLeadIds, 250)) {
                let q = sbClient
                  .from('loogsLeads')
                  .select('created_at, lead, etapa_posterior')
                  .in('lead', chunk)
                  .not('lead', 'is', null)
                  .order('created_at', { ascending: true });
                q = applyCutoffTimestamp(q, 'created_at')
                  .gte('created_at', lookbackStart)
                  .lte('created_at', end);
                if (state.selectedSeller) q = q.eq('vendedor_id', state.selectedSeller);

                const { data } = await q;
                (data || []).forEach(l => {
                  if (!l || !l.lead || !l.created_at) return;
                  const t = new Date(l.created_at);
                  if (Number.isNaN(t.getTime())) return;
                  allLogsByLead[l.lead] = allLogsByLead[l.lead] || [];
                  allLogsByLead[l.lead].push({ t, stage: l.etapa_posterior || null });
                });
              }

              // Helpers
              const inHeader = (t) => {
                if (!(t instanceof Date) || Number.isNaN(t.getTime())) return false;
                return t.getTime() >= startT.getTime() && t.getTime() <= endT.getTime();
              };
              const addDiffHours = (a, b) => {
                if (!a || !b) return;
                const aMs = a instanceof Date ? a.getTime() : Date.parse(String(a));
                const bMs = b instanceof Date ? b.getTime() : Date.parse(String(b));
                const mins = __businessMinutesBetweenWeekdaysMs(aMs, bMs, __BUSINESS_HOURS_CFG);
                const h = mins / 60;
                if (h > 0 && h < 720) {
                  followTotalHours += h;
                  followCount += 1;
                  if (h <= 24) followWithin += 1;
                }
              };

              // 3) Por lead: t1/t2/t3 (primeira entrada) + prev_t1 e deltas
              candidateLeadIds.forEach(leadId => {
                const evts = (allLogsByLead[leadId] || []).slice().sort((a, b) => a.t - b.t);
                if (!evts.length) return;

                let t1 = null;
                let t2 = null;
                let t3 = null;

                for (const e of evts) {
                  if (!t1 && e.stage === follow1Id) t1 = e.t;
                  else if (!t2 && e.stage === follow2Id) t2 = e.t;
                  else if (!t3 && e.stage === follow3Id) t3 = e.t;
                  if (t1 && t2 && t3) break;
                }

                // prev_t1 = último evento antes de t1
                let prevT1 = null;
                if (t1) {
                  for (let i = 0; i < evts.length; i++) {
                    const tt = evts[i].t;
                    if (tt.getTime() < t1.getTime()) prevT1 = tt;
                    else break;
                  }
                }

                if (t1 && inHeader(t1)) addDiffHours(prevT1, t1); // delta FLW1 (prev -> t1)
                if (t1 && t2 && inHeader(t2)) addDiffHours(t1, t2); // FLW1 -> FLW2
                if (t2 && t3 && inHeader(t3)) addDiffHours(t2, t3); // FLW2 -> FLW3
              });
            }
          }
        } catch (e) {
          console.error('[SLA] erro follow-up (horas úteis):', e);
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
            .select('id, nome, perfil_img')
            .eq('usuarioInterno', false);
            
        if (!sellers) return;
        
        // Initialize Map
        const sellerMap = {};
        sellers.forEach(s => {
            sellerMap[s.id] = {
                id: s.id,
                name: s.nome,
                avatarUrl: s.perfil_img || null,
                scoreSum: 0,
                scoreCount: 0,
                proposals: 0,
                meetings: 0,
                sales: 0,       // faturamento (R$)
                salesCount: 0,  // quantidade de vendas (count de compras)
                cicloSum: 0,
                cicloCount: 0,
                frtSum: 0,
                frtCount: 0
            };
        });

        // 2. Fetch Meetings & Scores
        let queryMeetings = sbClient.from('agendamento').select('vendedor, score_final, leadId, statusReuniao').not('leadId', 'is', null);
        // Para week/month: incluir reuniões futuras até o fim do período
        queryMeetings = applyCutoffDateYmd(queryMeetings, 'data').gte('data', meetRange.startYmd).lte('data', meetRange.endYmd);
        queryMeetings = applyMeetingNotCanceledFilter(queryMeetings);
        if (state.selectedSeller) queryMeetings = queryMeetings.eq('vendedor', state.selectedSeller);
        const { data: meetingsRaw } = await queryMeetings;
        const meetings = await filterRowsByAgencyViaLeadId((meetingsRaw || []), (m) => m && m.leadId);
        
        if (meetings) {
            meetings.forEach(m => {
                if (m.vendedor && sellerMap[m.vendedor]) {
                    const status = (m.statusReuniao || '').toLowerCase();
                    if (status !== 'cancelada') {
                        sellerMap[m.vendedor].meetings++; // Contador no ranking agora é Realizadas + Agendadas
                    }
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
        const { data: proposalsRaw } = await proposalsQuery;
        const proposals = await filterRowsByAgencyViaLeadId((proposalsRaw || []), (p) => p && p.id_lead);
        
        if (proposals && proposals.length > 0) {
            // 3.1) Contabilizar diretamente por id_vendedor (quando presente)
            // Regra: 1 proposta por lead por vendedor (dedup por id_lead)
            const proposedLeadIdsBySeller = {};
            const ensureSet = (sellerId) => {
              const sid = sellerId ? String(sellerId) : '';
              if (!sid) return null;
              if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
              return proposedLeadIdsBySeller[sid];
            };

            const proposalsNeedingLeadFallback = [];
            proposals.forEach(p => {
                if (p.id_vendedor) {
                    const sellerId = p.id_vendedor;
                    if (sellerMap[sellerId] && (!state.selectedSeller || sellerId === state.selectedSeller)) {
                        const s = ensureSet(sellerId);
                        if (s && p.id_lead) s.add(String(p.id_lead));
                    }
                } else if (p.id_lead) {
                    proposalsNeedingLeadFallback.push(p);
                }
            });

            // 3.2) Fallback: mapear id_lead -> vendedorResponsavel
            const leadIds = proposalsNeedingLeadFallback.map(p => p.id_lead).filter(id => id);
            if (leadIds.length > 0) {
                let q = sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', leadIds);
                q = applyAgencyFilterToLeadQuery(q);
                const { data: leads } = await q;
                
                if (leads) {
                    const leadSellerMap = {};
                    leads.forEach(l => (leadSellerMap[l.lead_id] = l.vendedorResponsavel));
                    
                    proposalsNeedingLeadFallback.forEach(p => {
                        const sellerId = leadSellerMap[p.id_lead];
                        if (sellerId && sellerMap[sellerId] && (!state.selectedSeller || sellerId === state.selectedSeller)) {
                            const s = ensureSet(sellerId);
                            if (s && p.id_lead) s.add(String(p.id_lead));
                        }
                    });
                }
            }

            // Aplicar contagem deduplicada no sellerMap
            try {
              Object.keys(sellerMap || {}).forEach((sid) => {
                const s = proposedLeadIdsBySeller[sid];
                if (s && typeof s.size === 'number') sellerMap[sid].proposals = s.size;
                else sellerMap[sid].proposals = 0;
              });
            } catch (e) {}
        }

        // 4. Fetch Sales & Cycle
        // Vendas/faturamento por executivo: compras aprovadas (compras.valor_total) por data_compra
        let querySales = sbClient.from('compras')
            .select('vendedoresponsavel, valor_total, leadid, data_compra, created_at');
        querySales = applyApprovedPurchaseFilter(querySales);
        querySales = applyCutoffTimestamp(querySales, 'data_compra').gte('data_compra', start)
            .lte('data_compra', end);
        // Cutoff do faturamento no ranking: aplicar SOMENTE por data_compra.
        // Motivo: existem compras “backdated” (data_compra no período, created_at antigo).
        if (state.selectedSeller) querySales = querySales.eq('vendedoresponsavel', state.selectedSeller);
        const { data: salesRaw } = await querySales;
        const sales = await filterRowsByAgencyViaLeadId((salesRaw || []), (s) => s && s.leadid);

        // Mapear created_at do lead para ciclo (lead.created_at -> compra.data_compra)
        const leadCreatedAt = {};
        const leadIds = [...new Set((sales || []).map(s => s && s.leadid).filter(Boolean))];
        for (const chunk of chunkArray(leadIds, 500)) {
          let q = sbClient
            .from('leads')
            .select('lead_id, created_at')
            .in('lead_id', chunk);
          q = applyAgencyFilterToLeadQuery(q);
          q = applyCutoffTimestamp(q, 'created_at');
          const { data: rows } = await q;
          (rows || []).forEach(r => { if (r && r.lead_id && r.created_at) leadCreatedAt[r.lead_id] = r.created_at; });
        }

        if (sales) {
            sales.forEach(s => {
                const sellerId = s && s.vendedoresponsavel ? s.vendedoresponsavel : null;
                if (sellerId && sellerMap[sellerId]) {
                    sellerMap[sellerId].salesCount += 1; // 1 compra aprovada = 1 venda
                    sellerMap[sellerId].sales += parseCurrency(s.valor_total);

                    // Calculate Cycle: lead.created_at -> compra.data_compra
                    const leadCreatedIso = s.leadid ? leadCreatedAt[s.leadid] : null;
                    if (leadCreatedIso && s.data_compra) {
                        const startT = new Date(leadCreatedIso);
                        const endT = new Date(s.data_compra);
                        const diffDays = (endT - startT) / (1000 * 60 * 60 * 24);
                        if (diffDays > 0) {
                            sellerMap[sellerId].cicloSum += diffDays;
                            sellerMap[sellerId].cicloCount++;
                        }
                    }
                }
            });
        }

        // 5. FRT (igual dashboard_tela + docs/frt_logica.md) — hardcut 15/01 12:00 (America/Sao_Paulo)
        try {
          let frtEvents = await computeFRTEventsHardcut(); // já aplica hardcut + atribuição de sellerId
          frtEvents = await filterRowsByAgencyViaLeadId((frtEvents || []), (e) => e && e.leadId);
          (frtEvents || []).forEach((e) => {
            const sellerId = e && e.sellerId ? String(e.sellerId) : null;
            const diff = Number(e && e.diffMinutes);
            if (!sellerId) return;
            if (!(diff > 1)) return; // regra do ranking (dashboard_tela): ignora FRT <= 1min
            const bucket = sellerMap[sellerId];
            if (!bucket) return;
            bucket.frtSum += diff;
            bucket.frtCount += 1;
          });
        } catch (e) {
          console.warn('[FRT] erro computeFRTEventsHardcut (ranking):', e);
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

      // --- METAS DE PROPOSTAS E REUNIÕES ---
      // Default meta values (can be overridden by crm_metas_vendedores or params)
      const DEFAULT_META_PROPOSTAS = 100;
      const DEFAULT_META_REUNIOES = 50;

      async function fetchMetasData() {
        if (!sbClient) return;
        const { start, end, startYmd, endYmd } = getDateRange(state.dateFilter);
        const meetRange = getMeetingsDateRange(state.dateFilter);

        try {
          // 1. Fetch all sellers
          const { data: sellers } = await sbClient
            .from('vendedores')
            .select('id, nome, perfil_img, diretorVendas')
            .eq('usuarioInterno', false);

          if (!sellers || sellers.length === 0) {
            state.metasData = {
              global: { propostas: { current: 0, target: 0, pct: 0 }, reunioes: { current: 0, target: 0, pct: 0 } },
              sellers: []
            };
            renderMetasSection();
            return;
          }

          // Filter out sellers who are directors
          const activeSellers = sellers.filter(s => s.diretorVendas !== true);

          // Initialize seller map
          const sellerMap = {};
          activeSellers.forEach(s => {
            sellerMap[s.id] = {
              id: s.id,
              name: s.nome || 'Sem nome',
              avatarUrl: s.perfil_img || null,
              role: s.cargo || 'Vendedor',
              propostas: 0,
              reunioes: 0,
              metaPropostas: DEFAULT_META_PROPOSTAS,
              metaReunioes: DEFAULT_META_REUNIOES
            };
          });

          // 2. Try to fetch metas from crm_metas_vendedor_mes
          try {
            const { mes, ano } = getCrmMetaContext();
            const mesRef = `${ano}-${String(mes).padStart(2, '0')}-01`;
            
            const { data: dbMetas } = await sbClient
              .from('crm_metas_vendedor_mes')
              .select('vendedor_id, meta_mensal_propostas, meta_mensal_reunioes')
              .eq('mes_ref', mesRef);

            if (dbMetas && dbMetas.length > 0) {
              dbMetas.forEach(row => {
                const vid = row.vendedor_id;
                if (sellerMap[vid]) {
                  if (row.meta_mensal_propostas !== undefined && row.meta_mensal_propostas !== null) {
                    sellerMap[vid].metaPropostas = __toNumber(row.meta_mensal_propostas) || DEFAULT_META_PROPOSTAS;
                  }
                  if (row.meta_mensal_reunioes !== undefined && row.meta_mensal_reunioes !== null) {
                    sellerMap[vid].metaReunioes = __toNumber(row.meta_mensal_reunioes) || DEFAULT_META_REUNIOES;
                  }
                }
              });
            }
          } catch (e) {
            console.error('Erro ao buscar metas da tabela:', e);
          }

          // 3. Fetch proposals count per seller (deduplicated by id_lead)
          let proposalsQuery = sbClient
            .from('imagemProposta')
            .select('id_lead, id_vendedor');
          proposalsQuery = applyCutoffTimestamp(proposalsQuery, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);
          const { data: proposalsRaw } = await proposalsQuery;
          const proposals = await filterRowsByAgencyViaLeadId((proposalsRaw || []), (p) => p && p.id_lead);

          // Count proposals per seller (dedup by id_lead)
          const proposedLeadIdsBySeller = {};
          const proposalsNeedingLeadFallback = [];

          if (proposals && proposals.length > 0) {
            proposals.forEach(p => {
              if (p.id_vendedor) {
                const sid = String(p.id_vendedor);
                if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
              } else if (p.id_lead) {
                proposalsNeedingLeadFallback.push(p);
              }
            });

            // Fallback: fetch leads.vendedorResponsavel for proposals without id_vendedor
            const leadIds = proposalsNeedingLeadFallback.map(p => p.id_lead).filter(Boolean);
            if (leadIds.length > 0) {
              let q = sbClient
                .from('leads')
                .select('lead_id, vendedorResponsavel')
                .in('lead_id', leadIds);
              q = applyAgencyFilterToLeadQuery(q);
              const { data: leads } = await q;

              if (leads) {
                const leadSellerMap = {};
                leads.forEach(l => { if (l.lead_id && l.vendedorResponsavel) leadSellerMap[l.lead_id] = l.vendedorResponsavel; });

                proposalsNeedingLeadFallback.forEach(p => {
                  const sid = leadSellerMap[p.id_lead];
                  if (sid) {
                    if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                    if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
                  }
                });
              }
            }
          }

          // Apply proposal counts to sellerMap
          Object.keys(sellerMap).forEach(sid => {
            const s = proposedLeadIdsBySeller[sid];
            sellerMap[sid].propostas = s ? s.size : 0;
          });

          // 4. Fetch meetings count per seller (exclude cancelled)
          let meetingsQuery = sbClient
            .from('agendamento')
            .select('vendedor, leadId, statusReuniao')
            .not('leadId', 'is', null);
          meetingsQuery = applyCutoffDateYmd(meetingsQuery, 'data')
            .gte('data', meetRange.startYmd)
            .lte('data', meetRange.endYmd);
          meetingsQuery = applyMeetingNotCanceledFilter(meetingsQuery);
          const { data: meetingsRaw } = await meetingsQuery;
          const meetings = await filterRowsByAgencyViaLeadId((meetingsRaw || []), (m) => m && m.leadId);

          let globalReunioesRealizadas = 0;
          let globalReunioesAgendadas = 0;

          if (meetings && meetings.length > 0) {
            meetings.forEach(m => {
              if (m.vendedor && sellerMap[m.vendedor]) {
                const status = (m.statusReuniao || '').toLowerCase();
                if (status !== 'cancelada') {
                  globalReunioesRealizadas++; // Agora conta todas não canceladas (Realizadas + Agendadas)
                  if (status === 'realizada') {
                    sellerMap[m.vendedor].reunioes++; // No ranking individual, mantemos apenas as realizadas? Ou quer todas?
                  }
                }
              }
            });
          }

          // 5. Calculate percentages and build result
          let globalPropostasTotal = 0;
          let globalPropostasMeta = 0;
          let globalReunioesTotal = 0;
          let globalReunioesMeta = 0;

          // 5.1. Try to fetch global metas from crm_metas_geral_mes
          try {
            const { mes, ano } = getCrmMetaContext();
            const { data: generalMetas } = await sbClient
              .from('crm_metas_geral_mes')
              .select('meta_geral_propostas, meta_geral_reunioes')
              .eq('mes', mes);

            if (generalMetas && generalMetas.length > 0) {
              const row = generalMetas[0];
              if (row.meta_geral_propostas !== undefined && row.meta_geral_propostas !== null) {
                globalPropostasMeta = __toNumber(row.meta_geral_propostas) || 0;
              }
              if (row.meta_geral_reunioes !== undefined && row.meta_geral_reunioes !== null) {
                globalReunioesMeta = __toNumber(row.meta_geral_reunioes) || 0;
              }
            }
          } catch (e) {
            console.error('Erro ao buscar metas gerais:', e);
          }

          const sellersResult = [];
          Object.values(sellerMap).forEach(s => {
            // Filter by selected seller if applicable
            if (state.selectedSeller && s.id !== state.selectedSeller) return;

            // UX: percentuais sem casas decimais (ex.: "6%")
            const propostasPct = s.metaPropostas > 0 ? Math.min(100, Number(((s.propostas / s.metaPropostas) * 100).toFixed(0))) : 0;
            const reunioesPct = s.metaReunioes > 0 ? Math.min(100, Number(((s.reunioes / s.metaReunioes) * 100).toFixed(0))) : 0;
            const avgPct = Number(((propostasPct + reunioesPct) / 2).toFixed(0));

            globalPropostasTotal += s.propostas;
            // Only add to global meta if we didn't get it from crm_metas_geral_mes
            if (globalPropostasMeta === 0) {
              globalPropostasMeta += s.metaPropostas;
            }
            globalReunioesTotal += s.reunioes;
            if (globalReunioesMeta === 0) {
              globalReunioesMeta += s.metaReunioes;
            }

            sellersResult.push({
              id: s.id,
              name: s.name,
              avatarUrl: s.avatarUrl,
              role: s.role,
              propostas: s.propostas,
              reunioes: s.reunioes,
              metaPropostas: s.metaPropostas,
              metaReunioes: s.metaReunioes,
              propostasPct,
              reunioesPct,
              avgPct
            });
          });

          // Sort by avgPct descending
          sellersResult.sort((a, b) => b.avgPct - a.avgPct);

          // Calculate global percentages
          // UX: percentuais sem casas decimais (ex.: "6%")
          const globalPropostasPct = globalPropostasMeta > 0 ? Math.min(100, Number(((globalPropostasTotal / globalPropostasMeta) * 100).toFixed(0))) : 0;
          const globalReunioesPct = globalReunioesMeta > 0 ? Math.min(100, Number(((globalReunioesRealizadas / globalReunioesMeta) * 100).toFixed(0))) : 0;

          state.metasData = {
            global: {
              propostas: { current: globalPropostasTotal, target: globalPropostasMeta, pct: globalPropostasPct },
              reunioes: { 
                current: globalReunioesRealizadas, 
                agendadas: globalReunioesAgendadas,
                target: globalReunioesMeta, 
                pct: globalReunioesPct 
              }
            },
            sellers: sellersResult
          };

          renderMetasSection();
        } catch (e) {
          console.error('Erro ao buscar metas:', e);
        }
      }

      function renderMetasSection() {
        const data = state.metasData;
        if (!data) return;

        // --- KPI: Propostas ---
        const propostasData = data.global.propostas;
        const elPropostasCurrent = document.getElementById('meta-propostas-current');
        const elPropostasTarget = document.getElementById('meta-propostas-target');
        const elPropostasPct = document.getElementById('meta-propostas-pct');
        const elPropostasMissing = document.getElementById('meta-propostas-missing');
        const elPropostasDonut = document.getElementById('meta-propostas-donut');
        const elPropostasDonutVal = document.getElementById('meta-propostas-donut-val');

        if (elPropostasCurrent) elPropostasCurrent.textContent = formatNumber(propostasData.current);
        if (elPropostasTarget) elPropostasTarget.textContent = formatNumber(propostasData.target);
        if (elPropostasPct) elPropostasPct.textContent = `${propostasData.pct}%`;
        if (elPropostasMissing) {
          const missing = Math.max(0, propostasData.target - propostasData.current);
          elPropostasMissing.textContent = missing > 0 ? `Faltam ${formatNumber(missing)} propostas para a meta` : 'Meta atingida!';
        }
        if (elPropostasDonut) {
          const deg = Math.min(360, (propostasData.pct / 100) * 360);
          elPropostasDonut.style.setProperty('--chart-deg', `${deg}deg`);
        }
        if (elPropostasDonutVal) elPropostasDonutVal.textContent = `${propostasData.pct}%`;

        // --- KPI: Reuniões ---
        const reunioesData = data.global.reunioes;
        const elReunioesCurrent = document.getElementById('meta-reunioes-current');
        const elReunioesTarget = document.getElementById('meta-reunioes-target');
        const elReunioesPct = document.getElementById('meta-reunioes-pct');
        const elReunioesMissing = document.getElementById('meta-reunioes-missing');
        const elReunioesDonut = document.getElementById('meta-reunioes-donut');
        const elReunioesDonutVal = document.getElementById('meta-reunioes-donut-val');

        if (elReunioesCurrent) {
          elReunioesCurrent.textContent = formatNumber(reunioesData.current);
        }
        if (elReunioesTarget) elReunioesTarget.textContent = formatNumber(reunioesData.target);
        if (elReunioesPct) elReunioesPct.textContent = `${reunioesData.pct}%`;
        if (elReunioesMissing) {
          const missing = Math.max(0, reunioesData.target - reunioesData.current);
          elReunioesMissing.textContent = missing > 0 ? `Faltam ${formatNumber(missing)} reuniões para a meta` : 'Meta atingida!';
        }
        if (elReunioesDonut) {
          const deg = Math.min(360, (reunioesData.pct / 100) * 360);
          elReunioesDonut.style.setProperty('--chart-deg', `${deg}deg`);
        }
        if (elReunioesDonutVal) elReunioesDonutVal.textContent = `${reunioesData.pct}%`;

        // --- Subtitle ---
        const elSubtitle = document.getElementById('metas-team-subtitle');
        if (elSubtitle) {
          elSubtitle.textContent = `Progresso proporcional dos ${data.sellers.length} vendedores`;
        }

        // --- Table ---
        const tableEl = document.getElementById('metas-team-table');
        if (!tableEl) return;

        if (data.sellers.length === 0) {
          tableEl.innerHTML = '<div class="text-center text-muted p-4">Nenhum vendedor encontrado</div>';
          return;
        }

        let html = '';
        data.sellers.forEach((seller, idx) => {
          const rank = idx + 1;
          const rankClass = rank <= 3 ? `rank-${rank}` : '';
          const avatarSrc = seller.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(seller.name) + '&background=e2e8f0&color=64748b';

          html += `
            <div class="metas-team-row">
              <div class="metas-seller-col">
                <div class="metas-seller-rank ${rankClass}">${rank}</div>
                <img src="${avatarSrc}" alt="${seller.name}" class="metas-seller-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(seller.name)}&background=e2e8f0&color=64748b'">
                <div class="metas-seller-info">
                  <div class="metas-seller-name">${seller.name}</div>
                  <div class="metas-seller-role">${seller.role}</div>
                </div>
              </div>
              <div class="metas-progress-col">
                <div class="metas-progress-row">
                  <div class="metas-progress-bar-bg">
                    <div class="metas-progress-bar-fill metas-progress-bar-fill--blue" style="width: ${seller.propostasPct}%"></div>
                  </div>
                  <div class="metas-progress-pct metas-progress-pct--blue">${seller.propostasPct}%</div>
                </div>
                <div class="metas-progress-row">
                  <div class="metas-progress-bar-bg">
                    <div class="metas-progress-bar-fill metas-progress-bar-fill--green" style="width: ${seller.reunioesPct}%"></div>
                  </div>
                  <div class="metas-progress-pct metas-progress-pct--green">${seller.reunioesPct}%</div>
                </div>
              </div>
              <div class="metas-media-col">
                <div class="metas-media-val">${Number.isFinite(seller.avgPct) ? seller.avgPct.toFixed(0) : '--'}%</div>
              </div>
            </div>
          `;
        });

        tableEl.innerHTML = html;

        // Refresh Lucide icons
        try { lucide.createIcons(); } catch (e) {}
      }

      async function fetchData() {
         // 1) Investimento Mkt precisa vir antes para CAC/ROAS e KPI saírem corretos.
         await fetchMarketingSpend();

         // 1.1) Best-effort: detectar se `compras.is_test` existe para filtrar compras de teste sem quebrar.
         try { await ensureComprasIsTestSupport(); } catch (e) {}

         const tasks = [
             fetchRevenue(),
             fetchMeetings(),
             fetchMeetingsTab(),
             fetchSLAs(),
             fetchRankingData(),
             fetchFunnelData(),
             fetchConversionRates(),
             fetchChannelData(),
             fetchPipelineData(),
             fetchMetasData()
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
        try { updateStaticUILabels(); } catch (e) {}
        try { initCustomDatePickerUI(); } catch (e) {}

        // Agency select (Todos | MGS | Aceleraí)
        try {
          const sel = document.getElementById('agency-select');
          if (sel) {
            sel.value = state.selectedAgencyId || '';
            try { syncAgencySelectorUI(sel.value || ''); } catch (e) {}
            if (!sel.dataset.bound) {
              sel.dataset.bound = '1';
              sel.addEventListener('change', (e) => {
                const val = (e && e.target && e.target.value) ? String(e.target.value) : '';
                window.setAgencyFilter(val);
              });
            }
          }
        } catch (e) {}

        // Agency selector pills (Todos | MGS | Aceleraí)
        try {
          const root = document.getElementById('agency-selector');
          if (root && !root.dataset.bound) {
            root.dataset.bound = '1';
            root.addEventListener('click', (e) => {
              try {
                // Robustez (Bubble/DOM): e.target pode ser TextNode e não ter .closest()
                let el = e && e.target ? e.target : null;
                // Sobe até encontrar o botão ou sair do root
                while (el && el !== root) {
                  if (el.classList && el.classList.contains('agency-segment-btn')) break;
                  el = el.parentElement;
                }
                const btn = (el && el !== root && el.classList && el.classList.contains('agency-segment-btn')) ? el : null;
                if (!btn) return;
                const val = btn.dataset ? (btn.dataset.agency || '') : '';
                window.setAgencyFilter(val);
              } catch (err) {
                // best-effort: não quebra o dashboard se algo der errado no clique
              }
            });
          }
          try { syncAgencySelectorUI(state.selectedAgencyId || ''); } catch (e) {}
        } catch (e) {}

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
        renderMetasSection();
        // Importante: NÃO renderizar ApexCharts (Gauge/Revenue) enquanto o dashboard-content está display:none.
        // No Bubble isso pode deixar o gráfico “branco” (container com width=0) e às vezes ele não recupera nem com reload.
        // Vamos renderizar depois que o conteúdo estiver visível (ver abaixo).

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

        // Exibir o dashboard rápido:
        // Antes o skeleton só saía DEPOIS de todas as queries (Promise.all de fetchData),
        // o que deixava o gráfico em branco por muito tempo (ou parecia “não carregar”).
        let revealed = false;
        const revealDashboardContent = () => {
          if (revealed) return;
          revealed = true;

          const skeleton = document.getElementById('dashboard-skeleton');
          const content = document.getElementById('dashboard-content');
          if (skeleton) {
            skeleton.style.transition = 'opacity 0.5s ease';
            skeleton.style.opacity = '0';
            setTimeout(() => {
              skeleton.style.display = 'none';
              if (content) {
                content.style.display = 'block';
                // Force reflow
                void content.offsetWidth;
                content.classList.add('visible');
                // Recalcula tamanhos dos gráficos após exibir (ApexCharts bug fix)
                window.dispatchEvent(new Event('resize'));
                try { scheduleChartsResize('reveal'); } catch (e) {}
              }
            }, 500);
          } else {
            if (content) content.style.display = 'block';
            try { scheduleChartsResize('reveal'); } catch (e) {}
          }
        };

        // Controle de acesso baseado no vendedor logado vindo do Bubble
        try {
          const ok = await initAccessControl();
          if (!ok) return;
        } catch (err) {
          console.error("Erro ao validar acesso:", err);
          return;
        }

        // Mostra UI imediatamente; dados reais entram em background.
        revealDashboardContent();

        // Renderiza os charts APÓS exibir (evita width/height 0 no primeiro paint)
        setTimeout(() => {
          try { renderGauge(); } catch (e) {}
          try { renderRevenue(); } catch (e) {}
          // 2º resize para garantir que Apex recalcule após layout/CSS do Bubble
          try { window.dispatchEvent(new Event('resize')); } catch (e) {}
        }, 0);
        setTimeout(() => {
          try { window.dispatchEvent(new Event('resize')); } catch (e) {}
        }, 800);

        // Carregar dados reais (background) — não bloquear a exibição inicial
        Promise.all([
          // Só líderes precisam carregar a lista completa de executivos
          (access.isLeader ? fetchSellers() : Promise.resolve()),
          fetchDataWithStamp('init')
        ]).catch((err) => {
          console.error("Erro ao carregar dados:", err);
        });
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

        // Garantir que o dropdown de ordenação está sempre ligado ao state
        // (em alguns loads o init pode rodar antes do DOM ter o select pronto).
        try {
          const sel = document.getElementById('ranking-sort');
          if (sel) {
            sel.value = state.rankingSort || 'score';
            if (!sel.dataset.bound) {
              sel.dataset.bound = '1';
              sel.onchange = () => {
                state.rankingSort = sel.value || 'score';
                renderRanking();
              };
            }
          }
        } catch (e) {}

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
            if (key === 'sales') return toNum(obj.salesCount); // quantidade de vendas
            if (key === 'revenue') return toNum(obj.sales); // faturamento total (R$)
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

        // Mostrar TODOS os executivos no ranking (sem cortar top-3).
        const visibleRanking = sortedRanking;

        if (countEl) countEl.innerText = `${visibleRanking.length}`;

        c.innerHTML = visibleRanking.map((r, index) => {
            const rank = index + 1;
            const scoreDisplay = r.avgScore !== '-' ? r.avgScore : '--'; 
            const scoreVal = r.avgScore !== '-' ? parseFloat(r.avgScore) : 0; 
            const displayName = r.name || 'Executivo';
            const avatarUrl = (r && r.avatarUrl) ? String(r.avatarUrl).replace(/\"/g, '&quot;') : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
            
            const roles = ["Senior Sales Executive", "Sales Executive", "Account Executive"];
            const role = roles[index % roles.length];

            return `
          <div class="rank-card" style="padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 6px; background: var(--bg-card); box-shadow: var(--shadow-sm);">
            <div class="rank-card-header" style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <div class="rank-user-info" style="display: flex; align-items: center; gap: 8px;">
                    <div class="rank-avatar-wrapper" style="width: 28px; height: 28px; position: relative;">
                        <img src="${avatarUrl}" class="rank-avatar" alt="${escapeHtmlLite(displayName)}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--bg-subtle);">
                        <div class="rank-badge rank-${rank <= 3 ? rank : 'other'}" style="position: absolute; width: 12px; height: 12px; font-size: 8px; border: 2px solid var(--bg-card); bottom: -2px; right: -2px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">${rank}</div>
                    </div>
                    <div class="rank-details">
                        <div class="rank-name" style="font-size: 12px; font-weight: 600; color: var(--text-main); line-height: 1.2;">${displayName}</div>
                        <div class="rank-role" style="font-size: 9px; color: var(--text-muted); font-weight: 400;">${role}</div>
                    </div>
                </div>
                <div class="rank-score-box">
                    <div class="rank-score-val" style="font-size: 14px; font-weight: 700; color: var(--col-success); letter-spacing: -0.02em; display: flex; align-items: center; gap: 3px; opacity: 0.9;">
                      ${scoreDisplay}
                      <i data-lucide="star" size="10" style="color: #eab308; opacity: 0.8; stroke-width: 2.5px;"></i>
                    </div>
                </div>
            </div>
            
            <div class="rank-separator" style="height: 2px; background: var(--bg-subtle); border-radius: 2px; margin-bottom: 8px; overflow: hidden;">
                <div class="rank-separator-fill" style="width: ${scoreVal}%; height: 100%; background: var(--col-primary); border-radius: 2px;"></div>
            </div>
            
            <div class="rank-metrics" style="display: flex; gap: 4px; margin-bottom: 6px;">
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 2px; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                    <div class="rank-metric-val" style="color:var(--col-primary); font-weight: 700; font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="file-text" size="10"></i> ${r.proposals || 0}
                    </div>
                    <div class="rank-metric-label" style="font-size: 8px; color: var(--text-muted); font-weight: 500;">Propostas</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 2px; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                    <div class="rank-metric-val" style="color:var(--text-muted); font-weight: 700; font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="users" size="10"></i> ${r.meetings || 0}
                    </div>
                    <div class="rank-metric-label" style="font-size: 8px; color: var(--text-muted); font-weight: 500;">Reuniões</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 2px; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                    <div class="rank-metric-val" style="color:var(--col-success); font-weight: 700; font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="zap" size="10"></i> ${Number.isFinite(Number(r.salesCount)) ? Number(r.salesCount) : 0}
                    </div>
                    <div class="rank-metric-label" style="font-size: 8px; color: var(--text-muted); font-weight: 500;">Vendas</div>
                </div>
                <div class="rank-metric-pill" style="flex: 1; background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 2px; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                    <div class="rank-metric-val" style="color:var(--col-success); font-weight: 700; font-size: 11px; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="dollar-sign" size="10"></i> ${(typeof r.sales === 'number' && r.sales > 0) ? formatCurrencyCompact(r.sales) : '--'}
                    </div>
                    <div class="rank-metric-label" style="font-size: 8px; color: var(--text-muted); font-weight: 500;">Faturamento</div>
                </div>
            </div>
            
            <div class="rank-footer" style="display: flex; gap: 10px; font-size: 9px; color: var(--text-muted);">
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 2px;">
                    <i data-lucide="clock" size="9"></i> Ciclo: <span style="font-weight: 600; color: var(--text-main);">${r.avgCycle !== '-' ? Math.round(r.avgCycle)+'d' : '--'}</span>
                </div>
                <div class="rank-footer-item" style="display: flex; align-items: center; gap: 2px;">
                    <i data-lucide="timer" size="9" style="color:var(--col-primary)"></i> FRT: <span style="font-weight: 600; color: var(--text-main);">${r.avgFRT !== '-' ? r.avgFRT+'min' : '--'}</span>
                </div>
            </div>
          </div>
        `}).join('');
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      function renderFunnel(data) {
        const container = document.getElementById('funnel-bars');
        if (!container) return;
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-xs text-muted text-center p-4">Carregando funil...</div>';
            return;
        }

        const maxVal = Math.max(...data.map(d => d.v)) || 1;
        const steps = data.length;
        const svgWidth = 500;
        const svgHeight = 100;
        const sectionWidth = svgWidth / steps;

        // Calcular pontos Y para cada etapa (o funil afunila de cima para baixo, da esquerda para direita)
        // Primeira etapa: y pequeno (topo), última etapa: y grande (fundo)
        const yPoints = data.map((d, idx) => {
          // Inverter: primeiro item tem y pequeno, último tem y grande
          const ratio = 1 - (d.v / maxVal);
          return Math.max(5, ratio * 85); // y varia de 5 (topo) a ~90 (fundo)
        });
        // Adicionar ponto final
        yPoints.push(95);

        // Gerar o path do SVG (curva horizontal que afunila da esquerda para direita)
        // M 0,{y0} -> início no topo-esquerda
        // Curvas suaves até o final
        // L svgWidth,100 L 0,100 Z -> fecha o path na base
        let pathD = `M 0,${yPoints[0]} `;
        for (let i = 0; i < steps; i++) {
          const xStart = i * sectionWidth;
          const xEnd = (i + 1) * sectionWidth;
          const yStart = yPoints[i];
          const yEnd = yPoints[i + 1];
          
          // Curva de Bézier suave
          const cpX = xStart + (xEnd - xStart) / 2;
          pathD += `C ${cpX},${yStart} ${cpX},${yEnd} ${xEnd},${yEnd} `;
        }
        pathD += `L ${svgWidth},${svgHeight} L 0,${svgHeight} Z`;

        // Linhas verticais brancas separando as seções
        let lines = '';
        for (let i = 1; i < steps; i++) {
          const x = i * sectionWidth;
          const yAtX = yPoints[i];
          // Linha vertical do topo do funil até a base
          lines += `<line x1="${x}" y1="${yAtX}" x2="${x}" y2="${svgHeight}" stroke="white" stroke-width="2" stroke-opacity="0.6" />`;
        }

        const svgHtml = `
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">
            <defs>
              <linearGradient id="funnelHorizontalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.95" />
                <stop offset="50%" stop-color="#60A5FA" stop-opacity="0.7" />
                <stop offset="100%" stop-color="#93C5FD" stop-opacity="0.3" />
              </linearGradient>
            </defs>
            <path d="${pathD}" fill="url(#funnelHorizontalGrad)" />
            ${lines}
          </svg>
        `;

        // Gerar grid de dados (horizontal, abaixo do SVG)
        const dataCells = data.map((d, idx) => {
          // Exibir sempre com 2 casas decimais conforme solicitado (.00)
          const pct = idx === 0 ? '100.00%' : `${d.gc.toFixed(2)}%`;
          return `<div class="funnel-data-cell">
            <div class="funnel-data-value">
              ${formatNumber(d.v)}
              <span class="funnel-data-pct">${pct}</span>
            </div>
            <div class="funnel-data-label">${d.l}</div>
          </div>`;
        }).join('');
        
        container.innerHTML = `
          <div class="funnel-visual-wrapper">
            <div class="funnel-svg-container">
              ${svgHtml}
            </div>
            <div class="funnel-data-grid">
              ${dataCells}
            </div>
          </div>
        `;
          
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      async function fetchFunnelData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        const meetingsRange = getMeetingsDateRange(state.dateFilter);

        // Buscar lista de IDs de diretores para filtrar reuniões (consistência com KPI)
        let directorIds = [];
        try {
          const { data: directors } = await sbClient
            .from('vendedores')
            .select('id')
            .eq('diretorVendas', true);
          directorIds = (directors || []).map(d => d.id).filter(Boolean);
        } catch (e) {}

        // 1. Leads Captados
        let queryCaptados = sbClient.from('leads').select('lead_id', { count: 'exact', head: true });
        queryCaptados = applyAgencyFilterToLeadQuery(queryCaptados);
        queryCaptados = applyCutoffTimestamp(queryCaptados, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) queryCaptados = queryCaptados.eq('vendedorResponsavel', state.selectedSeller);
        const { count: countCaptados } = await queryCaptados;

        // 2. Leads Qualificados = leads com vendedorResponsavel (no período do filtro)
        let queryQualif = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        queryQualif = applyAgencyFilterToLeadQuery(queryQualif);
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
          const propsFiltered = await filterRowsByAgencyViaLeadId((props || []), (p) => p && p.id_lead);

          // Filtrar propostas de diretores e contar leads únicos (consistência com KPI)
          const proposedLeadIdsBySeller = {};
          const proposalsNeedingLeadFallback = [];

          (propsFiltered || []).forEach(p => {
            if (!p) return;
            if (p.id_vendedor) {
              // Excluir propostas de diretores (consistência com KPI)
              if (directorIds.includes(p.id_vendedor)) return;
              const sid = String(p.id_vendedor);
              if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
              if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
            } else if (p.id_lead) {
              proposalsNeedingLeadFallback.push(p);
            }
          });

          // Fallback: buscar vendedorResponsavel dos leads sem id_vendedor
          if (proposalsNeedingLeadFallback.length > 0) {
            const leadIds = [...new Set(proposalsNeedingLeadFallback.map(p => p && p.id_lead).filter(Boolean))];
            for (const chunk of chunkArray(leadIds, 500)) {
              let qLeadFallback = sbClient
                .from('leads')
                .select('lead_id, vendedorResponsavel')
                .in('lead_id', chunk);
              qLeadFallback = applyAgencyFilterToLeadQuery(qLeadFallback);
              const { data: leads } = await qLeadFallback;
              (leads || []).forEach(l => {
                if (!l || !l.lead_id || !l.vendedorResponsavel) return;
                // Excluir se vendedorResponsavel é diretor (consistência com KPI)
                if (directorIds.includes(l.vendedorResponsavel)) return;
                const sid = String(l.vendedorResponsavel);
                if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                proposedLeadIdsBySeller[sid].add(String(l.lead_id));
              });
            }
          }

          // Se há filtro de vendedor, contar apenas leads desse vendedor
          if (state.selectedSeller) {
            const sellerLeads = proposedLeadIdsBySeller[state.selectedSeller];
            countPropostas = sellerLeads ? sellerLeads.size : 0;
          } else {
            // Contar leads únicos globalmente
            const allUniqueLeads = new Set();
            Object.values(proposedLeadIdsBySeller).forEach(leadSet => {
              leadSet.forEach(lid => allUniqueLeads.add(lid));
            });
            countPropostas = allUniqueLeads.size;
          }
        } catch (e) {}

        // 4. Reuniões
        let queryReunioes = sbClient.from('agendamento').select('leadId, vendedor').not('leadId', 'is', null);
        queryReunioes = applyCutoffDateYmd(queryReunioes, 'data').gte('data', meetingsRange.startYmd).lte('data', meetingsRange.endYmd);
        queryReunioes = applyMeetingNotCanceledFilter(queryReunioes);
        if (state.selectedSeller) queryReunioes = queryReunioes.eq('vendedor', state.selectedSeller);
        const { data: reunioesRows } = await queryReunioes;
        const reunioesFiltered = await filterRowsByAgencyViaLeadId((reunioesRows || []), (r) => r && r.leadId);
        // Excluir reuniões de diretores (consistência com KPI)
        const reunioesWithoutDirectors = (reunioesFiltered || []).filter(r => !directorIds.includes(r.vendedor));
        const countReunioes = reunioesWithoutDirectors.length;

        // 5. Vendas
        let queryVendas = sbClient
          .from('compras')
          .select('leadid')
          .not('leadid', 'is', null);
        queryVendas = applyApprovedPurchaseFilter(queryVendas);
        queryVendas = applyCutoffTimestamp(queryVendas, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        queryVendas = applyCutoffTimestamp(queryVendas, 'created_at');
        if (state.selectedSeller) queryVendas = queryVendas.eq('vendedoresponsavel', state.selectedSeller);
        const { data: vendasRows } = await queryVendas;
        const vendasFiltered = await filterRowsByAgencyViaLeadId((vendasRows || []), (r) => r && r.leadid);
        const countVendas = (vendasFiltered || []).length;

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
            // Usar 2 casas decimais conforme solicitado
            const conversion = prev > 0 ? Number(((item.v / prev) * 100).toFixed(2)) : 0;
            const globalConversionRaw = total > 0 ? Number(((item.v / total) * 100).toFixed(2)) : 0;
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
        qTotal = applyAgencyFilterToLeadQuery(qTotal);
        qTotal = applyCutoffTimestamp(qTotal, 'created_at').gte('created_at', start).lte('created_at', end);
        if (state.selectedSeller) qTotal = qTotal.eq('vendedorResponsavel', state.selectedSeller);
        const { count: totalLeads } = await qTotal;
        const denom = totalLeads || 0;

        // Taxa 1: leads com vendedorResponsavel / totalLeads
        let qWithSeller = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        qWithSeller = applyAgencyFilterToLeadQuery(qWithSeller);
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
            q = applyAgencyFilterToLeadQuery(q);
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
        // Performance por Canal:
        // - Outbound: leads.canalentrada == "Manual"
        // - Landing Page: leads.canalentrada == "Landing Page"
        // - WhatsApp: leads.canalentrada == "Whatsaap" (enum no BD)
        const CANAL_MANUAL = 'Manual';
        const CANAL_LP = 'Landing Page';
        const CANAL_WPP = 'Whatsaap';

        const norm = (s) => String(s || '').toLowerCase();
        const isManual = (c) => norm(c) === 'manual';
        const isLanding = (c) => norm(c).includes('landing');
        const isWhats = (c) => norm(c).includes('whats');

        const countLeadsByCanal = async (canal) => {
          let q = sbClient
            .from('leads')
            .select('lead_id', { count: 'exact', head: true })
            .eq('canalentrada', canal);
          q = applyAgencyFilterToLeadQuery(q);
          q = applyCutoffTimestamp(q, 'created_at').gte('created_at', start).lte('created_at', end);
          if (state.selectedSeller) q = q.eq('vendedorResponsavel', state.selectedSeller);
          const { count } = await q;
          return count || 0;
        };

        const [leadsOutbound, leadsLP, leadsWPP] = await Promise.all([
          countLeadsByCanal(CANAL_MANUAL),
          countLeadsByCanal(CANAL_LP),
          countLeadsByCanal(CANAL_WPP)
        ]);

        // Receita/Vendas por canal via compras aprovadas + join em leads (FK compras.leadid -> leads.lead_id)
        let qPurch = sbClient
          .from('compras')
          .select('valor_total, vendedoresponsavel, leadid, lead:leadid(canalentrada)')
          .not('leadid', 'is', null);
        qPurch = applyApprovedPurchaseFilter(qPurch);
        qPurch = applyCutoffTimestamp(qPurch, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        qPurch = applyCutoffTimestamp(qPurch, 'created_at');
        if (state.selectedSeller) qPurch = qPurch.eq('vendedoresponsavel', state.selectedSeller);

        const { data: purchRows } = await qPurch;
        const rows = await filterRowsByAgencyViaLeadId((purchRows || []), (r) => r && r.leadid);

        let salesOutbound = 0, salesLP = 0, salesWPP = 0;
        let revOutbound = 0, revLP = 0, revWPP = 0;

        rows.forEach(r => {
          const canal = r && r.lead ? r.lead.canalentrada : null;
          const v = parseCurrency(r && r.valor_total);
          if (isManual(canal)) { salesOutbound++; revOutbound += v; return; }
          if (isLanding(canal)) { salesLP++; revLP += v; return; }
          if (isWhats(canal)) { salesWPP++; revWPP += v; return; }
        });

        const calcROI = (rev, inv) => {
          const i = Number(inv) || 0;
          if (!(i > 0)) return null;
          return ((Number(rev) - i) / i) * 100;
        };

        // --- Gasto por canal (Meta) via campanhaTrafego + filtro por campanha.id ---
        const fetchSpendByCampaignIds = async (campaignIds, startYmd, endYmd) => {
          const ids = (campaignIds || []).map(x => String(x || '').trim()).filter(Boolean);
          if (!ids.length) return 0;
          let total = 0;

          const buildUrl = () => {
            const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
            url.searchParams.set('fields', 'spend');
            url.searchParams.set('limit', '500');
            url.searchParams.set('time_range', JSON.stringify({ since: startYmd, until: endYmd }));
            url.searchParams.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]));
            url.searchParams.set('access_token', META_ACCESS_TOKEN);
            return url;
          };

          let nextUrl = buildUrl().toString();
          while (nextUrl) {
            const res = await fetch(nextUrl, { method: 'GET', mode: 'cors' });
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              throw new Error(`Meta insights(channel) HTTP ${res.status}: ${txt}`);
            }
            const json = await res.json();
            const data = (json && Array.isArray(json.data)) ? json.data : [];
            data.forEach(row => {
              const spend = row && row.spend != null ? Number(String(row.spend).replace(',', '.')) : 0;
              if (Number.isFinite(spend) && spend >= 0) total += spend;
            });
            nextUrl = (json && json.paging && json.paging.next) ? json.paging.next : '';
          }
          return total;
        };

        let spendLP = null;
        let spendWPP = null;
        try {
          let startYmd = toYmdLocal(new Date(start));
          let endYmd = toYmdLocal(new Date(end));
          if (startYmd && endYmd) {
            const eff = applyCutoffToYmdRange(startYmd, endYmd);
            startYmd = eff.startYmd;
            endYmd = eff.endYmd;
          }
          if (startYmd && endYmd && startYmd <= endYmd && META_ACCESS_TOKEN && META_AD_ACCOUNT_ID) {
            const cacheKey = `campSpend|${startYmd}|${endYmd}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`;
            const cache = state.__metaChannelSpendCache;
            if (cache && cache.key === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt) < META_SPEND_CACHE_MS) {
              spendLP = cache.landing;
              spendWPP = cache.whatsapp;
            } else {
              // Landing Page: IDs filtrados por agência
              const idsLP = getMetaCampaignIdsByAgency('landingPage');

              // WhatsApp: buscar da tabela campanhaTrafego e filtrar por agência
              const { data: campRows } = await sbClient
                .from('campanhaTrafego')
                .select('idcampanha, tipocampanha')
                .not('idcampanha', 'is', null);
              const allCampaigns = campRows || [];
              const wppFromTable = allCampaigns
                .filter(r => norm(r && r.tipocampanha).includes('whats'))
                .map(r => r && r.idcampanha);

              // Intersecção: IDs do banco QUE também estão no mapeamento da agência
              const idsWPPByAgency = getMetaCampaignIdsByAgency('whatsapp');
              const idsWPP = idsWPPByAgency.length > 0
                ? wppFromTable.filter(id => idsWPPByAgency.includes(String(id)))
                : wppFromTable;

              spendLP = await fetchSpendByCampaignIds(idsLP, startYmd, endYmd);
              spendWPP = await fetchSpendByCampaignIds(idsWPP, startYmd, endYmd);

              state.__metaChannelSpendCache = {
                key: cacheKey,
                landing: spendLP,
                whatsapp: spendWPP,
                fetchedAt: Date.now()
              };
            }
          }
        } catch (e) {
          console.error('Erro ao buscar gasto por canal (Meta/campanhaTrafego):', e);
        }

        // Atualiza investimento “auto” do canal (mantém inputs existirem; aqui é a fonte de verdade)
        if (typeof spendLP === 'number' && Number.isFinite(spendLP)) state.channelInvestments.landing = spendLP;
        if (typeof spendWPP === 'number' && Number.isFinite(spendWPP)) state.channelInvestments.whatsapp = spendWPP;

        const roiLP = calcROI(revLP, state.channelInvestments.landing);
        const roiWPP = calcROI(revWPP, state.channelInvestments.whatsapp);
        const roiOutbound = calcROI(revOutbound, state.channelInvestments.outbound);

        const convLP = leadsLP > 0 ? ((salesLP / leadsLP) * 100).toFixed(1) : '0.0';
        const convWPP = leadsWPP > 0 ? ((salesWPP / leadsWPP) * 100).toFixed(1) : '0.0';
        const convOutbound = leadsOutbound > 0 ? ((salesOutbound / leadsOutbound) * 100).toFixed(1) : '0.0';

        state.channelData = [
          {
            id: 'landing', n: "Landing Page", l: leadsLP,
            rev: revLP,
            roi: roiLP,
            gasto: (typeof spendLP === 'number' ? spendLP : null),
            conv: convLP,
            i: "globe", c: "primary", active: true, tone: "#3b82f6"
          },
          {
            id: 'whatsapp', n: "WhatsApp", l: leadsWPP,
            rev: revWPP,
            roi: roiWPP,
            gasto: (typeof spendWPP === 'number' ? spendWPP : null),
            conv: convWPP,
            i: "message-circle", c: "success", active: true, tone: "#22c55e"
          },
          {
            id: 'outbound', n: "Outbound", l: leadsOutbound,
            rev: revOutbound,
            roi: roiOutbound,
            gasto: (Number.isFinite(state.channelInvestments.outbound) ? state.channelInvestments.outbound : null),
            conv: convOutbound,
            i: "phone", c: "danger", active: true, tone: "#f97316"
          },
          {
            id: 'social', n: "Social", l: 0,
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
            .select('id, nome, perfil_img')
            .eq('usuarioInterno', false)
            .order('nome');
          if (sellersErr) console.error('[pipeline] erro vendedores:', sellersErr);

          const sellerIdToName = {};
          const sellerIdToAvatar = {};
          (sellersDb || []).forEach(s => {
            if (!s || !s.id) return;
            sellerIdToName[s.id] = s.nome || String(s.id);
            if (s.perfil_img) sellerIdToAvatar[s.id] = s.perfil_img;
          });
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
          const meetingsRowsFiltered = await filterRowsByAgencyViaLeadId((meetingsRows || []), (m) => m && m.leadId);

          const leadMeet = {}; // leadId -> { meetingAt: Date, sellerId: uuid }
          (meetingsRowsFiltered || []).forEach(m => {
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
              q = applyAgencyFilterToLeadQuery(q);
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

          // 4) Proposta -> Fechamento (agora âncora por compras.data_compra, compras aprovadas)
          let qClose = sbClient
            .from('compras')
            .select('leadid, data_compra, vendedoresponsavel, valor_total')
            .not('leadid', 'is', null);
          qClose = applyApprovedPurchaseFilter(qClose);
          qClose = applyCutoffTimestamp(qClose, 'data_compra').gte('data_compra', start).lte('data_compra', end);
          qClose = applyCutoffTimestamp(qClose, 'created_at');
          if (state.selectedSeller) qClose = qClose.eq('vendedoresponsavel', state.selectedSeller);

          const { data: closedRowsRaw, error: closeErr } = await qClose;
          if (closeErr) console.error('[pipeline] erro compras(fechamento):', closeErr);
          const closedRows = await filterRowsByAgencyViaLeadId((closedRowsRaw || []), (r) => r && r.leadid);

          const closedLeads = (closedRows || []).filter(r => r && r.leadid && r.data_compra);
          const closedLeadIds = closedLeads.map(r => r.leadid);

          const closeAtByLead = {};
          let minCloseAt = null;
          let maxCloseAt = null;
          closedLeads.forEach(r => {
            const dt = new Date(r.data_compra);
            if (Number.isNaN(dt.getTime())) return;
            closeAtByLead[r.leadid] = dt;
            if (!minCloseAt || dt.getTime() < minCloseAt.getTime()) minCloseAt = dt;
            if (!maxCloseAt || dt.getTime() > maxCloseAt.getTime()) maxCloseAt = dt;
            // garante bucket do responsável (mesmo se ainda não tiver dados de reunião)
            ensureAgg(r.vendedoresponsavel || null);
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
            const leadId = r.leadid;
            const sellerId = r.vendedoresponsavel || null;
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
              avatarUrl: sellerIdToAvatar[sellerId] || null,
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
          const gasto = ch.gasto != null ? (ch.gasto >= 1000000 ? 'R$ ' + (ch.gasto / 1000000).toFixed(2).replace('.', ',') + 'M' : ch.gasto >= 1000 ? 'R$ ' + (ch.gasto / 1000).toFixed(2).replace('.', ',') + 'k' : 'R$ ' + ch.gasto.toFixed(2).replace('.', ',')) : '--';
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
                  <img class="pipeline-avatar" src="${(r && r.avatarUrl) ? String(r.avatarUrl).replace(/\"/g, '&quot;') : ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(r.name))}" alt="${escapeHtmlLite(r.name)}">
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
                    <img class="pipeline-avatar" src="${(r && r.avatarUrl) ? String(r.avatarUrl).replace(/\"/g, '&quot;') : ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(r.name))}" alt="${escapeHtmlLite(r.name)}">
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

        // Título do velocímetro: segue o filtro do header
        try {
          const monthLabelEl = document.getElementById('gauge-month-label');
          if (monthLabelEl) {
            if (state.dateFilter === 'month') {
              const now = new Date();
              const month = now.toLocaleDateString('pt-BR', { month: 'long' });
              const monthCap = month ? (month.charAt(0).toUpperCase() + month.slice(1)) : '';
              monthLabelEl.textContent = monthCap ? `Meta de ${monthCap}` : 'Meta do mês';
            } else {
              monthLabelEl.textContent = 'Meta do período';
            }
          }
        } catch (e) {}

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
          trendTextEl.textContent = (isPositive ? '+' : '') + Math.abs(trendVariation).toFixed(1) + '% vs período anterior';

          // Update icon
          trendIconEl.setAttribute('data-lucide', trendIcon);
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // 3. Current / Target values
        const currentEl = document.getElementById('gauge-current');
        const targetEl = document.getElementById('gauge-target');
        if (currentEl) currentEl.textContent = formatCurrencyCompact(currentRevenue);
        if (targetEl) {
          const hide = !!(state && state.gaugeHideTarget === true);
          targetEl.textContent = hide ? '--' : formatCurrencyCompact(targetRevenue);
        }

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
        if (val >= 1000000) return 'R$ ' + (val / 1000000).toFixed(2) + 'M';
        if (val >= 1000) return 'R$ ' + (val / 1000).toFixed(2) + 'k';
        return formatCurrency(val);
      }

      function renderRevenue(chartData) {
        const chartEl = document.querySelector("#revenue-chart");
        if(!chartEl) return;
        // IMPORTANTE:
        // - Não destruir/recriar o chart em todo refresh (isso causa “piscar” no Bubble).
        // - Preferir updateSeries/updateOptions quando já existe.
        
        const isDark = state.theme === 'dark';
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const labelColor = isDark ? '#94a3b8' : '#64748b';

        // IMPORTANTÍSSIMO (Bubble/web):
        // Não use clientHeight aqui porque o ApexCharts pode influenciar a altura interna do container e,
        // ao re-renderizar (ex.: trocar Hoje/Semana/Mês), isso vira um loop de crescimento do card.
        // Em vez disso, usamos a altura do CSS computado (ex.: #revenue-chart { height: 320px !important; }).
        const chartHeight = (() => {
          try {
            const mq = (typeof window !== 'undefined' && window.matchMedia)
              ? window.matchMedia('(min-width: 1200px)')
              : null;
            return (mq && mq.matches) ? 340 : 320;
          } catch (e) {
            return 320;
          }
        })();

        // Copiar arrays localmente para podermos “pad” quando o range é muito curto (ex.: hoje / semana na segunda)
        // ApexCharts frequentemente não desenha line/area quando há apenas 1 ponto.
        let categories = chartData ? [...(chartData.categories || [])] : ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        let rawDates = chartData ? (chartData.rawDates ? [...chartData.rawDates] : null) : null;
        const isYearly = chartData ? chartData.isYearly : false;

        let seriesDataLocal = chartData ? [...(chartData.seriesData || [])] : [0, 0, 0, 0];
        let seriesMetaLocal = chartData ? [...(chartData.seriesMeta || [])] : [0, 0, 0, 0];
        let seriesLastYearLocal = chartData ? [...(chartData.seriesLastYear || [])] : null;
        const seriesLastYearName = (chartData && chartData.seriesLastYearName) ? String(chartData.seriesLastYearName) : 'Ano passado';

        // Padrão `dashboard_tela`:
        // - Realizado segue ATÉ o dia atual (mesmo sem compra no dia), e após o dia atual corta (null).
        // Isso evita o gráfico parecer "1 dia atrasado".
        const extendRealizadoToToday = (arr) => {
          try {
            if (!Array.isArray(arr) || arr.length === 0) return arr;
            const todayKey = formatYmdLocal(new Date());
            const todayIdx = (rawDates && Array.isArray(rawDates) && todayKey) ? rawDates.indexOf(todayKey) : -1;
            if (todayIdx < 0) return arr; // sem referência de hoje no eixo

            // último valor conhecido até hoje (acumulado)
            let lastVal = null;
            for (let i = todayIdx; i >= 0; i--) {
              const v = arr[i];
              const vn = (typeof v === 'number') ? v : parseFloat(String(v));
              if (Number.isFinite(vn)) { lastVal = vn; break; }
            }
            if (lastVal === null) lastVal = 0;

            const out = arr.map((v, idx) => {
              if (idx > todayIdx) return null; // corta após hoje
              const vn = (typeof v === 'number') ? v : parseFloat(String(v));
              return Number.isFinite(vn) ? vn : lastVal; // estende até hoje
            });

            // Apex às vezes não desenha com apenas 1 ponto; garantir 2 pontos mínimos se possível
            if (out.length >= 2 && out[0] !== null && out[1] === null) out[1] = out[0];
            return out;
          } catch (e) {
            return arr;
          }
        };
        seriesDataLocal = extendRealizadoToToday(seriesDataLocal);

        // Garantir mínimo de 2 pontos
        if (categories.length === 1 && seriesDataLocal.length === 1 && seriesMetaLocal.length === 1) {
          const onlyCat = categories[0];
          categories.push(''); // não poluir labels
          seriesDataLocal.push(seriesDataLocal[0]);
          seriesMetaLocal.push(seriesMetaLocal[0]);
          if (Array.isArray(seriesLastYearLocal) && seriesLastYearLocal.length === 1) {
            seriesLastYearLocal.push(seriesLastYearLocal[0]);
          }
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

        // Exibir todos os dias do mês quando o range é diário e curto (<= 35 pontos).
        // Para ranges muito longos, mantém a redução de labels para legibilidade.
        let displayCategories = categories;
        if (isDaily && rawDates && categories.length > 35 && firstWednesdayIndex !== null && firstWednesdayIndex !== -1) {
          displayCategories = categories.map((c, idx) => ((idx - firstWednesdayIndex) % 7 === 0 ? c : ''));
        }

        // Incluir séries:
        // - Realizado (ano atual)
        // - Ano passado (mesmo mês, alinhado por dia) — adicional
        // - Meta (steps) — pode iniciar oculta/visível conforme regra/ação do usuário
        const series = [
          { name: "Realizado", data: seriesDataLocal }
        ];
        const hasLastYear = Array.isArray(seriesLastYearLocal) && seriesLastYearLocal.length > 0;
        if (hasLastYear) {
          // pad para bater com o número de categorias (evita crash quando faltam pontos)
          while (seriesLastYearLocal.length < seriesDataLocal.length) {
            seriesLastYearLocal.push(seriesLastYearLocal[seriesLastYearLocal.length - 1] || 0);
          }
          series.push({ name: seriesLastYearName, data: seriesLastYearLocal });
        }
        series.push({ name: "Meta", data: seriesMetaLocal });

        // Projeção (Run Rate) — apenas modos month e year
        const mode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month';
        let seriesProjecaoLocal = chartData ? (chartData.seriesProjecao ? [...chartData.seriesProjecao] : null) : null;
        const hasProjecao = (mode === 'month' || mode === 'year') && Array.isArray(seriesProjecaoLocal) && seriesProjecaoLocal.length > 0;
        if (hasProjecao) {
          while (seriesProjecaoLocal.length < seriesDataLocal.length) {
            seriesProjecaoLocal.push(seriesProjecaoLocal[seriesProjecaoLocal.length - 1] || 0);
          }
          series.push({ name: "Projeção", data: seriesProjecaoLocal });
        }

        // X axis em datetime (necessário para zoom/seleção)
        const axisCategories = (() => {
          const keys = Array.isArray(rawDates) ? rawDates : [];
          return keys.map((k) => {
            try {
              if (!k) return null;
              if (isYearly) {
                // YYYY-MM => 1º dia do mês (meio-dia local para evitar DST)
                return new Date(`${k}-01T12:00:00`).getTime();
              }
              // YYYY-MM-DD => meio-dia local (evita deslocamento de timezone)
              return new Date(`${k}T12:00:00`).getTime();
            } catch (e) {
              return null;
            }
          });
        })();

        const getDefaultIdx = () => {
          try {
            if (rawDates && Array.isArray(rawDates) && rawDates.length > 0 && !isYearly) {
              const todayKey = formatYmdLocal(new Date());
              const idx = rawDates.indexOf(todayKey);
              if (idx >= 0) return idx;
              return rawDates.length - 1;
            }
            // Em Ano/Semestre (mensal), foca no último ponto
            if (rawDates && Array.isArray(rawDates) && rawDates.length > 0) return rawDates.length - 1;
            return 0;
          } catch (e) {
            return 0;
          }
        };

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

        const revenueYAxisLabelsFormatter = (value) => {
          const n = (typeof value === 'number') ? value : parseFloat(String(value));
          if (!Number.isFinite(n)) return '';
          if (n >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1) + 'M';
          if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(0) + 'k';
          return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
        };

        // Calcula formato do eixo X baseado no range de zoom
        const getXAxisFormat = (zoomMin, zoomMax, isYearlyDefault) => {
          if (!zoomMin || !zoomMax) return isYearlyDefault ? 'monthly' : 'daily';
          const diffMs = zoomMax - zoomMin;
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays > 180) return 'monthly';
          if (diffDays > 60) return 'weekly';
          return 'daily';
        };

        const buildRevenueYAxis = (showReal, showLy, showMeta, showProj) => {
          const r = computeRevenueYRange(showReal, showLy, showMeta, showProj);
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

        // Calcula yMin otimizado para zoom baseado no Realizado (permite ver variacao)
        const computeZoomYRange = (zoomMin, zoomMax) => {
          try {
            const inRange = (idx) => {
              const ts = axisCategories[idx];
              return ts && ts >= zoomMin && ts <= zoomMax;
            };
            // Pega valores no range de zoom
            const realVals = seriesDataLocal.filter((_, i) => inRange(i)).map(v => typeof v === 'number' ? v : parseFloat(v)).filter(v => Number.isFinite(v) && v > 0);
            const lyVals = (hasLastYear ? seriesLastYearLocal : []).filter((_, i) => inRange(i)).map(v => typeof v === 'number' ? v : parseFloat(v)).filter(v => Number.isFinite(v));
            const metaVals = seriesMetaLocal.filter((_, i) => inRange(i)).map(v => typeof v === 'number' ? v : parseFloat(v)).filter(v => Number.isFinite(v));
            
            if (realVals.length === 0) return { yMin: undefined, yMax: undefined };
            
            // Min: baseado no minimo do Realizado com margem de 10%
            const realMin = Math.min(...realVals);
            const allMax = Math.max(...realVals, ...lyVals, ...metaVals);
            
            // yMin = 90% do minimo do Realizado (para dar espaco visual)
            const yMin = Math.max(0, realMin * 0.9);
            // yMax = 105% do maximo de todas as series
            const yMax = allMax * 1.05;
            
            return { yMin, yMax };
          } catch (e) {
            return { yMin: undefined, yMax: undefined };
          }
        };

        const applyRevenueYAxis = (chartContext) => {
          try {
            const showRealNow = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Realizado);
            const showLyNow = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.AnoPassado) && hasLastYear;
            const showMetaNow = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Meta);
            const showProjNow = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Projecao) && hasProjecao;
            chartContext.updateOptions({ yaxis: buildRevenueYAxis(showRealNow, showLyNow, showMetaNow, showProjNow) }, false, true);
          } catch (e) {}
        };

        // Por padrão, otimiza escala olhando só Realizado; se Meta estiver visível, inclui Meta no range.
        const computeRevenueYRange = (showReal, showLy, showMeta, showProj) => {
          let yMin = undefined;
          let yMax = undefined;
          try {
            const valsReal = (showReal && Array.isArray(seriesDataLocal) ? seriesDataLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const valsLastYear = (showLy && Array.isArray(seriesLastYearLocal) ? seriesLastYearLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const valsProj = (showProj && Array.isArray(seriesProjecaoLocal) ? seriesProjecaoLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const valsMeta = (showMeta && Array.isArray(seriesMetaLocal) ? seriesMetaLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const vals = [...valsReal, ...valsLastYear, ...valsMeta, ...valsProj];
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

        const showReal = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Realizado);
        const showLy = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.AnoPassado) && hasLastYear;
        const showMeta = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Meta);
        const showProj = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Projecao) && hasProjecao;
        const initialRange = computeRevenueYRange(showReal, showLy, showMeta, showProj);
        let yMin = initialRange.yMin;
        let yMax = initialRange.yMax;

        // --- Linha de corte do dia (mensal) + caixa fixa (padrão dashboard_tela) ---
        // Objetivo:
        // - desenhar uma linha vertical tracejada no "dia atual"
        // - exibir uma caixinha fixa com Realizado / Ano passado / Meta no dia atual
        const ensureFocusBox = () => {
          try {
            if (!(state && state.revenueChartShowTodayMarker)) return null;
            // Esconder quando zoom ativo (dia atual pode estar fora do range)
            if (state && state.revenueChartZoom) {
              const box = document.getElementById('revenue-focus-box-tv');
              if (box) box.style.display = 'none';
              return null;
            }
            const parent = chartEl;
            try { if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) {}
            let box = document.getElementById('revenue-focus-box-tv');
            if (!box) {
              box = document.createElement('div');
              box.id = 'revenue-focus-box-tv';
              box.style.position = 'absolute';
              box.style.top = '60px';
              box.style.right = '12px';
              box.style.zIndex = '6';
              box.style.padding = '8px 10px';
              box.style.borderRadius = '10px';
              box.style.border = '1px solid rgba(148,163,184,0.35)';
              box.style.background = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.96)';
              box.style.color = isDark ? '#e2e8f0' : '#0f172a';
              box.style.fontSize = '12px';
              box.style.boxShadow = '0 8px 24px rgba(15,23,42,0.15)';
              box.style.pointerEvents = 'none';
              box.style.minWidth = '160px';
              box.style.maxWidth = '220px';
              box.style.backdropFilter = 'blur(6px)';
              box.style.whiteSpace = 'normal';
              parent.appendChild(box);
            } else {
              if (box.parentElement !== parent) {
                try { parent.appendChild(box); } catch (e) {}
              }
            }
            return box;
          } catch (e) {
            return null;
          }
        };

        // Formato compacto (para modo anual)
        const fmtMoneyCompact = (v) => {
          try {
            const n = (typeof v === 'number') ? v : parseFloat(String(v));
            if (!Number.isFinite(n)) return '--';
            if (n >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1) + 'M';
            if (n >= 1000) return 'R$ ' + (n / 1000).toFixed(0) + 'k';
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
          } catch (e) {
            return '--';
          }
        };

        // Formato inteiro (para modo mensal)
        const fmtMoneyFull = (v) => {
          try {
            const n = (typeof v === 'number') ? v : parseFloat(String(v));
            if (!Number.isFinite(n)) return '--';
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n));
          } catch (e) {
            return '--';
          }
        };

        // Usa formato baseado no modo (anual = compacto, mensal = inteiro)
        const fmtMoney = (v) => isYearly ? fmtMoneyCompact(v) : fmtMoneyFull(v);

        const updateFocusBoxAtIndex = (idx, chartCtx = null) => {
          const box = ensureFocusBox();
          if (!box) return;
          try {
            const n = categories ? categories.length : 0;
            const safeIdx = Math.max(0, Math.min((n || 1) - 1, Number(idx) || 0));
            const cat = (categories && categories[safeIdx] !== undefined) ? categories[safeIdx] : '';
            const real = seriesDataLocal && seriesDataLocal[safeIdx] !== undefined ? seriesDataLocal[safeIdx] : null;
            const ly = (hasLastYear && Array.isArray(seriesLastYearLocal)) ? seriesLastYearLocal[safeIdx] : null;
            const meta = seriesMetaLocal && seriesMetaLocal[safeIdx] !== undefined ? seriesMetaLocal[safeIdx] : null;
            const lyLabel = (seriesLastYearName || 'Ano passado');

            const dot = (c) => `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${c};"></span>`;
            const lastReal = (() => {
              try {
                const arr = Array.isArray(seriesDataLocal) ? seriesDataLocal : [];
                for (let i = arr.length - 1; i >= 0; i--) {
                  const vn = (typeof arr[i] === 'number') ? arr[i] : parseFloat(String(arr[i]));
                  if (Number.isFinite(vn)) return vn;
                }
              } catch (e) {}
              return null;
            })();

            box.innerHTML = `
              <div style="font-weight:700; margin-bottom:6px; font-size:13px;">${String(cat || '--')}</div>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <span style="display:flex; align-items:center; gap:4px; font-size:12px;">${dot('#3b82f6')} Realizado</span>
                  <b style="font-size:12px;">${fmtMoney(lastReal)}</b>
                </div>
                ${hasLastYear ? `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <span style="display:flex; align-items:center; gap:4px; font-size:12px;">${dot('#ef4444')} ${lyLabel}</span>
                  <b style="font-size:12px;">${fmtMoney(ly)}</b>
                </div>
                ` : ``}
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <span style="display:flex; align-items:center; gap:4px; font-size:12px;">${dot('#10b981')} Meta</span>
                  <b style="font-size:12px;">${fmtMoney(meta)}</b>
                </div>
              </div>
            `;

            // posicionar acima do ponto (aproximação via grid do Apex)
            try {
              const w = chartEl.clientWidth || 0;
              const h = chartEl.clientHeight || 0;
              if (w < 30 || h < 30) {
                setTimeout(() => { try { updateFocusBoxAtIndex(safeIdx, chartCtx); } catch (e) {} }, 120);
                return;
              }

              let gridX = 0, gridY = 0, gridW = w, gridH = h;
              if (chartCtx && chartCtx.w && chartCtx.w.globals) {
                const g = chartCtx.w.globals;
                const gx = Number(g.gridX), gy = Number(g.gridY), gw = Number(g.gridWidth), gh = Number(g.gridHeight);
                if (Number.isFinite(gx)) gridX = gx;
                if (Number.isFinite(gy)) gridY = gy;
                if (Number.isFinite(gw) && gw > 0) gridW = gw;
                if (Number.isFinite(gh) && gh > 0) gridH = gh;
              }

              const denom = Math.max(1, n - 1);
              const ratio = denom > 0 ? (safeIdx / denom) : 0;
              const xLocal = gridX + (gridW * ratio);

              let v = null;
              const candidates = [real, ly, meta]
                .map(x => (typeof x === 'number' ? x : parseFloat(String(x))))
                .filter(x => Number.isFinite(x));
              if (candidates.length > 0) v = Math.max(...candidates);
              const yMinLoc = (typeof yMin === 'number') ? yMin : 0;
              const yMaxLoc = (typeof yMax === 'number') ? yMax : null;
              let yLocal = gridY + (gridH * 0.25);
              if (v !== null && yMaxLoc && Number.isFinite(yMaxLoc) && yMaxLoc > yMinLoc) {
                const norm = Math.max(0, Math.min(1, (v - yMinLoc) / (yMaxLoc - yMinLoc)));
                yLocal = gridY + (gridH * (1 - norm));
              }

              const boxH = box.offsetHeight || 96;
              const margin = 14;
              const left = Math.max(margin, Math.min((w - margin), xLocal));
              let top = yLocal - boxH - 14;
              if (top < margin) top = margin;
              box.style.left = `${Math.round(left)}px`;
              box.style.top = `${Math.round(top)}px`;
              box.style.transform = 'translateX(-50%)';
            } catch (e) {}
          } catch (e) {}
        };

        const buildFocusLineAnnotation = () => {
          try {
            if (!(state && state.revenueChartShowTodayMarker)) return {};
            if (state && state.revenueChartZoom) return {}; // esconde quando zoom ativo
            const idx = getDefaultIdx();
            const x = (axisCategories && axisCategories[idx] !== undefined) ? axisCategories[idx] : null;
            if (!Number.isFinite(Number(x))) return {};
            return {
              xaxis: [
                {
                  x: x,
                  borderColor: 'rgba(148,163,184,0.55)',
                  strokeDashArray: 3
                }
              ]
            };
          } catch (e) {
            return {};
          }
        };

        const buildFocusPointAnnotations = () => {
          try {
            if (!(state && state.revenueChartShowTodayMarker)) return [];
            if (state && state.revenueChartZoom) return []; // esconde quando zoom ativo
            const idx = getDefaultIdx();
            const x = (axisCategories && axisCategories[idx] !== undefined) ? axisCategories[idx] : null;
            if (!Number.isFinite(Number(x))) return [];

            const points = [];
            const real = seriesDataLocal && seriesDataLocal[idx] !== undefined ? seriesDataLocal[idx] : null;
            const ly = (hasLastYear && Array.isArray(seriesLastYearLocal)) ? seriesLastYearLocal[idx] : null;
            const meta = seriesMetaLocal && seriesMetaLocal[idx] !== undefined ? seriesMetaLocal[idx] : null;

            const toNum = (v) => {
              const n = (typeof v === 'number') ? v : parseFloat(String(v));
              return Number.isFinite(n) ? n : null;
            };

            const rN = toNum(real);
            const lyN = toNum(ly);
            const mN = toNum(meta);

            // seriesIndex: 0 Realizado, (1 Ano passado se existe), Meta (último)
            const metaSeriesIndex = hasLastYear ? 2 : 1;

            if (rN !== null) {
              points.push({ x: x, y: rN, seriesIndex: 0, marker: { size: 6, fillColor: '#3b82f6', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' } });
            }
            if (hasLastYear && lyN !== null) {
              points.push({ x: x, y: lyN, seriesIndex: 1, marker: { size: 6, fillColor: '#ef4444', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' } });
            }
            if (mN !== null) {
              points.push({ x: x, y: mN, seriesIndex: metaSeriesIndex, marker: { size: 6, fillColor: '#10b981', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' } });
            }
            return points;
          } catch (e) {
            return [];
          }
        };

        // Tooltip: mostrar a “linha do tempo” (data exata do ponto) e o equivalente do ano passado
        const formatTooltipHeaderByIndex = (idx) => {
          try {
            if (!rawDates || !Array.isArray(rawDates) || idx === null || idx === undefined) return '';
            const key = rawDates[idx];
            if (!key) return '';

            // YYYY-MM (anual) - formato: "Dez/26 vs Dez/25"
            if (isYearly) {
              const y = parseInt(String(key).slice(0, 4), 10);
              const m = parseInt(String(key).slice(5, 7), 10);
              if (!Number.isFinite(y) || !Number.isFinite(m)) return String(key);
              const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
              const monthName = monthNames[m - 1] || '';
              const yy = String(y).slice(-2);
              const prevYy = String(y - 1).slice(-2);
              return `${monthName}/${yy} vs ${monthName}/${prevYy}`;
            }

            // YYYY-MM-DD (mensal/diario) - formato: "13/01/26 vs 13/01/25"
            const y = parseInt(String(key).slice(0, 4), 10);
            const m = String(key).slice(5, 7);
            const d = String(key).slice(8, 10);
            if (!d || !m || !Number.isFinite(y)) return String(key);
            const yy = String(y).slice(-2);
            const prevYy = String(y - 1).slice(-2);
            return `${d}/${m}/${yy} vs ${d}/${m}/${prevYy}`;
          } catch (e) {
            return '';
          }
        };

        const chartOptions = {
          series: series,
          chart: {
            type: 'area',
            height: chartHeight,
            fontFamily: 'inherit',
            toolbar: { show: false },
            zoom: { enabled: false },
            background: 'transparent',
            animations: { enabled: true },
            events: {
              mounted: function(chartContext) {
                // Respeitar escolha do usuário (toggles)
                try {
                  if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Meta)) {
                    try { chartContext.hideSeries('Meta'); } catch (e) {}
                  }
                  if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Realizado)) {
                    try { chartContext.hideSeries('Realizado'); } catch (e) {}
                  }
                  if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.AnoPassado)) {
                    const names = chartContext?.w?.globals?.seriesNames || [];
                    const lyName = names.find(n => n && n !== 'Realizado' && n !== 'Meta' && n !== 'Projeção') || null;
                    if (lyName) { try { chartContext.hideSeries(lyName); } catch (e) {} }
                  }
                  if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Projecao)) {
                    try { chartContext.hideSeries('Projeção'); } catch (e) {}
                  }
                } catch (e) {}
                // Linha de corte + caixa fixa no "dia atual"
                try {
                  const idx = getDefaultIdx();
                  setTimeout(() => { try { updateFocusBoxAtIndex(idx, chartContext); } catch (e) {} }, 120);
                } catch (e) {}
              },
              updated: function(chartContext) {
                try {
                  const idx = getDefaultIdx();
                  setTimeout(() => { try { updateFocusBoxAtIndex(idx, chartContext); } catch (e) {} }, 60);
                } catch (e) {}
              },
              selection: function (chartContext, { xaxis }) {
                // Drag-to-zoom sempre habilitado
                try {
                  if (!xaxis) return;
                  const min = Number(xaxis.min);
                  const max = Number(xaxis.max);
                  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
                    state.revenueChartZoom = { min, max };
                    // Recalcular yaxis e xaxis para ajustar escalas ao zoom
                    try {
                      const fmt = getXAxisFormat(min, max, isYearly);
                      // Calcula yMin otimizado baseado no Realizado para ver variacao
                      const zoomRange = computeZoomYRange(min, max);
                      chartContext.updateOptions({
                        xaxis: {
                          labels: {
                            style: { fontSize: '11px', colors: labelColor },
                            hideOverlappingLabels: true,
                            offsetY: 2,
                            formatter: function (value) {
                              try {
                                const d = new Date(Number(value));
                                if (Number.isNaN(d.getTime())) return '';
                                if (fmt === 'monthly') {
                                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                                  const yy = String(d.getFullYear()).slice(-2);
                                  return `${mm}/${yy}`;
                                }
                                const dd = String(d.getDate()).padStart(2, '0');
                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                return `${dd}/${mm}`;
                              } catch (e) { return ''; }
                            }
                          }
                        },
                        yaxis: {
                          min: zoomRange.yMin,
                          max: zoomRange.yMax,
                          decimalsInFloat: 0,
                          forceNiceScale: true,
                          labels: {
                            style: { fontSize: '11px', colors: labelColor },
                            formatter: revenueYAxisLabelsFormatter
                          }
                        }
                      }, false, false);
                    } catch (e) {}
                    // Esconder focusBox quando zoom ativo
                    try {
                      const box = document.getElementById('revenue-focus-box-tv');
                      if (box) box.style.display = 'none';
                    } catch (e) {}
                  }
                } catch (e) {}
              },
              zoomed: function (chartContext, { xaxis }) {
                // Zoom sempre habilitado (scroll wheel só quando toggle ativo)
                try {
                  if (!xaxis) return;
                  const min = Number(xaxis.min);
                  const max = Number(xaxis.max);
                  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
                    state.revenueChartZoom = { min, max };
                    // Recalcular yaxis e xaxis para ajustar escalas ao zoom
                    try {
                      const fmt = getXAxisFormat(min, max, isYearly);
                      // Calcula yMin otimizado baseado no Realizado para ver variacao
                      const zoomRange = computeZoomYRange(min, max);
                      chartContext.updateOptions({
                        xaxis: {
                          labels: {
                            style: { fontSize: '11px', colors: labelColor },
                            hideOverlappingLabels: true,
                            offsetY: 2,
                            formatter: function (value) {
                              try {
                                const d = new Date(Number(value));
                                if (Number.isNaN(d.getTime())) return '';
                                if (fmt === 'monthly') {
                                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                                  const yy = String(d.getFullYear()).slice(-2);
                                  return `${mm}/${yy}`;
                                }
                                const dd = String(d.getDate()).padStart(2, '0');
                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                return `${dd}/${mm}`;
                              } catch (e) { return ''; }
                            }
                          }
                        },
                        yaxis: {
                          min: zoomRange.yMin,
                          max: zoomRange.yMax,
                          decimalsInFloat: 0,
                          forceNiceScale: true,
                          labels: {
                            style: { fontSize: '11px', colors: labelColor },
                            formatter: revenueYAxisLabelsFormatter
                          }
                        }
                      }, false, false);
                    } catch (e) {}
                    // Esconder focusBox quando zoom ativo
                    try {
                      const box = document.getElementById('revenue-focus-box-tv');
                      if (box) box.style.display = 'none';
                    } catch (e) {}
                  }
                } catch (e) {}
              },
              beforeResetZoom: function (chartContext) {
                try { state.revenueChartZoom = null; } catch (e) {}
                // Restaurar yaxis e xaxis originais com formatters
                try {
                  const showReal = !!(state?.revenueChartSeriesVisible?.Realizado);
                  const showLy = !!(state?.revenueChartSeriesVisible?.AnoPassado);
                  const showMeta = !!(state?.revenueChartSeriesVisible?.Meta);
                  chartContext.updateOptions({
                    xaxis: {
                      labels: {
                        style: { fontSize: '11px', colors: labelColor },
                        hideOverlappingLabels: true,
                        offsetY: 2,
                        formatter: function (value) {
                          try {
                            const d = new Date(Number(value));
                            if (Number.isNaN(d.getTime())) return '';
                            if (isYearly) {
                              const mm = String(d.getMonth() + 1).padStart(2, '0');
                              const yy = String(d.getFullYear()).slice(-2);
                              return `${mm}/${yy}`;
                            }
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            return `${dd}/${mm}`;
                          } catch (e) { return ''; }
                        }
                      }
                    },
                    yaxis: buildRevenueYAxis(showReal, showLy, showMeta, showProj)
                  }, false, false);
                } catch (e) {}
                // Mostrar focusBox novamente se toggle ativo
                try {
                  if (state?.revenueChartShowTodayMarker) {
                    const box = document.getElementById('revenue-focus-box-tv');
                    if (box) box.style.display = '';
                  }
                } catch (e) {}
                return undefined;
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
                        applyRevenueYAxis(chartContext);
                        try { syncRevenueControls(); } catch (e) {}
                        // Reposicionar caixa porque yRange pode mudar
                        try { setTimeout(() => { updateFocusBoxAtIndex(getDefaultIdx(), chartContext); }, 80); } catch (e) {}
                      } catch (e) {}
                    }, 0);
                  }
                } catch (e) {}
                return undefined;
              }
            }
          },
          annotations: {
            ...(buildFocusLineAnnotation() || {}),
            points: buildFocusPointAnnotations()
          },
          // Não mostrar bolinhas em todos os pontos; apenas no hover (pontos “fixos” vêm das annotations)
          markers: {
            size: 0,
            strokeWidth: 0,
            hover: { size: 6 }
          },
          // Cores: Realizado (azul), AnoPassado (vermelho), Meta (verde), Projeção (azul claro)
          colors: (() => {
            const baseColors = ['#3b82f6']; // Realizado
            if (hasLastYear) baseColors.push('#ef4444'); // Ano passado
            baseColors.push('#10b981'); // Meta
            if (hasProjecao) baseColors.push('#0ea5e9'); // Projeção
            return baseColors;
          })(),
          // Meta agora tem rampa curta na virada dos ciclos, então pode ser smooth sem "pico" visual
          // Projeção usa dashArray para linha pontilhada
          stroke: {
            curve: Array(series.length).fill('smooth'),
            width: 2,
            dashArray: (() => {
              const arr = [0]; // Realizado: sólida
              if (hasLastYear) arr.push(0); // Ano passado: sólida
              arr.push(0); // Meta: sólida
              if (hasProjecao) arr.push(5); // Projeção: pontilhada
              return arr;
            })()
          },
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
            type: 'datetime',
            categories: axisCategories,
            min: (state && state.revenueChartZoom && Number.isFinite(Number(state.revenueChartZoom.min))) ? Number(state.revenueChartZoom.min) : undefined,
            max: (state && state.revenueChartZoom && Number.isFinite(Number(state.revenueChartZoom.max))) ? Number(state.revenueChartZoom.max) : undefined,
            labels: {
              style: { fontSize: '11px', colors: labelColor },
              hideOverlappingLabels: true,
              offsetY: 2,
              formatter: function (value) {
                try {
                  const d = new Date(Number(value));
                  if (Number.isNaN(d.getTime())) return '';
                  // Calcular formato baseado no zoom ativo
                  const zoomMin = state?.revenueChartZoom?.min;
                  const zoomMax = state?.revenueChartZoom?.max;
                  const fmt = getXAxisFormat(zoomMin, zoomMax, isYearly);
                  if (fmt === 'monthly') {
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yy = String(d.getFullYear()).slice(-2);
                    return `${mm}/${yy}`;
                  }
                  // daily e weekly usam dd/mm
                  const dd = String(d.getDate()).padStart(2, '0');
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  return `${dd}/${mm}`;
                } catch (e) {
                  return '';
                }
              }
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
            x: {
              formatter: function (_val, opts) {
                try {
                  const idx = opts && typeof opts.dataPointIndex === 'number' ? opts.dataPointIndex : null;
                  const header = formatTooltipHeaderByIndex(idx);
                  return header || '';
                } catch (e) {
                  return '';
                }
              }
            },
            y: {
              formatter: function (val) {
                const n = (typeof val === 'number') ? val : parseFloat(String(val));
                if (!Number.isFinite(n)) return '--';
                if (isYearly) {
                  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
                }
                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n));
              }
            }
          },
          grid: {
            borderColor: gridColor,
            strokeDashArray: 4,
            // Respiro no rodapé: evitar labels “coladas”/cortadas embaixo
            padding: { top: 0, right: 18, bottom: 10, left: 8 }
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
            onItemClick: { toggleDataSeries: true },
            markers: { onClick: undefined }
          },
          theme: { mode: isDark ? 'dark' : 'light' }
        };

        // Zoom/seleção: seleção SEMPRE habilitada (drag to zoom), scroll wheel opcional via toggle
        try {
          const zoomToggleOn = !!(state && state.revenueChartZoomEnabled);
          chartOptions.chart.zoom = {
            enabled: true, // sempre habilitado para permitir drag-to-zoom
            type: 'x',
            autoScaleYaxis: true,
            allowMouseWheelZoom: zoomToggleOn // scroll wheel só quando toggle ativo
          };
          chartOptions.chart.selection = {
            enabled: true, // sempre habilitado para drag-to-zoom
            type: 'x',
            fill: { color: '#3b82f6', opacity: 0.08 },
            stroke: { color: '#3b82f6', width: 1, dashArray: 0, opacity: 0.3 }
          };
        } catch (e) {}

        // Se já existe chart, só atualiza (evita piscar)
        if (revenueChart) {
          try {
            revenueChart.updateOptions(chartOptions, false, true);
            revenueChart.updateSeries(series, true);
            try {
              // reaplicar visibilidade (toggles)
              if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Meta)) {
                try { revenueChart.hideSeries('Meta'); } catch (e) {}
              }
              if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Realizado)) {
                try { revenueChart.hideSeries('Realizado'); } catch (e) {}
              }
              if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.AnoPassado)) {
                const names = revenueChart?.w?.globals?.seriesNames || [];
                const lyName = names.find(n => n && n !== 'Realizado' && n !== 'Meta' && n !== 'Projeção') || null;
                if (lyName) { try { revenueChart.hideSeries(lyName); } catch (e) {} }
              }
              if (!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Projecao)) {
                try { revenueChart.hideSeries('Projeção'); } catch (e) {}
              }
            } catch (e) {}
          } catch (e) {
            try { revenueChart.destroy(); } catch (e2) {}
            revenueChart = null;
          }
        }

        // Se não existe (ou falhou), cria e renderiza
        if (!revenueChart) {
          try { chartEl.innerHTML = ""; } catch (e) {}
          revenueChart = new ApexCharts(chartEl, chartOptions);
          revenueChart.render();
        }

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

          const getLastYearSeriesName = () => {
            try {
              const names = revenueChart?.w?.globals?.seriesNames || [];
              return names.find(n => n && n !== 'Realizado' && n !== 'Meta') || null;
            } catch (e) {
              return null;
            }
          };

          const syncRevenueControls = () => {
            // Período
            try {
              const mode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month';
              const mBtn = document.getElementById('rev-mode-month');
              const sBtn = document.getElementById('rev-mode-semester');
              const yBtn = document.getElementById('rev-mode-year');
              if (mBtn) mBtn.classList.toggle('active', mode === 'month');
              if (sBtn) sBtn.classList.toggle('active', mode === 'semester');
              if (yBtn) yBtn.classList.toggle('active', mode === 'year');
            } catch (e) {}

            // Séries
            try {
              const rBtn = document.getElementById('rev-toggle-realizado');
              const lyBtn = document.getElementById('rev-toggle-lastyear');
              const metaBtn = document.getElementById('rev-toggle-meta');
              const projBtn = document.getElementById('rev-toggle-projecao');
              const showReal = !!(state?.revenueChartSeriesVisible?.Realizado);
              const showLy = !!(state?.revenueChartSeriesVisible?.AnoPassado);
              const showMeta = !!(state?.revenueChartSeriesVisible?.Meta);
              const showProj = !!(state?.revenueChartSeriesVisible?.Projecao);
              if (rBtn) { rBtn.classList.toggle('active', showReal); rBtn.classList.toggle('is-off', !showReal); }
              if (lyBtn) { lyBtn.classList.toggle('active', showLy); lyBtn.classList.toggle('is-off', !showLy); }
              if (metaBtn) { metaBtn.classList.toggle('active', showMeta); metaBtn.classList.toggle('is-off', !showMeta); }
              // Projeção: visível apenas em modo mês/ano
              const curMode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month';
              const projAvailable = (curMode === 'month' || curMode === 'year');
              if (projBtn) {
                projBtn.classList.toggle('active', showProj && projAvailable);
                projBtn.classList.toggle('is-off', !showProj || !projAvailable);
                projBtn.style.display = projAvailable ? '' : 'none';
              }
            } catch (e) {}

            // Zoom + Hoje
            try {
              const zBtn = document.getElementById('rev-zoom-toggle');
              const tBtn = document.getElementById('rev-toggle-today');
              const zOn = !!(state && state.revenueChartZoomEnabled);
              const tOn = !!(state && state.revenueChartShowTodayMarker);
              if (zBtn) { zBtn.classList.toggle('active', zOn); zBtn.classList.toggle('is-off', !zOn); }
              if (tBtn) { tBtn.classList.toggle('active', tOn); tBtn.classList.toggle('is-off', !tOn); }
            } catch (e) {}
          };

          const refreshRevenueChartOnly = async (reason) => {
            try {
              if (!sbClient) return;
              // Reaproveita a rotina de fetchRevenue para manter consistência de filtros (seller/agência/cutoff).
              // Como o gráfico é independente do header, aqui só re-renderizamos usando o cache do chartData quando possível.
              if (state && state.revenueChartData) {
                renderRevenue(state.revenueChartData);
                return;
              }
              await fetchRevenue();
            } catch (e) {}
          };

          const applySeriesVisibilityFromChart = () => {
            try {
              const names = revenueChart?.w?.globals?.seriesNames || [];
              const collapsed = revenueChart?.w?.globals?.collapsedSeriesIndices || [];
              const isHidden = (name) => {
                const idx = names.indexOf(name);
                return idx >= 0 ? collapsed.includes(idx) : false;
              };
              const lyName = getLastYearSeriesName();
              state.revenueChartSeriesVisible.Realizado = !isHidden('Realizado');
              if (lyName) state.revenueChartSeriesVisible.AnoPassado = !isHidden(lyName);
              state.revenueChartSeriesVisible.Meta = !isHidden('Meta');
              state.revenueChartSeriesVisible.Projecao = !isHidden('Projeção');
            } catch (e) {}
          };

          // Meta pill (compat): manter estado antigo também
          bindOnce('rev-toggle-meta', () => {
            if (!revenueChart) return;
            try {
              revenueChart.toggleSeries('Meta');
              applySeriesVisibilityFromChart();
              revenueMetaVisible = !!state.revenueChartSeriesVisible.Meta;
              syncRevenueControls();
            } catch (e) {}
          });
          bindOnce('rev-toggle-realizado', () => {
            if (!revenueChart) return;
            try {
              revenueChart.toggleSeries('Realizado');
              applySeriesVisibilityFromChart();
              syncRevenueControls();
            } catch (e) {}
          });
          bindOnce('rev-toggle-lastyear', () => {
            if (!revenueChart) return;
            try {
              const lyName = getLastYearSeriesName();
              if (!lyName) return;
              revenueChart.toggleSeries(lyName);
              applySeriesVisibilityFromChart();
              syncRevenueControls();
            } catch (e) {}
          });
          bindOnce('rev-toggle-projecao', () => {
            if (!revenueChart) return;
            try {
              revenueChart.toggleSeries('Projeção');
              applySeriesVisibilityFromChart();
              syncRevenueControls();
            } catch (e) {}
          });

          // Período
          bindOnce('rev-mode-month', async () => {
            try { state.revenueChartMode = 'month'; state.revenueChartZoom = null; } catch (e) {}
            await fetchRevenue(); // recalcula e cacheia chartData conforme modo
            syncRevenueControls();
          });
          bindOnce('rev-mode-semester', async () => {
            try { state.revenueChartMode = 'semester'; state.revenueChartZoom = null; } catch (e) {}
            await fetchRevenue();
            syncRevenueControls();
          });
          bindOnce('rev-mode-year', async () => {
            try { state.revenueChartMode = 'year'; state.revenueChartZoom = null; } catch (e) {}
            await fetchRevenue();
            syncRevenueControls();
          });

          // Zoom
          bindOnce('rev-zoom-toggle', () => {
            try {
              state.revenueChartZoomEnabled = !state.revenueChartZoomEnabled;
              // Ao desligar o zoom, volta para o range completo do período (sem precisar de botão Reset)
              if (!state.revenueChartZoomEnabled) {
                state.revenueChartZoom = null;
                try { if (revenueChart && typeof revenueChart.resetZoom === 'function') revenueChart.resetZoom(); } catch (e) {}
              }
            } catch (e) {}
            try { renderRevenue(state.revenueChartData || chartData); } catch (e) {}
            syncRevenueControls();
          });

          // Marcador Hoje
          bindOnce('rev-toggle-today', () => {
            try { state.revenueChartShowTodayMarker = !state.revenueChartShowTodayMarker; } catch (e) {}
            try {
              const box = document.getElementById('revenue-focus-box-tv');
              if (box) box.style.display = state.revenueChartShowTodayMarker ? '' : 'none';
            } catch (e) {}
            try { renderRevenue(state.revenueChartData || chartData); } catch (e) {}
            syncRevenueControls();
          });

          // Inicialização: aplicar visibilidade padrão (Meta começa oculta)
          try {
            // Garantir que a Meta siga o estado inicial (por padrão oculto)
            if (revenueChart) {
              if (!state.revenueChartSeriesVisible.Meta) {
                try { revenueChart.hideSeries('Meta'); } catch (e) {}
              }
            }
            revenueMetaVisible = !!state.revenueChartSeriesVisible.Meta;
            syncRevenueControls();
          } catch (e) {}
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
  
