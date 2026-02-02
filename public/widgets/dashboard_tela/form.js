
// Widget wrapper para rodar via loader (Bubble + CDN framework)
// - Não altera o comportamento do dashboard; só controla o momento de execução e carrega dependências.
;(function () {
  const WIDGET_KEY = "dashboard_tela";
  const LEGACY_WIDGET_KEY = "wish-board";

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
      // TV: manter Meta sempre visível (3 linhas sempre carregadas)
      let revenueMetaVisible = true; // persistir escolha do usuário entre renders

      // --- META ADS (Marketing Spend) ---
      // ATENÇÃO: token exposto no frontend conforme solicitado.
      const META_GRAPH_VERSION = 'v20.0';
      const META_AD_ACCOUNT_ID = 'act_843937229337573';
      const META_ACCESS_TOKEN = 'EAASGBRlEgBwBQGFUAaRob6p1yhZCfLL9szluxABxeXFYmmpz0Gankr47BZBKFD8TAkBharYfGwck69wMZC8okMGjoIfZAP8VcirRD6Eu2uBQ4PqJHj7NYKuBz83F2rvRhb4D32iCC0Iar2URocbEEw1dZCf4GFamZBnVz4OLt49k3ejs1UFx2eMondXTlCApOe';
      const META_SPEND_CACHE_MS = 5 * 60 * 1000; // 5 min

      const AGENCY_IDS = {
        MGS: 'a57b72c4-dc6d-45cc-a1e3-1a0e2ba6c2a9',
        ACELERAI: '75f34688-c054-4519-a445-e350fe146870',
      };

      // Mapeamento: Agência → IDs de Campanhas Meta (Facebook)
      // Usado para segregar investimento/faturamento por agência nos filtros do header (pills).
      const META_CAMPAIGN_IDS_BY_AGENCY = {
        [AGENCY_IDS.MGS]: {
          landingPage: [
            '120239567789980521',
            '120239566956730521',
            '120239566738920521',
            '120239495678940521'
          ],
          whatsapp: [
            '120239567789980521',
            '120239566956730521',
            '120239566738920521',
            '120239495678940521'
          ]
        },
        [AGENCY_IDS.ACELERAI]: {
          landingPage: [
            '120239333024630521', // AUREA
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
          whatsapp: [
            '120239333024630521', // AUREA
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
          ]
        }
      };

      /**
       * Retorna IDs de campanhas Meta filtradas pela agência selecionada.
       * @param {string} channelType - 'landingPage' ou 'whatsapp'
       * @returns {string[]} Array de campaign IDs
       */
      function getMetaCampaignIdsByAgency(channelType) {
        const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';

        const normalizeIds = (ids) => {
          const out = [];
          const seen = new Set();
          (Array.isArray(ids) ? ids : []).forEach((x) => {
            const id = String(x || '').trim();
            if (!id) return;
            if (seen.has(id)) return;
            seen.add(id);
            out.push(id);
          });
          return out;
        };

        // Sem filtro = retorna TODOS os IDs (todas agências)
        if (!agencyId) {
          const allIds = [];
          Object.values(META_CAMPAIGN_IDS_BY_AGENCY).forEach((agencyData) => {
            const ids = agencyData[channelType] || [];
            allIds.push(...ids);
          });
          return normalizeIds(allIds);
        }

        // Com filtro = retorna apenas IDs da agência selecionada
        const agencyData = META_CAMPAIGN_IDS_BY_AGENCY[agencyId];
        if (!agencyData) return [];
        return normalizeIds(agencyData[channelType] || []);
      }

      function getSelectedAgencyLabel() {
        const id = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
        if (!id) return '';
        if (id === AGENCY_IDS.MGS) return 'MGS';
        if (id === AGENCY_IDS.ACELERAI) return 'Aceleraí';
        return 'Agência';
      }

      // Allowlist (única) legada: mantida apenas como referência (agora usamos getMetaCampaignIdsByAgency()).
      const META_INVEST_ALLOWLIST_CAMPAIGN_IDS = [
        // MGS
        '120239567789980521',
        '120239566956730521',
        '120239566738920521',
        '120239495678940521',

        // Aceleraí (inclui AUREA)
        '120239333024630521', // AUREA
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
      ];

      // --- BUBBLE PARAM (PLACEHOLDER) ---
      // No Bubble, substitua o valor abaixo pelo id do vendedor logado (uuid).
      // Exemplo: const LOGGED_SELLER_ID = "3448191a-909f-4ffb-b629-ec3df7104b6b";
      const LOGGED_SELLER_ID = "3448191a-909f-4ffb-b629-ec3df7104b6b";

      // Controle de acesso (UI-level): líder vê global; vendedor comum vê só o próprio.
      let access = {
        sellerId: null,
        sellerName: null,
        sellerImg: null,
        isLeader: false,
        ready: false
      };

      // --- REGRAS DE NEGÓCIO (METAS) ---
      const TARGET_REVENUE_MONTHLY = 2100000; // R$ 2.1M

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

      // --- HORÁRIO ÚTIL (dinâmico via params, sem mexer nos filtros do header) ---
      // Objetivo: permitir configurar a janela diária de horário comercial via:
      // params.businessHours = { start: ISO_UTC, end: ISO_UTC }
      // Ex.: start="2026-01-15T09:00:00.000Z", end="2026-01-15T19:00:00.000Z"
      // Importante: usamos o relógio UTC diretamente (getUTCHours/getUTCMinutes).
      const __DEFAULT_BUSINESS_HOURS_CFG = { mode: 'sp', startMin: 9 * 60, endMin: 19 * 60, excludeWeekends: true };

      function __parseBusinessHoursCfg(params) {
        try {
          const raw = params && params.businessHours ? params.businessHours : null;
          const startIso = raw && raw.start ? String(raw.start) : '';
          const endIso = raw && raw.end ? String(raw.end) : '';
          if (!startIso || !endIso) return __DEFAULT_BUSINESS_HOURS_CFG;

          // Novo: por padrão, exclui fim de semana (seg–sex). Se exclude_weekends=false, conta sáb/dom também.
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

      async function fetchCrmMetaGeralMes(mes) {
        if (!sbClient) return 0;
        const key = String(mes);
        if (__crmMetasCache.metaGeralByMes[key] !== undefined) return __crmMetasCache.metaGeralByMes[key];
        try {
          const { data, error } = await sbClient
            .from('crm_metas_geral_mes')
            .select('meta_geral')
            .eq('mes', mes)
            .maybeSingle();
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

      async function getGaugeTargetRevenueFromCrm() {
        // Meta do Velocímetro do Mês:
        // - vendedor selecionado: meta_mensal_final (RPC)
        // - sem vendedor: meta_geral do mês (tabela)
        const { mes, ano, refDateYmd } = getCrmMetaContext();
        try {
          if (state && state.selectedSeller) {
            const rpc = await fetchCrmMetasRpc(mes, ano, refDateYmd);
            const row = rpc && rpc.byVendedorId ? rpc.byVendedorId[String(state.selectedSeller)] : null;
            const metaVendedor = __toNumber(row && row.meta_mensal_final);
            if (metaVendedor > 0) return metaVendedor;
          }
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
      // Etapa usada como "entrada" para métricas de FRT/Atendimento.
      // OBS: o nome antigo "Novo Lead" foi trocado para "Oportunidade"; para evitar drift por renome,
      // usamos direto o ID (consultado no Supabase).
      const ETAPA_OPORTUNIDADE_ID = 'a6709949-9857-4b25-965d-b4bf8270426b';

      // --- FRT: corte hardcoded (sobrepõe filtros de período/cutoff) ---
      // Requisito: FRT deve considerar somente eventos a partir de 15/01 (hoje) 12:00 America/Sao_Paulo.
      // Como Sao_Paulo = UTC-3 (sem DST), 12:00 local = 15:00 UTC.
      const FRT_HARDCUT_UTC_ISO = '2026-01-15T15:00:00.000Z';

      function getFrtHardcutWindow() {
        // Para FRT, o hardcut sobrepõe o filtro de período: sempre do hardcut até "agora".
        const endIso = new Date().toISOString();
        return { startIso: FRT_HARDCUT_UTC_ISO, endIso };
      }

      let __frtEventsCache = { key: '', promise: null };

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

      // --- FRT (igualar lógica com frt_carregamento.md) ---
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
        // Formatos comuns:
        // - "X → Y"
        // - "X -> Y"
        // - com ruídos antes/depois; pegamos o primeiro pareamento.
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
        // Cache por vendedor selecionado (porque o filtro altera o conjunto de eventos)
        const sel = state && state.selectedSeller ? String(state.selectedSeller) : '';
        const { startIso, endIso } = getFrtHardcutWindow();
        const cacheKey = `${sel}|${startIso}|${endIso.slice(0, 13)}`; // muda no máximo por hora
        if (__frtEventsCache && __frtEventsCache.key === cacheKey && __frtEventsCache.promise) {
          return __frtEventsCache.promise;
        }

        const p = (async () => {
          if (!sbClient) return [];
          if (!startIso) return [];

          // Se o end for menor que start, não há dados (hardcut “inviabilizou” o período)
          try {
            if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) return [];
          } catch (e) {}

          // Query: logs relevantes (etapa structurada OU descrição menciona aliases)
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
                // descrição com acento no nome da coluna: usamos "descrição"
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
          // diffMinutes aqui passa a representar MINUTOS ÚTEIS (conforme janela configurada),
          // sem substituir filtros do header/hardcut — apenas muda o "relógio" do delta.
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
              if (!st.enteredAtIso) return; // sem enter anterior no período
              const exitIso = createdAt;
              const entryIso = st.enteredAtIso;

              const exitMs = Date.parse(exitIso);
              const entryMs = Date.parse(entryIso);
              if (!(Number.isFinite(exitMs) && Number.isFinite(entryMs))) return;
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

          // Filtro de vendedor do dashboard (se aplicável)
          if (sel) {
            return out.filter((e) => e.sellerId === sel);
          }
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

      // Desloca um ISO em anos (usado para alinhar cutoff no comparativo do ano passado)
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

      function applyCutoffDateYmd(query, column) {
        if (!cutoff.enabled || !cutoff.cutoffYmdLocal || !query) return query;
        try { return query.gt(column, cutoff.cutoffYmdLocal); } catch (e) { return query; }
      }

      // --- BUSINESS HOURS (Follow-up) ---
      // Regra: ignorar fora da janela de horário útil e fins de semana (seg–sex).
      // - Padrão (fallback): America/Sao_Paulo (UTC-3 fixo), 09:00–19:00
      // - Dinâmico: via params.businessHours.{start,end} (ISO UTC), usando o relógio UTC diretamente
      // Nota: Mantemos o fallback SP via offset fixo para suportar browsers de TV sem Intl/timezone.
      const __SP_OFFSET_MIN = -180; // UTC-3
      const __SP_OFFSET_MS = __SP_OFFSET_MIN * 60 * 1000;

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

        // início no midnight local (usando timeline deslocada)
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

      // --- MEETINGS FILTER (statusReuniao) ---
      // Regra de produto: incluir agendadas + ocorridas; excluir canceladas.
      function isMeetingCanceled(statusRaw) {
        return String(statusRaw || '').trim() === 'Cancelada';
      }

      function applyMeetingNotCanceledFilter(query) {
        // Importante: .neq não inclui NULL; como NULL não é “Cancelada”, incluímos via OR.
        try { return query.or('statusReuniao.is.null,statusReuniao.neq.Cancelada'); } catch (e) { return query; }
      }

      const KPI_IDS = {
        FATURAMENTO: 'faturamento',
        CONVERSAO: 'conversao',
        CONV_OPORTUNIDADES: 'conv_oportunidades',
        OPORTUNIDADES: 'oportunidades',
        PROPOSTAS: 'propostas',
        REUNIOES: 'reunioes',
        CAPTADOS: 'captados',
        QTD_VENDAS: 'qtd_vendas',
        TICKET: 'ticket',
        INVEST: 'invest',
        CAC: 'cac',
        ROAS: 'roas',
      };

      // DATA (Estado Global)
      let state = {
        dateFilter: 'semester', // today, week, month, semester, year, custom
        selectedSeller: null, // null = todos
        selectedAgencyId: '', // '' = Todos | UUID = filtra leads.agencia
        customRange: null, // { startYmd: 'YYYY-MM-DD', endYmd: 'YYYY-MM-DD' } quando dateFilter='custom'
        revenueChartMode: 'semester', // month | semester | year (calendário)
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
        theme: 'dark',
        rankingTab: 'executives', // executives | meetings
        rankingData: [],
        rankingSort: 'score', // score | proposals | meetings | sales | revenue | frt | cycle
        conversionRates: [0, 0, 0], // [taxaLead, taxaProposta, taxaReuniao]
        channelData: [], // { name, leads, revenue, roi, icon, color, active }
        sellerNameById: {}, // cache para exibir nome do executivo nas reuniões
        sellerImgById: {}, // cache para exibir foto do executivo (vendedores.perfil_img)
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

      function isHttpUrlMaybe(url) {
        try {
          const s = String(url || '').trim();
          return /^https?:\/\//i.test(s);
        } catch (e) {
          return false;
        }
      }

      function dicebearAvatarUrl(seedName) {
        const seed = encodeURIComponent(String(seedName || '').trim() || 'user');
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
      }

      function resolveAvatarUrl(perfilImgUrl, seedName) {
        const raw = String(perfilImgUrl || '').trim();
        return isHttpUrlMaybe(raw) ? raw : dicebearAvatarUrl(seedName);
      }

      function setImgWithFallback(imgEl, perfilImgUrl, seedName) {
        if (!imgEl) return;
        const fallback = dicebearAvatarUrl(seedName);
        const primary = resolveAvatarUrl(perfilImgUrl, seedName);
        try { imgEl.onerror = null; } catch (e) {}
        try {
          imgEl.onerror = function () {
            try { this.onerror = null; } catch (e) {}
            try { this.src = fallback; } catch (e) {}
          };
        } catch (e) {}
        try { imgEl.src = primary; } catch (e) {}
      }

      function updateSellerAvatar() {
        // Avatar ao lado do select (o <select> nativo não suporta imagem por opção)
        const img = document.getElementById('seller-avatar');
        if (!img) return;
        const selectedId = state && state.selectedSeller ? String(state.selectedSeller) : '';
        const seedName = (() => {
          // tenta nome do selecionado; fallback para nome do logado; fallback genérico
          if (selectedId && state.sellerNameById && state.sellerNameById[selectedId]) return state.sellerNameById[selectedId];
          if (access && access.sellerName) return access.sellerName;
          return 'user';
        })();
        const perfilImgUrl = (() => {
          if (selectedId && state.sellerImgById && state.sellerImgById[selectedId]) return state.sellerImgById[selectedId];
          // Se estiver em "minha visão" e ainda não populou map completo, usa o perfil do logado (quando disponível)
          if (access && access.sellerId && (!selectedId || selectedId === String(access.sellerId))) {
            return access.sellerImg || null;
          }
          return null;
        })();
        setImgWithFallback(img, perfilImgUrl, seedName);
      }

      function updateDashboardSubtitle() {
        try {
          const el = document.getElementById('dashboard-period-subtitle');
          if (!el) return;
          let t = `Vendas e Marketing • ${getMonthYearLabelPtBr(new Date())}`;
          const agencyLabel = (typeof getSelectedAgencyLabel === 'function') ? getSelectedAgencyLabel() : '';
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
        const vendas = MOCK_2024_TOTALS.vendas * factor;
        const leadsAtivosProxy = MOCK_2024_TOTALS.oportunidades * factor;
        const propostas = MOCK_2024_TOTALS.propostas * factor;
        const reunioes = MOCK_2024_TOTALS.reunioes * factor;

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
          vendas,
          leadsAtivosProxy,
          convPct,
          convOportunidadesPct,
          propostas,
          reunioes,
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
          const propostas = MOCK_2025_YTD_TOTALS.propostas * factor;
          const reunioes = MOCK_2025_YTD_TOTALS.reunioes * factor;

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
            vendas,
            leadsAtivosProxy,
            convPct,
            convOportunidadesPct,
            propostas,
            reunioes,
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
            convOportunidadesPct: 0,
            propostas: 0,
            reunioes: 0,
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
                .select('id, nome, perfil_img')
                .eq('usuarioInterno', false)
                .order('nome');
              try {
                // cache de imagens para o avatar do filtro
                const imgMap = state.sellerImgById || {};
                (sellersDb || []).forEach(s => { if (s && s.id) imgMap[s.id] = s.perfil_img || null; });
                state.sellerImgById = imgMap;
              } catch (e) {}
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
            try { updateSellerAvatar(); } catch (e) {}

            if (!select.dataset.scopeBound) {
              select.dataset.scopeBound = '1';
              select.addEventListener('change', (e) => {
                const val = (e.target && e.target.value) ? String(e.target.value) : '';
                state.selectedSeller = val || null;
                try { updateSellerAvatar(); } catch (e) {}
                fetchDataWithStamp('seller');
              });
            }
          }

          return true;
        }

        const { data, error } = await sbClient
          .from('vendedores')
          .select('id, nome, perfil_img, diretorVendas, usuarioInterno')
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
        access.sellerImg = data.perfil_img || null;
        access.isLeader = !!data.diretorVendas;
        access.ready = true;
        try {
          if (access.sellerId) state.sellerImgById[String(access.sellerId)] = access.sellerImg || null;
          if (access.sellerId && access.sellerName) state.sellerNameById[String(access.sellerId)] = access.sellerName;
        } catch (e) {}

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
            try { updateSellerAvatar(); } catch (e) {}

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
                try { updateSellerAvatar(); } catch (e) {}
                fetchDataWithStamp('seller');
              });
            }
          }
        }

        try { updateSellerAvatar(); } catch (e) {}
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
      const formatNumber = (val, decimals = 0) => {
        // Formata números (inclui 0). Exibe "--" apenas quando inválido.
        try {
          if (val === null || val === undefined || val === '') return '--';
          const n = (typeof val === 'number') ? val : __toNumber(val);
          if (!Number.isFinite(n)) return '--';
          const d = Number.isFinite(Number(decimals)) ? Math.max(0, Math.min(6, Math.floor(Number(decimals)))) : 0;
          return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
        } catch (e) {
          return '--';
        }
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

      // Auto-scroll (via Bubble params): params.scroll
      // Aceita:
      // - number (px): ex 1200
      // - string numérica: "1200"
      // - selector/id: "#channel-grid" ou "channel-grid"
      let __didInitialAutoScroll = false;
      function getInitialScrollParamRaw() {
        try {
          const p = (typeof window !== 'undefined' && window.__WISH_BOARD_PARAMS__) ? window.__WISH_BOARD_PARAMS__ : {};
          return (p && (p.scroll ?? p.Scroll ?? p.SCROLL)) ?? null;
        } catch (e) {
          return null;
        }
      }

      function applyInitialAutoScroll() {
        if (__didInitialAutoScroll) return;
        const raw = getInitialScrollParamRaw();
        if (raw === null || raw === undefined || String(raw).trim() === '') return;
        __didInitialAutoScroll = true;

        const container = document.getElementById('dashboard-acelerai-v2');
        if (!container) return;

        const doScroll = () => {
          try {
            const str = String(raw).trim();
            const n = Number(str);
            if (Number.isFinite(n)) {
              const top = Math.max(0, Math.min(n, container.scrollHeight || n));
              container.scrollTo({ top, behavior: 'smooth' });
              return;
            }

            const selector = (str.startsWith('#') || str.startsWith('.')) ? str : `#${CSS && CSS.escape ? CSS.escape(str) : str}`;
            const el = document.querySelector(selector) || document.getElementById(str);
            if (!el) return;

            const rect = el.getBoundingClientRect();
            const crect = container.getBoundingClientRect();
            const top = container.scrollTop + (rect.top - crect.top) - 12;
            container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
          } catch (e) {}
        };

        // Espera layout/render estabilizar
        setTimeout(() => {
          try { requestAnimationFrame(doScroll); } catch (e) { doScroll(); }
        }, 120);
      }

      // Compras aprovadas (fonte de "faturamento" no dashboard)
      // Regra: usar a tabela `compras` e filtrar por aprovação.
      // No schema atual, o indicador de aprovação é `vendaaprovada` (boolean).
      // Extra (2026): ignorar compras de teste (`is_test=true`) quando a coluna existir (alinhado ao `dashboard`).
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
          const { error } = await sbClient.from('compras').select('is_test').limit(1);
          if (error) {
            if (__isMissingColumnError(error, 'is_test')) {
              __comprasIsTestSupported = false;
              return false;
            }
            // Outros erros (RLS/transiente): manter comportamento best-effort (não bloquear).
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
        // Alinhado ao `dashboard` (wish-board): filtro estrito por aprovado.
        // Observação: o `dashboard` também filtra compras de teste quando a coluna `is_test` existir.
        try {
          let qq = q.eq('vendaaprovada', true);
          if (__comprasIsTestSupported === true) {
            qq = applyNotTestPurchaseFilter(qq);
          }
          return qq;
        } catch (e) { return q; }
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
        // Busca spend (Meta Ads) para o período do header e também para o período anterior,
        // para permitir comparativos "vs mês anterior" em Investimento/CAC/ROAS.
        try {
          const normalizeIds = (ids) => {
            const out = [];
            const seen = new Set();
            (Array.isArray(ids) ? ids : []).forEach((x) => {
              const id = String(x || '').trim();
              if (!id) return;
              if (seen.has(id)) return;
              seen.add(id);
              out.push(id);
            });
            return out;
          };

          // Com `filtering` por campaign.id, o Meta pode retornar múltiplas linhas/páginas (por campanha/ad/etc).
          // Então é obrigatório paginar e somar o `spend`.
          const fetchSpendByCampaignIds = async (campaignIds, startYmd, endYmd, errLabel) => {
            const ids = normalizeIds(campaignIds);
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
                throw new Error(`Meta insights(${errLabel}) HTTP ${res.status}: ${txt}`);
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
            state.__metaSpendCache = {
              key: `empty|${startYmd}|${endYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`,
              value: 0,
              fetchedAt: Date.now()
            };
            return;
          }

          const idsInvest = normalizeIds(getMetaCampaignIdsByAgency('landingPage'));
          if (!idsInvest.length) {
            state.marketingInvestment = 0;
            state.marketingInvestmentPrev = 0;
            state.__metaSpendCache = {
              key: `empty|${startYmd}|${endYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`,
              value: 0,
              fetchedAt: Date.now()
            };
            return;
          }

          const cacheKey = `${startYmd}|${endYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`;
          const cache = state.__metaSpendCache;
          if (cache && cache.key === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt) < META_SPEND_CACHE_MS) {
            if (typeof cache.value === 'number' && Number.isFinite(cache.value)) {
              state.marketingInvestment = cache.value;
            }
          } else {
            const spendVal = await fetchSpendByCampaignIds(idsInvest, startYmd, endYmd, 'invest');
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
            state.__metaSpendCachePrev = {
              key: `empty|${prevStartYmd}|${prevEndYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`,
              value: 0,
              fetchedAt: Date.now()
            };
            return;
          }

          const prevKey = `${prevStartYmd}|${prevEndYmd}|${state.selectedSeller || 'all'}|cut:${cutoff?.cutoffYmdLocal || 'none'}|agency:${state.selectedAgencyId || 'all'}`;
          const prevCache = state.__metaSpendCachePrev;
          if (prevCache && prevCache.key === prevKey && prevCache.fetchedAt && (Date.now() - prevCache.fetchedAt) < META_SPEND_CACHE_MS) {
            if (typeof prevCache.value === 'number' && Number.isFinite(prevCache.value)) {
              state.marketingInvestmentPrev = prevCache.value;
            }
            return;
          }

          const spendPrevVal = await fetchSpendByCampaignIds(idsInvest, prevStartYmd, prevEndYmd, 'investPrev');
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
              .select('id, nome, perfil_img')
              .eq('usuarioInterno', false);
            const map = {};
            const imgMap = state.sellerImgById || {};
            (sellers || []).forEach(s => {
              if (!s || !s.id) return;
              map[s.id] = s.nome || String(s.id);
              imgMap[s.id] = s.perfil_img || null;
            });
            state.sellerNameById = map;
            state.sellerImgById = imgMap;
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
        // Se o usuário tentar entrar em "custom" sem range aplicado, abre o popover.
        if (String(filter || '') === 'custom' && !(state && state.customRange && state.customRange.startYmd && state.customRange.endYmd)) {
          try { window.openCustomDatePicker(); } catch (e) {}
          return;
        }

        state.dateFilter = filter;
        try { setCustomButtonAppliedLabel(); } catch (e) {}

        // v123+: Sincronizar revenueChartMode com filtro do header (month/semester/year)
        if (filter === 'month' || filter === 'semester' || filter === 'year') {
          state.revenueChartMode = filter;
          // Atualizar botões do gráfico de faturamento
          try {
            const revButtons = ['rev-mode-month', 'rev-mode-semester', 'rev-mode-year'];
            revButtons.forEach(id => {
              const btn = document.getElementById(id);
              if (btn) btn.classList.remove('active');
            });
            const activeRevBtn = document.getElementById(`rev-mode-${filter}`);
            if (activeRevBtn) activeRevBtn.classList.add('active');
          } catch (e) {}
        }

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

      // --- FULLSCREEN (TV MODE) ---
      function __isFullscreenActive() {
        try {
          return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        } catch (e) {
          return false;
        }
      }

      function __requestFullscreen(el) {
        if (!el) throw new Error('Elemento inválido para fullscreen.');
        const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (!fn) throw new Error('requestFullscreen indisponível neste navegador.');
        return fn.call(el);
      }

      function __exitFullscreen() {
        const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (!fn) throw new Error('exitFullscreen indisponível neste navegador.');
        return fn.call(document);
      }

      function __syncFullscreenUi() {
        const btn = document.getElementById('btn-fullscreen');
        const icon = document.getElementById('fullscreen-icon');
        const on = __isFullscreenActive();

        if (btn) {
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.setAttribute('aria-label', on ? 'Sair do modo tela cheia' : 'Entrar em tela cheia');
          btn.title = on ? 'Sair da tela cheia' : 'Tela cheia';
        }

        if (icon) {
          icon.setAttribute('data-lucide', on ? 'minimize' : 'maximize');
          try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
        }
      }

      window.toggleFullScreen = async () => {
        // Preferimos fullscreen do container do widget para não interferir no restante da página Bubble.
        const container = document.getElementById('dashboard-acelerai-v2');
        const el = container || document.documentElement;

        try {
          if (__isFullscreenActive()) {
            await __exitFullscreen();
          } else {
            await __requestFullscreen(el);
          }
        } catch (e) {
          // Silencioso (em alguns contextos o browser exige gesto do usuário / bloqueia).
          try { console.warn('Fullscreen indisponível:', e); } catch (_) {}
        } finally {
          __syncFullscreenUi();
        }
      };

      // Mantém o estado do botão quando o usuário sai com ESC, etc.
      try {
        document.addEventListener('fullscreenchange', __syncFullscreenUi);
        document.addEventListener('webkitfullscreenchange', __syncFullscreenUi);
        document.addEventListener('mozfullscreenchange', __syncFullscreenUi);
        document.addEventListener('MSFullscreenChange', __syncFullscreenUi);
      } catch (e) {}

      async function fetchSellers() {
        if (!sbClient) return;
        
        // Líder: lista todos os executivos (usuarioInterno=false).
        // Vendedor comum: não deve ver lista; acess control esconde o select.
        const { data, error } = await sbClient
            .from('vendedores')
            .select('id, nome, perfil_img')
            .eq('usuarioInterno', false)
            .order('nome');

        if (error) { console.error("Erro vendedores:", error); return; }

        // Cache para uso na aba de reuniões (nome do executivo por id)
        try {
          const map = {};
          (data || []).forEach(s => { if (s && s.id) map[s.id] = s.nome || String(s.id); });
          state.sellerNameById = map;
        } catch (e) {}

        // Cache de imagens por id (perfil_img é URL completa)
        try {
          const imgMap = state.sellerImgById || {};
          (data || []).forEach(s => { if (s && s.id) imgMap[s.id] = s.perfil_img || null; });
          state.sellerImgById = imgMap;
        } catch (e) {}

        const select = document.getElementById('seller-select');
        select.innerHTML = '<option value="">Todos os executivos</option>';
        
        data.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.nome;
            select.appendChild(opt);
        });

        if (!select.dataset.sellerBound) {
          select.dataset.sellerBound = '1';
          select.addEventListener('change', (e) => {
              // Se não for líder, ignorar mudanças (select fica hidden/disabled).
              if (access && access.ready && !access.isLeader) return;
              state.selectedSeller = e.target.value || null;
              try { updateSellerAvatar(); } catch (e) {}
              fetchDataWithStamp('seller');
          });
        }

        try { updateSellerAvatar(); } catch (e) {}
      }

      // --- FILTRO DE AGÊNCIA (pills + select legado) ---
      const __leadAgencyCache = new Map(); // lead_id -> agencia uuid

      async function fetchLeadAgencyMap(leadIds) {
        if (!sbClient) return new Map();
        const ids = (Array.isArray(leadIds) ? leadIds : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean);
        const uniq = [];
        const seen = new Set();
        ids.forEach((id) => { if (!seen.has(id)) { seen.add(id); uniq.push(id); } });
        if (uniq.length === 0) return new Map();

        // Primeiro: pega do cache
        const out = new Map();
        const missing = [];
        uniq.forEach((id) => {
          if (__leadAgencyCache.has(id)) out.set(id, __leadAgencyCache.get(id));
          else missing.push(id);
        });
        if (missing.length === 0) return out;

        // Depois: busca no Supabase
        try {
          let q = sbClient
            .from('leads')
            .select('lead_id, agencia')
            .in('lead_id', missing);
          // Não aplicamos cutoff aqui: é lookup estrutural.
          const { data, error } = await q;
          if (error) throw error;
          (data || []).forEach((r) => {
            const lid = r && r.lead_id ? String(r.lead_id) : null;
            const ag = r && r.agencia ? String(r.agencia) : '';
            if (!lid) return;
            __leadAgencyCache.set(lid, ag);
            out.set(lid, ag);
          });
        } catch (e) {
          console.warn('[agency] erro ao buscar leads.agencia:', e);
        }

        return out;
      }

      function applyAgencyFilterToLeadQuery(q) {
        try {
          const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
          if (!agencyId) return q;
          return q.eq('agencia', agencyId);
        } catch (e) {
          return q;
        }
      }

      async function filterRowsByAgencyViaLeadId(rows, getLeadId) {
        try {
          const agencyId = state && state.selectedAgencyId ? String(state.selectedAgencyId) : '';
          if (!agencyId) return rows || [];
          const arr = Array.isArray(rows) ? rows : [];
          const leadIds = [];
          const seen = new Set();
          arr.forEach((r) => {
            const lid = getLeadId ? getLeadId(r) : null;
            const id = lid ? String(lid) : '';
            if (!id || seen.has(id)) return;
            seen.add(id);
            leadIds.push(id);
          });
          if (leadIds.length === 0) return [];
          const map = await fetchLeadAgencyMap(leadIds);
          return arr.filter((r) => {
            const lid = getLeadId ? getLeadId(r) : null;
            const id = lid ? String(lid) : '';
            return id && String(map.get(id) || '') === agencyId;
          });
        } catch (e) {
          return rows || [];
        }
      }

      function syncAgencySelectorUI(id) {
        try {
          const sid = String(id || '');
          const root = document.getElementById('agency-selector');
          if (!root) return;
          const buttons = Array.from(root.querySelectorAll('.agency-segment-btn'));
          buttons.forEach((btn) => {
            const val = btn && btn.dataset ? (btn.dataset.agency || '') : '';
            const isActive = String(val || '') === sid;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        } catch (e) {}
      }

      function setSelectedAgency(id) {
        try { state.selectedAgencyId = String(id || ''); } catch (e) {}
        try {
          const sel = document.getElementById('agency-select');
          if (sel) sel.value = state.selectedAgencyId || '';
        } catch (e) {}
        try { syncAgencySelectorUI(state.selectedAgencyId || ''); } catch (e) {}
        try { updateDashboardSubtitle(); } catch (e) {}
        fetchDataWithStamp('agency');
      }

      function initAgencySelectorUI() {
        try {
          // 1) sincroniza select legado -> state (se existir)
          const sel = document.getElementById('agency-select');
          if (sel) {
            if (!sel.value && state && state.selectedAgencyId) sel.value = state.selectedAgencyId || '';
            if (!sel.dataset.bound) {
              sel.dataset.bound = '1';
              sel.addEventListener('change', () => setSelectedAgency(sel.value || ''));
            }
          }

          // 2) pills (event delegation)
          const root = document.getElementById('agency-selector');
          if (root && !root.dataset.bound) {
            root.dataset.bound = '1';
            root.addEventListener('click', (e) => {
              let el = e && e.target ? e.target : null;
              // subir até achar o botão
              while (el && el !== root) {
                if (el.classList && el.classList.contains('agency-segment-btn')) break;
                el = el.parentNode;
              }
              const btn = (el && el !== root && el.classList && el.classList.contains('agency-segment-btn')) ? el : null;
              if (!btn) return;
              const val = btn.dataset ? (btn.dataset.agency || '') : '';
              setSelectedAgency(val || '');
            });
          }

          // 3) UI inicial
          try { syncAgencySelectorUI(state.selectedAgencyId || ''); } catch (e) {}
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
        // label compacto e previsível
        const s = __formatYmdToBr(r.startYmd); // dd/mm/yyyy
        const e = __formatYmdToBr(r.endYmd);
        const sShort = s ? s.slice(0, 5) : ''; // dd/mm
        const eShort = e ? e.slice(0, 5) : '';
        const label = (sShort && eShort) ? `${sShort}–${eShort}` : `${s || ''}${s && e ? '–' : ''}${e || ''}`;
        btn.textContent = `Personalizado • ${label}`;
        btn.classList.add('has-range');
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

        // Portal: move popover para o body para evitar ser cortado por containers/overflow do Bubble
        try {
          if (!pop.dataset.portal && document.body && pop.parentNode !== document.body) {
            document.body.appendChild(pop);
            pop.dataset.portal = '1';
          }
        } catch (e) {}

        // posicionamento
        try {
          if (btn && btn.getBoundingClientRect) {
            pop.style.visibility = 'hidden';
            const rect = btn.getBoundingClientRect();
            const popW = pop.offsetWidth || 340;
            const popH = pop.offsetHeight || 140;
            const margin = 10;
            let left = rect.right - popW;
            left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
            let top = rect.bottom + 8;
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

      window.openDatePicker = (inputId) => {
        try {
          const el = document.getElementById(String(inputId || ''));
          if (!el) return;
          if (typeof el.showPicker === 'function') {
            el.showPicker();
          } else {
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

        const applyRange = () => {
          const s = String(startEl.value || '').trim();
          const e = String(endEl.value || '').trim();
          if (!s || !e) return;
          // normaliza ordem
          const startYmd = (s <= e) ? s : e;
          const endYmd = (s <= e) ? e : s;
          state.customRange = { startYmd, endYmd };
          setCustomButtonAppliedLabel();
          closeCustomDatePicker();
          window.setDateFilter('custom');
        };

        const clearRange = () => {
          try { startEl.value = ''; } catch (e) {}
          try { endEl.value = ''; } catch (e) {}
          state.customRange = null;
          setCustomButtonAppliedLabel();
          closeCustomDatePicker();
          // fallback para mês (evita ficar em custom "vazio")
          window.setDateFilter('month');
        };

        applyBtn.addEventListener('click', applyRange);
        clearBtn.addEventListener('click', clearRange);

        // fechar ao clicar fora
        document.addEventListener('mousedown', (e) => {
          try {
            if (pop.style.display === 'none') return;
            const t = e && e.target ? e.target : null;
            if (!t) return;
            if (t === btn || btn.contains(t)) return;
            if (t === pop || pop.contains(t)) return;
            closeCustomDatePicker();
          } catch (e2) {}
        });
      }

      // DATE HELPERS (Mesma lógicamês anteiror, mantida para compatibilidade)
      function getDateRange(filter) {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);

        if (filter === 'custom') {
          const r = state.customRange;
          const sIso = r && r.startYmd ? __ymdToIsoUtcStart(r.startYmd) : null;
          const eIso = r && r.endYmd ? __ymdToIsoUtcEnd(r.endYmd) : null;
          if (sIso && eIso) return { start: sIso, end: eIso };
        }

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

        if (filter === 'custom') {
            try {
              const r = state.customRange;
              const sIso = r && r.startYmd ? __ymdToIsoUtcStart(r.startYmd) : null;
              const eIso = r && r.endYmd ? __ymdToIsoUtcEnd(r.endYmd) : null;
              if (sIso && eIso) {
                const sPrev = __shiftIsoYear(sIso, -1);
                const ePrev = __shiftIsoYear(eIso, -1);
                if (sPrev && ePrev) return { start: sPrev, end: ePrev };
              }
            } catch (e) {}
            // fallback: mês anterior
            filter = 'month';
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
            // Mês anterior ATÉ o mesmo dia do mês (comparativo MTD), para não ficar vazio
            // e para alinhar com o comportamento do gráfico (mês atual até hoje).
            const y = now.getFullYear();
            const m = now.getMonth(); // mês atual (0-based)
            const prevStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
            const daysInPrevMonth = new Date(y, m, 0).getDate();
            const d = Math.min(now.getDate(), daysInPrevMonth);
            const prevEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
            start = prevStart;
            end = prevEnd;
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
        const revenueMode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month'; // month|semester|year

        // Range do gráfico de faturamento (independente do header): calendário
        const chartRange = (() => {
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth();
          if (revenueMode === 'year') {
            const s = new Date(y, 0, 1, 0, 0, 0, 0).toISOString();
            const e = new Date(y, 11, 31, 23, 59, 59, 999).toISOString();
            return { start: s, end: e };
          }
          if (revenueMode === 'semester') {
            // v125+: Próximos 6 meses (incluindo mês atual) ao invés de últimos 6 meses
            const s = new Date(y, m, 1, 0, 0, 0, 0).toISOString();
            const e = new Date(y, m + 6, 0, 23, 59, 59, 999).toISOString();
            return { start: s, end: e };
          }
          // month (default)
          return { start: monthFullRange.start, end: monthFullRange.end };
        })();

        // Cutoff ajustado para o ano passado (evita zerar quando cutoff é recente)
        const cutoffLastYearIso = (cutoff && cutoff.enabled && cutoff.cutoffInstantIso)
          ? __shiftIsoYear(cutoff.cutoffInstantIso, -1)
          : null;
        
        // Faturamento/Vendas: compras aprovadas (compras.valor_total) por data_compra
        // Observação importante: NÃO aplicar cutoff por `created_at` em compras, pois existem compras
        // “backdated” (data_compra no período, mas created_at antigo), o que pode cortar dias no gráfico.
        // Performance (TV): selects menores + executar em paralelo
        let qCurr = sbClient
          .from('compras')
          .select('valor_total, data_compra, leadid');
        qCurr = applyApprovedPurchaseFilter(qCurr);
        qCurr = applyCutoffTimestamp(qCurr, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        if (state.selectedSeller) qCurr = qCurr.eq('vendedoresponsavel', state.selectedSeller);

        let qPrev = sbClient
          .from('compras')
          .select('valor_total, leadid');
        qPrev = applyApprovedPurchaseFilter(qPrev);
        qPrev = applyCutoffTimestamp(qPrev, 'data_compra').gte('data_compra', prevRange.start).lte('data_compra', prevRange.end);
        if (state.selectedSeller) qPrev = qPrev.eq('vendedoresponsavel', state.selectedSeller);

        let qMonth = sbClient
          .from('compras')
          .select('valor_total, data_compra, leadid');
        qMonth = applyApprovedPurchaseFilter(qMonth);
        qMonth = applyCutoffTimestamp(qMonth, 'data_compra')
          .gte('data_compra', chartRange.start)
          .lte('data_compra', chartRange.end);
        if (state.selectedSeller) qMonth = qMonth.eq('vendedoresponsavel', state.selectedSeller);

        // Ano passado (mesmo range do gráfico, shift -1 ano)
        const lastYearMonthStart = __shiftIsoYear(chartRange.start, -1) || chartRange.start;
        const lastYearMonthEnd = __shiftIsoYear(chartRange.end, -1) || chartRange.end;
        // v124+: Usar ano atual - 1 para label, não o ano da data inicial do range
        const lastYear = new Date().getFullYear() - 1;

        let qLY = sbClient
          .from('compras')
          .select('valor_total, data_compra, leadid');
        qLY = applyApprovedPurchaseFilter(qLY);
        qLY = applyCutoffTimestampAt(qLY, 'data_compra', cutoffLastYearIso)
          .gte('data_compra', lastYearMonthStart)
          .lte('data_compra', lastYearMonthEnd);
        if (state.selectedSeller) qLY = qLY.eq('vendedoresponsavel', state.selectedSeller);

        // KPI Faturamento (card): sempre comparar MÊS ATUAL (até hoje) vs MÊS ANTERIOR (até o mesmo dia),
        // usando a mesma fonte do gráfico (compras.data_compra / compras.valor_total).
        const nowRef = new Date();
        const monthStartIso = new Date(nowRef.getFullYear(), nowRef.getMonth(), 1, 0, 0, 0, 0).toISOString();
        const todayEndIso = new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate(), 23, 59, 59, 999).toISOString();
        const prevMonthStartIso = new Date(nowRef.getFullYear(), nowRef.getMonth() - 1, 1, 0, 0, 0, 0).toISOString();
        const daysInPrevMonth = new Date(nowRef.getFullYear(), nowRef.getMonth(), 0).getDate();
        const prevMonthDay = Math.min(nowRef.getDate(), daysInPrevMonth);
        const prevMonthEndIso = new Date(nowRef.getFullYear(), nowRef.getMonth() - 1, prevMonthDay, 23, 59, 59, 999).toISOString();

        let qPrevMonthMtd = sbClient
          .from('compras')
          .select('valor_total, data_compra, leadid');
        qPrevMonthMtd = applyApprovedPurchaseFilter(qPrevMonthMtd);
        qPrevMonthMtd = applyCutoffTimestamp(qPrevMonthMtd, 'data_compra')
          .gte('data_compra', prevMonthStartIso)
          .lte('data_compra', prevMonthEndIso);
        if (state.selectedSeller) qPrevMonthMtd = qPrevMonthMtd.eq('vendedoresponsavel', state.selectedSeller);

        // CRM meta/ciclos em paralelo
        const pMeta = getGaugeTargetRevenueFromCrm();
        const pCiclos = getCiclosForCurrentContext();

        // Importante: não bloquear o primeiro render do gráfico esperando o ano passado.
        // Renderiza rápido (Realizado + Meta) e depois atualiza a série 2025 quando chegar.
        const [
          { data: dataCurr },
          { data: dataPrev },
          { data: monthRows },
          { data: prevMonthRows },
          monthlyMeta,
          ciclos
        ] = await Promise.all([qCurr, qPrev, qMonth, qPrevMonthMtd, pMeta, pCiclos]);

        // Agência: filtrar rows de compras via leadid (compras não tem coluna agencia)
        let dataCurrRows = dataCurr || [];
        let dataPrevRows = dataPrev || [];
        let monthRowsFiltered = monthRows || [];
        let prevMonthRowsFiltered = prevMonthRows || [];
        try { dataCurrRows = await filterRowsByAgencyViaLeadId(dataCurrRows, (r) => r && r.leadid); } catch (e) {}
        try { dataPrevRows = await filterRowsByAgencyViaLeadId(dataPrevRows, (r) => r && r.leadid); } catch (e) {}
        try { monthRowsFiltered = await filterRowsByAgencyViaLeadId(monthRowsFiltered, (r) => r && r.leadid); } catch (e) {}
        try { prevMonthRowsFiltered = await filterRowsByAgencyViaLeadId(prevMonthRowsFiltered, (r) => r && r.leadid); } catch (e) {}

        // --- GRÁFICO: EVOLUÇÃO MENSAL (sempre mês inteiro) ---
        // - categorias: 1..último dia do mês atual (mesmo se hoje for dia 01)
        // - realizado: acumulado até hoje (futuro fica 0 e o acumulado se mantém)
        // - meta: acumulada proporcional aos dias do mês (meta mensal / diasNoMês)
        try {
          // Gráfico: range independente do header (Mês/Semestre/Ano)
          // v123+: Sempre usar monthRowsFiltered (chartRange) ao invés de fallback para dataCurrRows
          let chartLeads = monthRowsFiltered || [];

          const mult = (revenueMode === 'semester') ? 6 : (revenueMode === 'year') ? 12 : 1;
          const metaTotalMode = (Number(monthlyMeta) || 0) * mult;
          const metaOverride = (revenueMode === 'month' && Array.isArray(ciclos) && ciclos.length > 0)
            ? { mode: 'monthly_steps', metaTotal: metaTotalMode, ciclos }
            : metaTotalMode; // fallback: linear

          const chartData = processRevenueData(chartLeads, chartRange.start, chartRange.end, metaOverride);
          try { state.revenueChartData = chartData; } catch (e) {}

          // Cache: valores do card Faturamento (Mês atual até hoje + meta no dia atual)
          try {
            const todayKey = formatYmdLocal(new Date());
            const todayIdx = (Array.isArray(chartData.rawDates) && todayKey) ? chartData.rawDates.indexOf(todayKey) : -1;
            const metaAtToday = (todayIdx >= 0 && Array.isArray(chartData.seriesMeta)) ? chartData.seriesMeta[todayIdx] : null;

            const monthToDateRevenue = (chartLeads || []).reduce((acc, r) => {
              try {
                if (!r || !r.data_compra) return acc;
                const d = new Date(r.data_compra);
                if (!d || Number.isNaN(d.getTime())) return acc;
                if (d.toISOString() <= todayEndIso) return acc + parseCurrency(r.valor_total);
                return acc;
              } catch (e) {
                return acc;
              }
            }, 0);

            state.__kpi0MonthToDateRevenue = monthToDateRevenue;
            state.__kpi0MetaAtToday = (typeof metaAtToday === 'number' && Number.isFinite(metaAtToday)) ? metaAtToday : null;
            state.__kpi0LastYearMonthToDateRevenue = null; // será preenchido quando qLY retornar
          } catch (e) {}

          // Inicialmente, deixa a série 2025 como 0 (não bloqueia render)
          try {
            if (!Array.isArray(chartData.seriesLastYear) || chartData.seriesLastYear.length !== chartData.seriesData.length) {
              chartData.seriesLastYear = new Array(chartData.seriesData.length).fill(0);
            }
            chartData.seriesLastYearName = `${lastYear}`;
          } catch (e) {}

          // Se o dashboard ainda está oculto (skeleton), não renderizar o Apex (ele “nasce” com width 0 e fica branco).
          // Guardamos o chartData e renderizamos assim que o content ficar visível.
          const isRevenueContainerVisible = () => {
            try {
              const content = document.getElementById('dashboard-content');
              if (!content || content.style.display === 'none') return false;
              const el = document.getElementById('revenue-chart');
              const w = el ? (el.getBoundingClientRect ? el.getBoundingClientRect().width : el.offsetWidth) : 0;
              return w > 20;
            } catch (e) {
              return true;
            }
          };

          if (!isRevenueContainerVisible()) {
            try { state.__pendingRevenueChartData = chartData; } catch (e) {}
          } else {
            renderRevenue(chartData);
          }

          // Depois: carregar ano passado e atualizar (sem travar o carregamento do gráfico)
          (async () => {
            try {
              const { data: rowsLYraw } = await qLY;
              const rowsLY = await filterRowsByAgencyViaLeadId((rowsLYraw || []), (r) => r && r.leadid);
              const keys = Array.isArray(chartData.rawDates) ? chartData.rawDates : [];
              const dailyTotalsByKey = {};
              keys.forEach(k => { dailyTotalsByKey[k] = 0; });

              // Mapear os valores do ano passado para o eixo atual:
              // - Se o gráfico está em modo mensal (isYearly), keys = YYYY-MM
              // - Se está em modo diário, keys = YYYY-MM-DD
              const refStart = new Date(String(chartRange.start));
              const currentYear = (refStart && !Number.isNaN(refStart.getTime())) ? refStart.getFullYear() : (new Date().getFullYear());
              const isYearly = !!chartData.isYearly;
              const currentMonth = (refStart && !Number.isNaN(refStart.getTime())) ? refStart.getMonth() : (new Date().getMonth());

              (rowsLY || []).forEach(r => {
                if (!r || !r.data_compra) return;
                try {
                  const d = new Date(r.data_compra);
                  if (Number.isNaN(d.getTime())) return;

                  if (isYearly) {
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const mappedKey = `${currentYear}-${mm}`; // YYYY-MM
                    if (Object.prototype.hasOwnProperty.call(dailyTotalsByKey, mappedKey)) {
                      dailyTotalsByKey[mappedKey] += parseCurrency(r.valor_total);
                    }
                    return;
                  }

                  const dom = d.getDate();
                  const mapped = new Date(currentYear, currentMonth, dom, 12, 0, 0, 0);
                  const mappedKey = formatYmdLocal(mapped); // YYYY-MM-DD
                  if (mappedKey && Object.prototype.hasOwnProperty.call(dailyTotalsByKey, mappedKey)) {
                    dailyTotalsByKey[mappedKey] += parseCurrency(r.valor_total);
                  }
                } catch (e) {}
              });

              let run = 0;
              const seriesLastYear = keys.map(k => {
                run += (Number.isFinite(dailyTotalsByKey[k]) ? dailyTotalsByKey[k] : 0);
                return run;
              });

              chartData.seriesLastYear = seriesLastYear;
              chartData.seriesLastYearName = `${lastYear}`;

              // Atualizar KPI "vs 2025" usando a mesma série do gráfico (acumulado até o dia atual)
              try {
                const todayKey = formatYmdLocal(new Date());
                const todayIdx = (Array.isArray(chartData.rawDates) && todayKey) ? chartData.rawDates.indexOf(todayKey) : -1;
                const lyMtd = (todayIdx >= 0 && Array.isArray(seriesLastYear)) ? seriesLastYear[todayIdx] : null;
                if (typeof lyMtd === 'number' && Number.isFinite(lyMtd)) {
                  state.__kpi0LastYearMonthToDateRevenue = lyMtd;
                  const cur = (typeof state.__kpi0MonthToDateRevenue === 'number' && Number.isFinite(state.__kpi0MonthToDateRevenue)) ? state.__kpi0MonthToDateRevenue : 0;
                  const base = lyMtd;
                  const missing = !(base > 0) || !(cur > 0);
                  const variation = base > 0 ? ((cur - base) / base) * 100 : (cur > 0 ? 100 : 0);
                  const isFlat = Math.round(variation * 10) === 0;
                  if (state.kpis && state.kpis[0] && state.kpis[0].vs3) {
                    state.kpis[0].vs3.missing = missing;
                    state.kpis[0].vs3.v = missing ? 0 : Math.abs(variation).toFixed(2);
                    state.kpis[0].vs3.neutral = missing ? true : isFlat;
                    state.kpis[0].vs3.up = (missing || isFlat) ? true : (variation >= 0);
                    state.kpis[0].vs3.l = `vs ${lastYear}`;
                  }
                  renderKPIs();
                }
              } catch (e) {}

              if (!isRevenueContainerVisible()) {
                try { state.__pendingRevenueChartData = chartData; } catch (e) {}
              } else {
                renderRevenue(chartData);
              }
            } catch (e) {}
          })();
        } catch (e) {}

        // dataPrev já veio em paralelo acima

        const currentSales = dataCurrRows ? dataCurrRows.length : 0;
        const currentRevenue = dataCurrRows ? dataCurrRows.reduce((acc, curr) => acc + parseCurrency(curr.valor_total), 0) : 0;
        const prevSales = dataPrevRows ? dataPrevRows.length : 0;
        const prevRevenue = dataPrevRows ? dataPrevRows.reduce((acc, curr) => acc + parseCurrency(curr.valor_total), 0) : 0;
        const currentTicket = currentSales > 0 ? currentRevenue / currentSales : 0;
        const prevTicket = prevSales > 0 ? prevRevenue / prevSales : 0;

        // Cache leve para permitir recomputar KPIs dependentes do investimento sem refazer todas as queries
        try {
          state.__revenueAgg = { currentSales, currentRevenue, prevSales, prevRevenue, currentTicket, prevTicket, updatedAt: Date.now() };
        } catch (e) {}

        // --- Conversão global (no período): leads fechados / leads captados ---
        // leads captados = leads.created_at no range (respeita seller e cutoff)
        let queryCaptados = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true });
        queryCaptados = applyCutoffTimestamp(queryCaptados, 'created_at')
          .gte('created_at', start)
          .lte('created_at', end);
        if (state.selectedSeller) queryCaptados = queryCaptados.eq('vendedorResponsavel', state.selectedSeller);
        queryCaptados = applyAgencyFilterToLeadQuery(queryCaptados);
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
        queryCaptadosPrev = applyAgencyFilterToLeadQuery(queryCaptadosPrev);
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
        queryLeads = applyAgencyFilterToLeadQuery(queryLeads);
        const { count: countLeads } = await queryLeads;

        // Query para contar Leads Ativos do período anterior (para comparação)
        let queryLeadsPrev = sbClient
          .from('leads')
          .select('lead_id', { count: 'exact', head: true })
          .not('vendedorResponsavel', 'is', null);
        queryLeadsPrev = applyCutoffTimestamp(queryLeadsPrev, 'created_at').gte('created_at', prevRange.start)
          .lte('created_at', prevRange.end);
        if (state.selectedSeller) queryLeadsPrev = queryLeadsPrev.eq('vendedorResponsavel', state.selectedSeller);
        queryLeadsPrev = applyAgencyFilterToLeadQuery(queryLeadsPrev);
        const { count: countLeadsPrev } = await queryLeadsPrev;

        // --- Conversão de Oportunidades -> Vendas (no período): vendas / oportunidades ---
        const convOportunidadesPct = (countLeads && countLeads > 0)
          ? (currentSales / countLeads) * 100
          : 0;
        const convOportunidadesPctPrev = (countLeadsPrev && countLeadsPrev > 0)
          ? (prevSales / countLeadsPrev) * 100
          : 0;

        // --- REUNIÕES (KPI): contagem de linhas em agendamento no período (exclui Cancelada e diretores) ---
        const meetingsRange = getMeetingsDateRange(state.dateFilter);
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
            const filtered = (rows || []).filter(r => !directorIds.includes(r.vendedor));
            return filtered.length;
          } catch (e) {
            return 0;
          }
        };

        // --- PROPOSTAS (KPI): contagem de LEADS ÚNICOS com proposta no período ---
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

            const proposedLeadIdsBySeller = {};
            const proposalsNeedingLeadFallback = [];

            (props || []).forEach(p => {
              if (!p) return;
              if (p.id_vendedor) {
                if (directorIds.includes(p.id_vendedor)) return;
                const sid = String(p.id_vendedor);
                if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
              } else if (p.id_lead) {
                proposalsNeedingLeadFallback.push(p);
              }
            });

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
                  if (directorIds.includes(l.vendedorResponsavel)) return;
                  const sid = String(l.vendedorResponsavel);
                  if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
                  proposedLeadIdsBySeller[sid].add(String(l.lead_id));
                });
              }
            }

            if (state.selectedSeller) {
              const sellerLeads = proposedLeadIdsBySeller[state.selectedSeller];
              return sellerLeads ? sellerLeads.size : 0;
            }

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

        const meetingsCount = await countMeetingRowsForRange(meetingsRange.startYmd, meetingsRange.endYmd);
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

        const investment = state.marketingInvestment;
        const investmentPrev = state.marketingInvestmentPrev || 0;
        const cac = currentSales > 0 ? investment / currentSales : 0;
        const cacPrev = prevSales > 0 ? (investmentPrev / prevSales) : 0;
        const roas = investment > 0 ? currentRevenue / investment : 0;
        const roasPrev = investmentPrev > 0 ? (prevRevenue / investmentPrev) : 0;

        // --- KPI 0 (Faturamento) vs Meta (vs2) ---
        // No TV, este card sempre segue o MÊS do gráfico (compras) e compara até o dia atual.
        const kpi0Current = (typeof state.__kpi0MonthToDateRevenue === 'number' && Number.isFinite(state.__kpi0MonthToDateRevenue))
          ? state.__kpi0MonthToDateRevenue
          : currentRevenue;
        const kpi0PrevMonth = (prevMonthRows && prevMonthRows.length)
          ? prevMonthRows.reduce((acc, r) => acc + parseCurrency(r.valor_total), 0)
          : 0;
        const kpi0MetaAtToday = (typeof state.__kpi0MetaAtToday === 'number' && Number.isFinite(state.__kpi0MetaAtToday))
          ? state.__kpi0MetaAtToday
          : null;

        if (state.kpis && state.kpis[0] && state.kpis[0].vs2) {
          const metaBase = (kpi0MetaAtToday !== null) ? kpi0MetaAtToday : 0;
          const metaMissing = !(metaBase > 0) || !(kpi0Current > 0);
          const metaVar = metaBase > 0 ? ((kpi0Current - metaBase) / metaBase) * 100 : (kpi0Current > 0 ? 100 : 0);
          const metaIsFlat = Math.round(metaVar * 10) === 0;
          state.kpis[0].vs2.missing = metaMissing;
          state.kpis[0].vs2.v = metaMissing ? 0 : Math.abs(metaVar).toFixed(2);
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
            state.kpis[index].vs2.v = missing ? 0 : Math.abs(variation).toFixed(2);
            state.kpis[index].vs2.neutral = missing ? true : isFlat;
            state.kpis[index].vs2.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
            // mantém label existente (renderiza como "Méd." via shortLabel)
          }
        };

        // Aplica "Méd." apenas onde o card realmente usa vs2 como média (todos exceto KPI 0 que usa meta)
        setVs2(1, convGlobalPct, baseline2025Avg.convPct);
        setVs2(2, convOportunidadesPct, baseline2025Avg.convOportunidadesPct);
        setVs2(3, (countLeads || 0), baseline2025Avg.leadsAtivosProxy);
        setVs2(4, proposalsCount, baseline2025Avg.propostas);
        setVs2(5, meetingsCount, baseline2025Avg.reunioes);
        setVs2(6, (countCaptados || 0), baseline2025Avg.captados);
        setVs2(7, currentSales, baseline2025Avg.vendas);
        setVs2(8, currentTicket, baseline2025Avg.ticket);
        setVs2(9, investment, baseline2025Avg.investimento);
        setVs2(10, cac, baseline2025Avg.cac, { betterWhenLower: true });
        setVs2(11, roas, baseline2025Avg.roas);

        // --- Comparativo vs ANO ANTERIOR (vs3) MOCADO com pro-rata por dias ---
        // Funciona para qualquer filtro do header (Hoje/Semana/Mês/Ano/Semestre/Custom),
        // usando o MESMO range do KPI (getDateRange) e escalando os totais do ano anterior por rangeDays/diasNoAno.
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
            state.kpis[index].vs3.v = missing ? 0 : Math.abs(variation).toFixed(2);
            state.kpis[index].vs3.neutral = missing ? true : isFlat;
            state.kpis[index].vs3.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
            state.kpis[index].vs3.l = `vs ${baseline2024.year}`;
          }
        };

        // Mapeamento KPIs -> baseline 2024 pro-rata
        setVs3(0, currentRevenue, baseline2024.faturamento);
        setVs3(1, convGlobalPct, baseline2024.convPct);
        setVs3(2, convOportunidadesPct, baseline2024.convOportunidadesPct);
        setVs3(3, (countLeads || 0), baseline2024.leadsAtivosProxy); // oportunidades (proxy)
        setVs3(4, proposalsCount, baseline2024.propostas);
        setVs3(5, meetingsCount, baseline2024.reunioes);
        setVs3(6, (countCaptados || 0), baseline2024.captados);
        setVs3(7, currentSales, baseline2024.vendas);
        setVs3(8, currentTicket, baseline2024.ticket);
        setVs3(9, investment, baseline2024.investimento);
        setVs3(10, cac, baseline2024.cac, { betterWhenLower: true });
        setVs3(11, roas, baseline2024.roas);

        const updateKPI = (index, value, prevValue, formatFunc = (v)=>v, opts = {}) => {
            const betterWhenLower = !!opts.betterWhenLower;
            const variation = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0);
            const isFlat = Math.round(variation * 10) === 0; // neutro quando renderiza 0.0%
            const missing = !(prevValue > 0) || !(value > 0);
            state.kpis[index].v = formatFunc(value);
            state.kpis[index].vs1.missing = missing;
            state.kpis[index].vs1.v = missing ? 0 : Math.abs(variation).toFixed(2);
            // 0% (igualdade) deve ser neutro, não verde/vermelho
            state.kpis[index].vs1.neutral = missing ? true : isFlat;
            state.kpis[index].vs1.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
        };

        // KPIs (ordem): 0 Faturamento, 1 Conv Global, 2 Conv Oportunidades, 3 Oportunidades,
        // 4 Propostas, 5 Reuniões, 6 Captados, 7 Qtd Vendas, 8 Ticket, 9 Invest, 10 CAC, 11 ROAS
        updateKPI(0, kpi0Current, kpi0PrevMonth, formatCurrency);
        updateKPI(1, convGlobalPct, convGlobalPctPrev, (v) => v.toFixed(2) + "%");
        updateKPI(2, convOportunidadesPct, convOportunidadesPctPrev, (v) => v.toFixed(2) + "%");
        updateKPI(3, countLeads || 0, countLeadsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(4, proposalsCount || 0, proposalsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(5, meetingsCount || 0, meetingsPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(6, countCaptados || 0, countCaptadosPrev || 0, (v) => Number(v || 0).toLocaleString('pt-BR'));
        updateKPI(7, currentSales, prevSales, (v) => String(Math.round(Number(v) || 0)));
        updateKPI(8, currentTicket, prevTicket, formatCurrency);
        updateKPI(9, investment, investmentPrev, formatCurrency);
        // CAC: menor é melhor no comparativo vs mês
        updateKPI(10, cac, cacPrev, formatCurrency, { betterWhenLower: true });
        updateKPI(11, roas, roasPrev, (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00') + "x");

        // KPI 0 vs3: sobrescreve o "mocado" e usa compras de 2025 no mesmo mês (até o dia atual).
        // Se ainda não chegou (qLY), mantém placeholder e será atualizado no callback do qLY.
        try {
          const lyBase = (typeof state.__kpi0LastYearMonthToDateRevenue === 'number' && Number.isFinite(state.__kpi0LastYearMonthToDateRevenue))
            ? state.__kpi0LastYearMonthToDateRevenue
            : null;
          const lastY = getPrevYear();
          if (state.kpis && state.kpis[0] && state.kpis[0].vs3) {
            if (lyBase === null) {
              state.kpis[0].vs3.missing = true;
              state.kpis[0].vs3.v = 0;
              state.kpis[0].vs3.neutral = true;
              state.kpis[0].vs3.up = true;
              state.kpis[0].vs3.l = `vs ${lastY}`;
            } else {
              const base = lyBase;
              const cur = kpi0Current;
              const missing = !(base > 0) || !(cur > 0);
              const variation = base > 0 ? ((cur - base) / base) * 100 : (cur > 0 ? 100 : 0);
              const isFlat = Math.round(variation * 10) === 0;
              state.kpis[0].vs3.missing = missing;
              state.kpis[0].vs3.v = missing ? 0 : Math.abs(variation).toFixed(2);
              state.kpis[0].vs3.neutral = missing ? true : isFlat;
              state.kpis[0].vs3.up = (missing || isFlat) ? true : (variation >= 0);
              state.kpis[0].vs3.l = `vs ${lastY}`;
            }
          }
        } catch (e) {}

        renderKPIs();

        // --- UPDATE GAUGE WITH REAL DATA ---
        // v122+: O velocímetro agora respeita o filtro de data selecionado (month, semester, year)
        // e ajusta a meta proporcionalmente (x6 para semestre, x12 para ano).
        const targetRevenueMonthly = await getGaugeTargetRevenueFromCrm(); // Meta Mensal (CRM) — vendedor selecionado ou global

        // Ajustar meta baseado no filtro atual
        let targetRevenue = targetRevenueMonthly;
        let periodMultiplier = 1; // meses no período

        if (state.dateFilter === 'semester') {
          periodMultiplier = 6;
          targetRevenue = targetRevenueMonthly * 6;
        } else if (state.dateFilter === 'year') {
          periodMultiplier = 12;
          targetRevenue = targetRevenueMonthly * 12;
        }

        // Usar dados já carregados (currentRevenue/prevRevenue respeitam o filtro atual)
        let gaugeCurrentRevenue = currentRevenue;
        let gaugePrevRevenue = prevRevenue;

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

        // Buscar lista de IDs de diretores para excluir das contagens (alinhado ao dashboard)
        let directorIds = [];
        try {
          const { data: directors } = await sbClient
            .from('vendedores')
            .select('id')
            .eq('diretorVendas', true);
          directorIds = (directors || []).map(d => d.id).filter(Boolean);
        } catch (e) {}

        // Labels dinâmicos (alinhado ao dashboard):
        // - meetings-today => Total no período do header
        // - meetings-week  => Agendadas (futuras) no período
        // - meetings-month => Realizadas (passadas) no período
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
          let rows = (data || []);
          // Filtrar: excluir reuniões de diretores
          rows = (rows || []).filter(r => r && !directorIds.includes(r.vendedor));
          // Filtrar por agência via leadId
          rows = await filterRowsByAgencyViaLeadId(rows, (r) => r && r.leadId);
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
        } catch (e) {}

        let countNow = 0;
        // “Acontecendo agora”: faz sentido manter apenas agendadas (não realizadas/canceladas)
        let queryNow = sbClient.from('agendamento').select('hora, data, leadId, vendedor').eq('statusReuniao', 'agendado').not('leadId', 'is', null);
        queryNow = applyCutoffDateYmd(queryNow, 'data').eq('data', todayRange.startYmd);
        if (state.selectedSeller) queryNow = queryNow.eq('vendedor', state.selectedSeller);
        const { data: dataNow } = await queryNow;
        if (dataNow) {
            const currentHour = now.getHours();
            let rowsNow = (dataNow || []).filter(r => r && !directorIds.includes(r.vendedor));
            rowsNow = await filterRowsByAgencyViaLeadId(rowsNow, (r) => r && r.leadId);
            countNow = rowsNow.filter(r => {
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
        
        // --- 1. FRT Pré-vendas ---
        let avgFRT = 0;
        let slaFRT = 0;
        try {
          const frtEvents = await computeFRTEventsHardcut();
          const frtCount = frtEvents.length;
          const frtTotalMinutes = frtEvents.reduce((acc, e) => acc + (Number(e.diffMinutes) || 0), 0);
          const frtWithin = frtEvents.reduce((acc, e) => acc + ((Number(e.diffMinutes) || 0) <= 20 ? 1 : 0), 0);
          avgFRT = frtCount > 0 ? Math.round(frtTotalMinutes / frtCount) : 0;
          slaFRT = frtCount > 0 ? Math.round((frtWithin / frtCount) * 100) : 0;
        } catch (e) {}
        console.log(`FRT(hardcut): ${avgFRT}min SLA:${slaFRT}%`);

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

        const { data: comprasCiclo } = await qComprasCiclo;

        // Buscar created_at dos leads envolvidos para calcular ciclo
        const leadCreatedAtMap = {};
        const leadIdsCiclo = [...new Set((comprasCiclo || []).map(r => r && r.leadid).filter(Boolean))];
        for (const chunk of chunkArray(leadIdsCiclo, 500)) {
          let qLeads = sbClient
            .from('leads')
            .select('lead_id, created_at')
            .in('lead_id', chunk);
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

        // --- 3. Tempo Proposta ---
        // Regra (nova): medir em quanto tempo (HORAS ÚTEIS) o lead recebe a 1ª proposta após entrar na etapa-base da proposta.
        // t0: 1ª entrada na etapa (loogsLeads.etapa_posterior = PROPOSAL_STAGE_ID) dentro do período do header
        // t1: 1ª proposta (imagemProposta.created_at) do lead com created_at > t0 (pode ser após o fim do período)
        // delta: businessMinutes(t0,t1)/60 usando params.businessHours + exclude_weekends
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

          const { data: enterRows } = await qEnter;
          (enterRows || []).forEach((r) => {
            const lid = r && r.lead ? String(r.lead) : '';
            if (!lid || !r.created_at) return;
            const t0Ms = Date.parse(String(r.created_at));
            if (!Number.isFinite(t0Ms)) return;
            if (entryByLead[lid]) return; // já temos a 1ª (query está ordenada asc)
            entryByLead[lid] = {
              t0Ms,
              entryVendorId: r && r.vendedor_id ? String(r.vendedor_id) : null,
            };
          });

          const leadIds = Object.keys(entryByLead);
          if (leadIds.length) {
            // 2) Buscar propostas (t1) para esses leads, permitindo que ocorra após o fim do período
            const nowIso = new Date().toISOString();
            const proposalsBestByLead = {}; // leadId -> { t1Ms, proposalVendorId }

            for (const chunk of chunkArray(leadIds, 500)) {
              let qProps = sbClient
                .from('imagemProposta')
                .select('created_at, id_lead, id_vendedor')
                .in('id_lead', chunk)
                .not('id_lead', 'is', null);
              qProps = applyCutoffTimestamp(qProps, 'created_at')
                .gte('created_at', start)
                .lte('created_at', nowIso);

              if (state.selectedSeller) {
                // Se id_vendedor vier preenchido, ele é a autoria.
                // Então propostas com id_vendedor != selectedSeller nunca entram; mantemos null para fallback.
                qProps = qProps.or(`id_vendedor.eq.${state.selectedSeller},id_vendedor.is.null`);
              }

              const { data: propsRows } = await qProps;
              (propsRows || []).forEach((p) => {
                const lid = p && p.id_lead ? String(p.id_lead) : '';
                const entry = lid && entryByLead[lid] ? entryByLead[lid] : null;
                if (!entry || !p.created_at) return;
                const t1Ms = Date.parse(String(p.created_at));
                if (!Number.isFinite(t1Ms)) return;
                if (!(t1Ms > entry.t0Ms)) return; // precisa ser após t0

                const prev = proposalsBestByLead[lid];
                if (prev && Number.isFinite(prev.t1Ms) && prev.t1Ms <= t1Ms) return;

                proposalsBestByLead[lid] = {
                  t1Ms,
                  proposalVendorId: p && p.id_vendedor ? String(p.id_vendedor) : null,
                };
              });
            }

            // 3) Fallback de vendedor (leads.vendedorResponsavel) somente quando necessário
            const needLeadVendor = [];
            Object.keys(proposalsBestByLead).forEach((lid) => {
              const entry = entryByLead[lid];
              const p = proposalsBestByLead[lid];
              if (!p) return;
              const hasSeller = !!(p.proposalVendorId || (entry && entry.entryVendorId));
              if (!hasSeller) needLeadVendor.push(lid);
            });

            const vendorByLead = {};
            if (needLeadVendor.length) {
              for (const chunk of chunkArray(needLeadVendor, 500)) {
                let qLeads = sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', chunk);
                // (cutoff não é estritamente necessário para lookup de vendedor, mas mantemos consistência)
                qLeads = applyCutoffTimestamp(qLeads, 'created_at');
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
        } catch (e) {}

        const avgProp = propCount > 0 ? Math.round(propTotalHours / propCount) : 0;
        const slaProp = propCount > 0 ? Math.round((propWithin / propCount) * 100) : 0;
        console.log(`Proposta: ${avgProp}h (${propCount}) SLA:${slaProp}%`);

        // --- 4. Follow-up ---
        // Regra: tempo médio entre mudanças Follow1 -> Follow2 -> Follow3 (via loogsLeads etapas).
        let followTotalHours = 0;
        let followCount = 0;
        let followWithin = 0;

        // FOLLOW-UP (novo): medir por transições de etapa em loogsLeads e em HORAS ÚTEIS (09–19 seg–sex SP),
        // ignorando 19h–9h e fins de semana.
        // IDs (hardcoded, fornecidos): FLW1/2/3.
        const FLW1_ID = 'dde9e8fa-142f-411b-b6f3-6c1f9f6cc0c9';
        const FLW2_ID = '169eb74f-ee37-4b49-9848-6866fd3b8af9';
        const FLW3_ID = 'f9e89423-7b32-4680-90aa-be7480a5dc0a';

        // 1) Descobrir leads que entraram em algum FLW no período do header (critério do usuário)
        const leadSet = new Set();
        try {
          let qEnter = sbClient
            .from('loogsLeads')
            .select('lead')
            .in('etapa_posterior', [FLW1_ID, FLW2_ID, FLW3_ID])
            .not('lead', 'is', null);
          qEnter = applyCutoffTimestamp(qEnter, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);
          if (state.selectedSeller) qEnter = qEnter.eq('vendedor_id', state.selectedSeller);

          const { data: enterRows } = await qEnter;
          (enterRows || []).forEach(r => { if (r && r.lead) leadSet.add(String(r.lead)); });
        } catch (e) {}

        const leadIds = Array.from(leadSet);
        if (leadIds.length) {
          // 2) Buscar logs desses leads (lookback) para calcular:
          // - 1ª entrada em cada FLW (global, não só dentro do período)
          // - último log antes do FLW1 (para delta do FLW1)
          const LOOKBACK_DAYS = 180;
          const lookbackIso = (() => {
            try {
              const d = new Date(start);
              if (Number.isNaN(d.getTime())) return start;
              d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS);
              return d.toISOString();
            } catch (e) {
              return start;
            }
          })();

          const byLead = {}; // leadId -> { first1, first2, first3, lastBefore1 }
          leadIds.forEach(id => { byLead[id] = { first1: null, first2: null, first3: null, lastBefore1: null }; });

          for (const chunk of chunkArray(leadIds, 500)) {
            let q = sbClient
              .from('loogsLeads')
              .select('created_at, lead, etapa_posterior, vendedor_id')
              .in('lead', chunk)
              .not('lead', 'is', null)
              .order('created_at', { ascending: true });
            q = applyCutoffTimestamp(q, 'created_at')
              .gte('created_at', lookbackIso)
              .lte('created_at', end);
            if (state.selectedSeller) q = q.eq('vendedor_id', state.selectedSeller);

            const { data: rows } = await q;
            const lastTByLead = {}; // leadId -> last timestamp (ms) visto (para lastBefore1)
            (rows || []).forEach(r => {
              const lid = r && r.lead ? String(r.lead) : '';
              const rec = lid && byLead[lid] ? byLead[lid] : null;
              if (!rec || !r.created_at) return;
              const t = Date.parse(String(r.created_at));
              if (!Number.isFinite(t)) return;

              const stage = r.etapa_posterior ? String(r.etapa_posterior) : '';
              if (stage === FLW1_ID && rec.first1 === null) {
                // lastBefore1 = último log antes do primeiro FLW1
                const prev = lastTByLead[lid];
                if (Number.isFinite(prev)) rec.lastBefore1 = prev;
                rec.first1 = t;
              }
              if (stage === FLW2_ID && rec.first2 === null) rec.first2 = t;
              if (stage === FLW3_ID && rec.first3 === null) rec.first3 = t;
              lastTByLead[lid] = t;
            });
          }

          const startMs = Date.parse(String(start));
          const endMs = Date.parse(String(end));

          const addBusinessDiffHours = (fromMs, toMs) => {
            if (!(Number.isFinite(fromMs) && Number.isFinite(toMs))) return;
            if (!(toMs > fromMs)) return;
            const minutes = __businessMinutesBetweenWeekdaysMs(fromMs, toMs, __BUSINESS_HOURS_CFG);
            const h = minutes / 60;
            if (h > 0 && h < 720) {
              followTotalHours += h;
              followCount += 1;
              if (h <= 24) followWithin += 1;
            }
          };

          Object.keys(byLead).forEach((lid) => {
            const r = byLead[lid];
            if (!r) return;

            // FLW1: considera se a 1ª entrada no FLW1 ocorreu dentro do header
            if (r.first1 !== null && Number.isFinite(startMs) && Number.isFinite(endMs) && r.first1 >= startMs && r.first1 <= endMs) {
              addBusinessDiffHours(r.lastBefore1, r.first1);
            }

            // FLW2: considera se a 1ª entrada no FLW2 ocorreu dentro do header
            if (r.first2 !== null && Number.isFinite(startMs) && Number.isFinite(endMs) && r.first2 >= startMs && r.first2 <= endMs) {
              addBusinessDiffHours(r.first1, r.first2);
            }

            // FLW3: considera se a 1ª entrada no FLW3 ocorreu dentro do header
            if (r.first3 !== null && Number.isFinite(startMs) && Number.isFinite(endMs) && r.first3 >= startMs && r.first3 <= endMs) {
              addBusinessDiffHours(r.first2, r.first3);
            }
          });
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

        // Atualiza caches (para avatar do filtro e reuniões)
        try {
          const nameMap = state.sellerNameById || {};
          const imgMap = state.sellerImgById || {};
          sellers.forEach(s => {
            if (!s || !s.id) return;
            nameMap[s.id] = s.nome || String(s.id);
            imgMap[s.id] = s.perfil_img || null;
          });
          state.sellerNameById = nameMap;
          state.sellerImgById = imgMap;
        } catch (e) {}
        
        // Initialize Map
        const sellerMap = {};
        sellers.forEach(s => {
            sellerMap[s.id] = {
                id: s.id,
                name: s.nome,
                perfilImg: s.perfil_img || null,
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
        let queryMeetings = sbClient.from('agendamento').select('vendedor, score_final, leadId');
        // Para week/month: incluir reuniões futuras até o fim do período
        queryMeetings = applyCutoffDateYmd(queryMeetings, 'data').gte('data', meetRange.startYmd).lte('data', meetRange.endYmd);
        queryMeetings = applyMeetingNotCanceledFilter(queryMeetings);
        if (state.selectedSeller) queryMeetings = queryMeetings.eq('vendedor', state.selectedSeller);
        const { data: meetings } = await queryMeetings;
        const meetingsFiltered = await filterRowsByAgencyViaLeadId((meetings || []), (m) => m && m.leadId);
        
        if (meetingsFiltered) {
            meetingsFiltered.forEach(m => {
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
        const { data: proposalsRaw } = await proposalsQuery;
        const proposals = await filterRowsByAgencyViaLeadId((proposalsRaw || []), (p) => p && p.id_lead);
        
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
                let qLeads = await sbClient
                  .from('leads')
                  .select('lead_id, vendedorResponsavel')
                  .in('lead_id', leadIds);
                qLeads = applyAgencyFilterToLeadQuery(qLeads);
                const { data: leads } = await qLeads;
                
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
        // Vendas/faturamento por executivo: compras aprovadas (compras.valor_total) por data_compra
        let querySales = sbClient.from('compras')
            .select('vendedoresponsavel, valor_total, leadid, data_compra, created_at');
        querySales = applyApprovedPurchaseFilter(querySales);
        querySales = applyCutoffTimestamp(querySales, 'data_compra').gte('data_compra', start)
            .lte('data_compra', end);
        querySales = applyCutoffTimestamp(querySales, 'created_at');
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
          q = applyCutoffTimestamp(q, 'created_at');
          q = applyAgencyFilterToLeadQuery(q);
          const { data: rows } = await q;
          (rows || []).forEach(r => { if (r && r.lead_id && r.created_at) leadCreatedAt[r.lead_id] = r.created_at; });
        }
        
        if (sales) {
            sales.forEach(s => {
                const sellerId = s && s.vendedoresponsavel ? s.vendedoresponsavel : null;
                if (sellerId && sellerMap[sellerId]) {
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

        // 5. FRT (igual frt_carregamento.md) — hardcut 15/01 12:00 (America/Sao_Paulo)
        try {
          const frtEvents = await computeFRTEventsHardcut(); // já aplica hardcut + atribuição por prioridade
          (frtEvents || []).forEach((e) => {
            const sellerId = e && e.sellerId ? String(e.sellerId) : null;
            if (!sellerId) return;
            const bucket = sellerMap[sellerId];
            if (!bucket) return;
            const diff = Number(e.diffMinutes) || 0;
            // Ranking: desconsidera FRT muito baixo (<= 1min) + outliers (>= 30 dias)
            if (!(diff > 1) || !(diff < 43200)) return;
            bucket.frtSum += diff;
            bucket.frtCount += 1;
          });
        } catch (e) {}

        // 6. Calculate & Sort
        state.rankingData = Object.values(sellerMap)
            .filter(s => !state.selectedSeller || s.id === state.selectedSeller)
            .map(s => ({
                ...s,
                revenue: (s && typeof s.sales === 'number') ? s.sales : (__toNumber(s && s.sales) || 0),
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
      const DEFAULT_META_PROPOSTAS = 100;
      const DEFAULT_META_REUNIOES = 50;

      async function fetchMetasData() {
        if (!sbClient) return;
        const { start, end } = getDateRange(state.dateFilter);
        const meetRange = getMeetingsDateRange(state.dateFilter);

        try {
          // 1) Sellers
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

          const activeSellers = sellers.filter(s => s && s.diretorVendas !== true);

          const sellerMap = {};
          activeSellers.forEach(s => {
            sellerMap[s.id] = {
              id: s.id,
              name: s.nome || 'Sem nome',
              avatarUrl: s.perfil_img || null,
              role: 'Executivo',
              propostas: 0,
              reunioes: 0,
              metaPropostas: DEFAULT_META_PROPOSTAS,
              metaReunioes: DEFAULT_META_REUNIOES
            };
          });

          // 2) Metas por vendedor (crm_metas_vendedor_mes)
          try {
            const { mes, ano } = getCrmMetaContext();
            const mesRef = `${ano}-${String(mes).padStart(2, '0')}-01`;
            const { data: dbMetas } = await sbClient
              .from('crm_metas_vendedor_mes')
              .select('vendedor_id, meta_mensal_propostas, meta_mensal_reunioes')
              .eq('mes_ref', mesRef);

            (dbMetas || []).forEach(row => {
              const vid = row && row.vendedor_id ? String(row.vendedor_id) : null;
              if (!vid || !sellerMap[vid]) return;
              if (row.meta_mensal_propostas !== undefined && row.meta_mensal_propostas !== null) {
                sellerMap[vid].metaPropostas = __toNumber(row.meta_mensal_propostas) || DEFAULT_META_PROPOSTAS;
              }
              if (row.meta_mensal_reunioes !== undefined && row.meta_mensal_reunioes !== null) {
                sellerMap[vid].metaReunioes = __toNumber(row.meta_mensal_reunioes) || DEFAULT_META_REUNIOES;
              }
            });
          } catch (e) {}

          // 3) Propostas (dedup por id_lead)
          let proposalsQuery = sbClient
            .from('imagemProposta')
            .select('id_lead, id_vendedor');
          proposalsQuery = applyCutoffTimestamp(proposalsQuery, 'created_at')
            .gte('created_at', start)
            .lte('created_at', end);
          const { data: proposalsRaw } = await proposalsQuery;
          const proposals = await filterRowsByAgencyViaLeadId((proposalsRaw || []), (p) => p && p.id_lead);

          const proposedLeadIdsBySeller = {};
          const proposalsNeedingLeadFallback = [];
          (proposals || []).forEach((p) => {
            if (p && p.id_vendedor) {
              const sid = String(p.id_vendedor);
              if (!proposedLeadIdsBySeller[sid]) proposedLeadIdsBySeller[sid] = new Set();
              if (p.id_lead) proposedLeadIdsBySeller[sid].add(String(p.id_lead));
            } else if (p && p.id_lead) {
              proposalsNeedingLeadFallback.push(p);
            }
          });

          // fallback: leads.vendedorResponsavel
          const leadIdsFb = proposalsNeedingLeadFallback.map(p => p.id_lead).filter(Boolean);
          if (leadIdsFb.length > 0) {
            let q = sbClient
              .from('leads')
              .select('lead_id, vendedorResponsavel')
              .in('lead_id', leadIdsFb);
            q = applyAgencyFilterToLeadQuery(q);
            const { data: leadsFb } = await q;
            const leadSellerMap = {};
            (leadsFb || []).forEach(l => { if (l && l.lead_id && l.vendedorResponsavel) leadSellerMap[l.lead_id] = l.vendedorResponsavel; });
            proposalsNeedingLeadFallback.forEach(p => {
              const sid = leadSellerMap[p.id_lead];
              if (!sid) return;
              const sKey = String(sid);
              if (!proposedLeadIdsBySeller[sKey]) proposedLeadIdsBySeller[sKey] = new Set();
              if (p.id_lead) proposedLeadIdsBySeller[sKey].add(String(p.id_lead));
            });
          }

          Object.keys(sellerMap).forEach((sid) => {
            const set = proposedLeadIdsBySeller[sid];
            sellerMap[sid].propostas = set ? set.size : 0;
          });

          // 4) Reuniões (agendamento) - excluir canceladas
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

          let globalReunioes = 0;
          (meetings || []).forEach((m) => {
            if (!m) return;
            const sid = m.vendedor ? String(m.vendedor) : null;
            if (!sid || !sellerMap[sid]) return;
            globalReunioes += 1;
            sellerMap[sid].reunioes += 1;
          });

          // 5) Meta geral (crm_metas_geral_mes)
          let globalPropostasMeta = 0;
          let globalReunioesMeta = 0;
          try {
            const { mes } = getCrmMetaContext();
            const { data: generalMetas } = await sbClient
              .from('crm_metas_geral_mes')
              .select('meta_geral_propostas, meta_geral_reunioes')
              .eq('mes', mes);
            if (generalMetas && generalMetas.length > 0) {
              const row = generalMetas[0];
              if (row.meta_geral_propostas != null) globalPropostasMeta = __toNumber(row.meta_geral_propostas) || 0;
              if (row.meta_geral_reunioes != null) globalReunioesMeta = __toNumber(row.meta_geral_reunioes) || 0;
            }
          } catch (e) {}

          let globalPropostasTotal = 0;
          let globalReunioesTotal = 0;

          const sellersResult = [];
          Object.values(sellerMap).forEach((s) => {
            if (state.selectedSeller && s.id !== state.selectedSeller) return;
            const propostasPct = s.metaPropostas > 0 ? Math.min(100, Number(((s.propostas / s.metaPropostas) * 100).toFixed(0))) : 0;
            const reunioesPct = s.metaReunioes > 0 ? Math.min(100, Number(((s.reunioes / s.metaReunioes) * 100).toFixed(0))) : 0;
            const avgPct = Number(((propostasPct + reunioesPct) / 2).toFixed(0));

            globalPropostasTotal += s.propostas;
            globalReunioesTotal += s.reunioes;

            if (globalPropostasMeta === 0) globalPropostasMeta += s.metaPropostas;
            if (globalReunioesMeta === 0) globalReunioesMeta += s.metaReunioes;

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

          sellersResult.sort((a, b) => b.avgPct - a.avgPct);

          const globalPropostasPct = globalPropostasMeta > 0 ? Math.min(100, Number(((globalPropostasTotal / globalPropostasMeta) * 100).toFixed(0))) : 0;
          const globalReunioesPct = globalReunioesMeta > 0 ? Math.min(100, Number(((globalReunioesTotal / globalReunioesMeta) * 100).toFixed(0))) : 0;

          state.metasData = {
            global: {
              propostas: { current: globalPropostasTotal, target: globalPropostasMeta, pct: globalPropostasPct },
              reunioes: { current: globalReunioesTotal, target: globalReunioesMeta, pct: globalReunioesPct }
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

        const reunioesData = data.global.reunioes;
        const elReunioesCurrent = document.getElementById('meta-reunioes-current');
        const elReunioesTarget = document.getElementById('meta-reunioes-target');
        const elReunioesPct = document.getElementById('meta-reunioes-pct');
        const elReunioesMissing = document.getElementById('meta-reunioes-missing');
        const elReunioesDonut = document.getElementById('meta-reunioes-donut');
        const elReunioesDonutVal = document.getElementById('meta-reunioes-donut-val');

        if (elReunioesCurrent) elReunioesCurrent.textContent = formatNumber(reunioesData.current);
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

        const elSubtitle = document.getElementById('metas-team-subtitle');
        if (elSubtitle) elSubtitle.textContent = `Progresso proporcional dos ${data.sellers.length} vendedores`;

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
                <img src="${avatarSrc}" alt="${escapeHtmlLite(seller.name)}" class="metas-seller-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(seller.name)}&background=e2e8f0&color=64748b'">
                <div class="metas-seller-info">
                  <div class="metas-seller-name">${escapeHtmlLite(seller.name)}</div>
                  <div class="metas-seller-role">${escapeHtmlLite(seller.role || '')}</div>
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
        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
      }

      async function fetchData() {
         // TV: priorizar o gráfico. O "Personalizado" no TV NÃO tem popover/calendário aqui,
         // então o gargalo mais comum é a chamada ao Meta Ads. Não bloqueamos o gráfico por isso.

         // Best-effort: detectar se `compras.is_test` existe para filtrar compras de teste sem quebrar.
         try { await ensureComprasIsTestSupport(); } catch (e) {}

         // Dispara Meta Ads em background; quando chegar, atualiza apenas KPIs dependentes (Invest/CAC/ROAS).
         const marketingP = (async () => {
           try {
             await fetchMarketingSpend();
             const agg = state.__revenueAgg;
             if (!agg) return;
             const investment = Number(state.marketingInvestment) || 0;
             const investmentPrev = Number(state.marketingInvestmentPrev) || 0;
             const cac = agg.currentSales > 0 ? investment / agg.currentSales : 0;
             const cacPrev = agg.prevSales > 0 ? investmentPrev / agg.prevSales : 0;
             const roas = investment > 0 ? agg.currentRevenue / investment : 0;
             const roasPrev = investmentPrev > 0 ? agg.prevRevenue / investmentPrev : 0;

             const updateKPI = (index, value, prevValue, formatFunc = (v)=>v, opts = {}) => {
               const betterWhenLower = !!opts.betterWhenLower;
               const variation = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : (value > 0 ? 100 : 0);
               const isFlat = Math.round(variation * 10) === 0;
               const missing = !(prevValue > 0) || !(value > 0);
               if (!state.kpis || !state.kpis[index]) return;
               state.kpis[index].v = formatFunc(value);
               if (state.kpis[index].vs1) {
                 state.kpis[index].vs1.missing = missing;
                 state.kpis[index].vs1.v = missing ? 0 : Math.abs(variation).toFixed(1);
                 state.kpis[index].vs1.neutral = missing ? true : isFlat;
                 state.kpis[index].vs1.up = (missing || isFlat) ? true : (betterWhenLower ? (variation <= 0) : (variation >= 0));
               }
             };

             updateKPI(6, investment, investmentPrev, formatCurrency);
             updateKPI(7, cac, cacPrev, formatCurrency, { betterWhenLower: true });
             updateKPI(8, roas, roasPrev, (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00') + 'x');
             renderKPIs();
           } catch (e) {
             try { console.warn('Meta Ads (background) falhou:', e); } catch (_) {}
           }
         })();

         // Prioriza o gráfico (renderRevenue acontece cedo dentro do fetchRevenue).
         try { await fetchRevenue(); } catch (e) {}

         // Demais blocos rodam em background (não bloqueiam render inicial)
         const tasks = [
             fetchMeetings(),
             fetchMeetingsTab(),
             fetchSLAs(),
             fetchRankingData(),
             fetchMetasData(),
             fetchFunnelData(),
             fetchConversionRates(),
             fetchChannelData(),
             fetchPipelineData()
         ];
         Promise.allSettled([marketingP, ...tasks]).then((results) => {
           try {
             results.forEach((r) => {
               if (r && r.status === 'rejected') console.error('Erro em fetchData task:', r.reason);
             });
           } catch (e) {}
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
        try { initAgencySelectorUI(); } catch (e) {}
        try { initCustomDatePickerUI(); } catch (e) {}
        try { setCustomButtonAppliedLabel(); } catch (e) {}

        if (!liveBadgeInterval) {
          liveBadgeInterval = setInterval(updateLiveBadge, 30000);
        }

        // Renderiza estrutura inicial (vazia ou placeholders)
        renderKPIs(); 
        renderRanking();
        try { renderMetasSection(); } catch (e) {}
        renderMeetingsTab();
        renderFunnel();
        renderConversion();
        renderChannels();
        renderPipeline();
        // try { renderGauge(); } catch(e) {} // Comentado: gauge será renderizado com dados reais em fetchDataWithStamp()
        // NÃO renderizar o ApexCharts da receita aqui:
        // nesse momento o dashboard ainda pode estar oculto (skeleton/display:none),
        // e o chart pode nascer com width 0 e ficar “em branco”.
        // O gráfico é renderizado quando `fetchRevenue()` entrega dados e/ou quando o conteúdo fica visível.

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
                    // Se a receita foi calculada enquanto o conteúdo estava oculto, renderiza agora.
                    try {
                      if (state && state.__pendingRevenueChartData) {
                        const d = state.__pendingRevenueChartData;
                        state.__pendingRevenueChartData = null;
                        setTimeout(() => { try { renderRevenue(d); } catch (e) {} }, 0);
                      }
                    } catch (e) {}
                    // Auto-scroll (se params.scroll for passado)
                    applyInitialAutoScroll();
                }
            }, 500);
        } else {
             if(content) content.style.display = 'block';
             try {
               if (state && state.__pendingRevenueChartData) {
                 const d = state.__pendingRevenueChartData;
                 state.__pendingRevenueChartData = null;
                 setTimeout(() => { try { renderRevenue(d); } catch (e) {} }, 0);
               }
             } catch (e) {}
             applyInitialAutoScroll();
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
            // Percentuais sempre com 2 casas decimais (ex.: 0.64)
            try {
              const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
              if (!Number.isFinite(n)) return '0.00';
              const two = Math.round(n * 100) / 100;
              const out = two.toFixed(2);
              return out === '-0.00' ? '0.00' : out;
            } catch (e) {
              return '0.00';
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

        // Fonte de verdade do sort: valor atual do dropdown (evita state dessincronizado)
        let sortKey = (state && state.rankingSort) ? state.rankingSort : 'score';
        try {
          const sel = document.getElementById('ranking-sort');
          if (sel && sel.value) sortKey = sel.value;
        } catch (e) {}
        sortKey = String(sortKey || 'score').trim().toLowerCase();
        try { state.rankingSort = sortKey; } catch (e) {}

        const sortedRanking = [...(state.rankingData || [])].sort((a, b) => {
          const get = (obj) => {
            if (!obj) return null;
            if (sortKey === 'score') return toNum(obj.avgScore);
            if (sortKey === 'proposals') return toNum(obj.proposals);
            if (sortKey === 'meetings') return toNum(obj.meetings);
            if (sortKey === 'sales') return toNum(obj.sales);
            if (sortKey === 'revenue') return toNum(obj.revenue ?? obj.sales);
            if (sortKey === 'frt') return toNum(obj.avgFRT);
            if (sortKey === 'cycle') return toNum(obj.avgCycle);
            return toNum(obj.avgScore);
          };

          const av = get(a);
          const bv = get(b);

          // frt/cycle: menor é melhor; demais: maior é melhor
          const asc = (sortKey === 'frt' || sortKey === 'cycle');

          const aVal = (av === null || av === '-' || av === '') ? (asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : av;
          const bVal = (bv === null || bv === '-' || bv === '') ? (asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : bv;

          if (aVal === bVal) {
            const aScore = toNum(a.avgScore) ?? 0;
            const bScore = toNum(b.avgScore) ?? 0;
            return bScore - aScore;
          }

          return asc ? (aVal - bVal) : (bVal - aVal);
        });

        const visibleRanking = sortedRanking;

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
            const avatarUrl = resolveAvatarUrl(r.perfilImg, r.name);
            const avatarFallback = dicebearAvatarUrl(r.name);

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
                        <img src="${avatarUrl}" class="rank-avatar" alt="${r.name}" style="background: var(--bg-subtle);" onerror="this.onerror=null;this.src='${avatarFallback}';">
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
        if (!data || data.length === 0) {
          container.innerHTML = '<div class="text-xs text-muted text-center p-4">Carregando funil...</div>';
          return;
        }

        // Replica o funil do wish-board: SVG + grid de dados
        const maxVal = Math.max(...data.map(d => d.v)) || 1;
        const steps = data.length;
        const svgWidth = 500;
        const svgHeight = 100;
        const sectionWidth = svgWidth / steps;

        // Primeira etapa: topo; última: base (afunila conforme razão vs max)
        const yPoints = data.map((d) => {
          const ratio = 1 - (d.v / maxVal);
          return Math.max(5, ratio * 85);
        });
        yPoints.push(95); // ponto final (base)

        // Path do SVG com curvas suaves
        let pathD = `M 0,${yPoints[0]} `;
        for (let i = 0; i < steps; i++) {
          const xStart = i * sectionWidth;
          const xEnd = (i + 1) * sectionWidth;
          const yStart = yPoints[i];
          const yEnd = yPoints[i + 1];
          const cpX = xStart + (xEnd - xStart) / 2;
          pathD += `C ${cpX},${yStart} ${cpX},${yEnd} ${xEnd},${yEnd} `;
        }
        pathD += `L ${svgWidth},${svgHeight} L 0,${svgHeight} Z`;

        // Linhas separadoras
        let lines = '';
        for (let i = 1; i < steps; i++) {
          const x = i * sectionWidth;
          const yAtX = yPoints[i];
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

        const dataCells = data.map((d, idx) => {
          const pct = idx === 0 ? '100.00%' : `${Number(d.gc || 0).toFixed(2)}%`;
          return `<div class="funnel-data-cell">
            <div class="funnel-data-value">
              ${formatNumber(d.v)}
              <span class="funnel-data-pct">${pct}</span>
            </div>
            <div class="funnel-data-label">${escapeHtmlLite(d.l)}</div>
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

        // Modo especial: Funil Landing Page (pedido do funillp)
        // Regras:
        // - entraram na LP: cliques no anúncio (Meta Ads) para campanhas do tipo LandingPage (tabela campanhaTrafego)
        // - preencheram: leads.novo_crm == true AND leads.canalentrada == "Landing Page"
        // - enviaram msg: + leads.segundaMensagem == true
        // - responderam: + leads.mensagensEnviadas >= 2  (coluna é TEXT no BD; fazemos parse)
        // - vendedor: + leads.vendedorResponsavel != null
        const funnelMode = String((WISH_BOARD_PARAMS && WISH_BOARD_PARAMS.funnelMode) || '').trim().toLowerCase();
        if (funnelMode === 'lp' || funnelMode === 'landing' || funnelMode === 'landingpage') {
          const CANAL_LP = 'Landing Page';
          const norm = (s) => String(s || '').toLowerCase();

          const toIntSafe = (v) => {
            if (v === null || v === undefined) return 0;
            if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
            const s = String(v).trim();
            if (!s) return 0;
            const n = parseInt(s, 10);
            return Number.isFinite(n) ? n : 0;
          };

          const fetchMetaClicksLanding = async () => {
            try {
              // tenta reaproveitar o cache do canal (setado em fetchChannelData)
              let startYmd = toYmdLocal(new Date(start));
              let endYmd = toYmdLocal(new Date(end));
              if (startYmd && endYmd) {
                const eff = applyCutoffToYmdRange(startYmd, endYmd);
                startYmd = eff.startYmd;
                endYmd = eff.endYmd;
              }

              if (!startYmd || !endYmd || startYmd > endYmd) return 0;

              const cutoffKey = `cut:${cutoff?.cutoffYmdLocal || 'none'}`;
              const channelCacheKey = `campSpend|${startYmd}|${endYmd}|${cutoffKey}`;
              const channelCache = state.__metaChannelSpendCache;
              if (channelCache && channelCache.key === channelCacheKey && channelCache.fetchedAt && (Date.now() - channelCache.fetchedAt) < META_SPEND_CACHE_MS) {
                const cached = Number(channelCache.landingClicks);
                return Number.isFinite(cached) && cached >= 0 ? cached : 0;
              }

              const localKey = `lpClicks|${startYmd}|${endYmd}|${cutoffKey}`;
              const localCache = state.__metaLPClicksCache;
              if (localCache && localCache.key === localKey && localCache.fetchedAt && (Date.now() - localCache.fetchedAt) < META_SPEND_CACHE_MS) {
                const cached = Number(localCache.clicks);
                return Number.isFinite(cached) && cached >= 0 ? cached : 0;
              }

              if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) return 0;

              const { data: campRows } = await sbClient
                .from('campanhaTrafego')
                .select('idcampanha, tipocampanha')
                .not('idcampanha', 'is', null);

              const all = campRows || [];
              const idsLP = all
                .filter(r => norm(r && r.tipocampanha).includes('landing'))
                .map(r => r && r.idcampanha)
                .filter(Boolean)
                .map(x => String(x).trim())
                .filter(Boolean);

              if (!idsLP.length) return 0;

              const buildUrl = () => {
                const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
                url.searchParams.set('fields', 'clicks');
                url.searchParams.set('limit', '500');
                url.searchParams.set('time_range', JSON.stringify({ since: startYmd, until: endYmd }));
                url.searchParams.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: idsLP }]));
                url.searchParams.set('access_token', META_ACCESS_TOKEN);
                return url;
              };

              let clicksTotal = 0;
              let nextUrl = buildUrl().toString();
              while (nextUrl) {
                const res = await fetch(nextUrl, { method: 'GET', mode: 'cors' });
                if (!res.ok) {
                  const txt = await res.text().catch(() => '');
                  throw new Error(`Meta insights(lp clicks) HTTP ${res.status}: ${txt}`);
                }
                const json = await res.json();
                const data = (json && Array.isArray(json.data)) ? json.data : [];
                data.forEach(row => {
                  const clicks = row && row.clicks != null ? Number(String(row.clicks).replace(',', '.')) : 0;
                  if (Number.isFinite(clicks) && clicks >= 0) clicksTotal += clicks;
                });
                nextUrl = (json && json.paging && json.paging.next) ? json.paging.next : '';
              }

              state.__metaLPClicksCache = { key: localKey, clicks: clicksTotal, fetchedAt: Date.now() };
              return clicksTotal;
            } catch (e) {
              console.error('[funil-lp] erro ao buscar cliques Meta (LP):', e);
              return 0;
            }
          };

          const buildBase = () => {
            let q = sbClient
              .from('leads')
              .select('lead_id, segundaMensagem, mensagensEnviadas, vendedorResponsavel');
            q = applyCutoffTimestamp(q, 'created_at').gte('created_at', start).lte('created_at', end);
            q = q.eq('novo_crm', true).eq('canalentrada', CANAL_LP);
            if (state.selectedSeller) q = q.eq('vendedorResponsavel', state.selectedSeller);
            return q;
          };

          const pageSize = 1000;
          let from = 0;
          const all = [];
          try {
            while (true) {
              const { data, error } = await buildBase().range(from, from + pageSize - 1);
              if (error) throw error;
              const rows = Array.isArray(data) ? data : [];
              all.push(...rows);
              if (rows.length < pageSize) break;
              from += pageSize;
              // safety valve (evita loop infinito em caso de comportamento inesperado do backend)
              if (from > 200000) break;
            }
          } catch (e) {
            console.error('[funil-lp] erro ao buscar leads:', e);
          }

          const preencheram = all.length;
          let enviaram = 0;
          let responderam = 0;
          let vendedor = 0;

          for (const r of all) {
            const segunda = !!(r && r.segundaMensagem === true);
            const msgs = toIntSafe(r && r.mensagensEnviadas);
            const hasVend = !!(r && r.vendedorResponsavel);
            if (segunda) {
              enviaram++;
              if (msgs >= 2) {
                responderam++;
                if (hasVend) vendedor++;
              }
            }
          }

          const clicksEntraram = await fetchMetaClicksLanding();
          const entraram = Number.isFinite(Number(clicksEntraram)) ? Math.round(Number(clicksEntraram)) : 0;

          const funnelData = [
            { l: "Entraram na LP (cliques)", v: entraram || 0, color: "#6366f1" },
            { l: "Preencheram (LP)", v: preencheram || 0, color: "#3b82f6" },
            { l: "Enviaram msg (LP)", v: enviaram || 0, color: "#60a5fa" },
            { l: "Responderam (LP)", v: responderam || 0, color: "#22c55e" },
            { l: "Vendedor (LP)", v: vendedor || 0, color: "#16a34a" },
          ];

          const processedFunnel = funnelData.map((item, index) => {
            const prev = index > 0 ? funnelData[index - 1].v : funnelData[0].v;
            const total = funnelData[0].v;
            const conversion = prev > 0 ? Math.round((item.v / prev) * 100) : 0;
            const globalConversionRaw = total > 0 ? Math.round((item.v / total) * 100) : 0;
            const globalConversion = Math.max(0, Math.min(100, globalConversionRaw));
            return { ...item, c: index === 0 ? 100 : conversion, gc: index === 0 ? 100 : globalConversion };
          });

          renderFunnel(processedFunnel);
          return;
        }
        
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
        let queryVendas = sbClient
          .from('compras')
          .select('id', { count: 'exact', head: true });
        queryVendas = applyApprovedPurchaseFilter(queryVendas);
        queryVendas = applyCutoffTimestamp(queryVendas, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        queryVendas = applyCutoffTimestamp(queryVendas, 'created_at');
        if (state.selectedSeller) queryVendas = queryVendas.eq('vendedoresponsavel', state.selectedSeller);
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
          .select('valor_total, vendedoresponsavel, lead:leadid(canalentrada)')
          .not('leadid', 'is', null);
        qPurch = applyApprovedPurchaseFilter(qPurch);
        qPurch = applyCutoffTimestamp(qPurch, 'data_compra').gte('data_compra', start).lte('data_compra', end);
        qPurch = applyCutoffTimestamp(qPurch, 'created_at');
        if (state.selectedSeller) qPurch = qPurch.eq('vendedoresponsavel', state.selectedSeller);

        const { data: purchRows } = await qPurch;
        const rows = purchRows || [];

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

        // --- Gasto + Cliques por canal (Meta) via campanhaTrafego + filtro por campanha.id ---
        // Observação: cliques vêm como string no Graph API; somamos como número.
        const fetchMetaInsightsByCampaignIds = async (campaignIds, startYmd, endYmd) => {
          const ids = (campaignIds || []).map(x => String(x || '').trim()).filter(Boolean);
          if (!ids.length) return { spend: 0, clicks: 0 };
          let spendTotal = 0;
          let clicksTotal = 0;

          const buildUrl = () => {
            const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
            url.searchParams.set('fields', 'spend,clicks');
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
              if (Number.isFinite(spend) && spend >= 0) spendTotal += spend;

              const clicks = row && row.clicks != null ? Number(String(row.clicks).replace(',', '.')) : 0;
              if (Number.isFinite(clicks) && clicks >= 0) clicksTotal += clicks;
            });
            nextUrl = (json && json.paging && json.paging.next) ? json.paging.next : '';
          }
          return { spend: spendTotal, clicks: clicksTotal };
        };

        let spendLP = null;
        let spendWPP = null;
        let clicksLP = null;
        let clicksWPP = null;
        try {
          let startYmd = toYmdLocal(new Date(start));
          let endYmd = toYmdLocal(new Date(end));
          if (startYmd && endYmd) {
            const eff = applyCutoffToYmdRange(startYmd, endYmd);
            startYmd = eff.startYmd;
            endYmd = eff.endYmd;
          }
          if (startYmd && endYmd && startYmd <= endYmd && META_ACCESS_TOKEN && META_AD_ACCOUNT_ID) {
            const cacheKey = `campSpend|${startYmd}|${endYmd}|cut:${cutoff?.cutoffYmdLocal || 'none'}`;
            const cache = state.__metaChannelSpendCache;
            if (cache && cache.key === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt) < META_SPEND_CACHE_MS) {
              spendLP = cache.landing;
              spendWPP = cache.whatsapp;
              clicksLP = cache.landingClicks;
              clicksWPP = cache.whatsappClicks;
            } else {
              const { data: campRows } = await sbClient
                .from('campanhaTrafego')
                .select('idcampanha, tipocampanha')
                .not('idcampanha', 'is', null);
              const all = campRows || [];
              const idsLP = all.filter(r => norm(r && r.tipocampanha).includes('landing')).map(r => r && r.idcampanha);
              const idsWPP = all.filter(r => norm(r && r.tipocampanha).includes('whats')).map(r => r && r.idcampanha);

              const [lp, wpp] = await Promise.all([
                fetchMetaInsightsByCampaignIds(idsLP, startYmd, endYmd),
                fetchMetaInsightsByCampaignIds(idsWPP, startYmd, endYmd),
              ]);
              spendLP = lp && typeof lp.spend === 'number' ? lp.spend : 0;
              spendWPP = wpp && typeof wpp.spend === 'number' ? wpp.spend : 0;
              clicksLP = lp && typeof lp.clicks === 'number' ? lp.clicks : 0;
              clicksWPP = wpp && typeof wpp.clicks === 'number' ? wpp.clicks : 0;

              state.__metaChannelSpendCache = {
                key: cacheKey,
                landing: spendLP,
                whatsapp: spendWPP,
                landingClicks: clicksLP,
                whatsappClicks: clicksWPP,
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
            clicks: (typeof clicksLP === 'number' ? clicksLP : null),
            conv: convLP,
            i: "globe", c: "primary", active: true, tone: "#3b82f6"
          },
          {
            id: 'whatsapp', n: "WhatsApp", l: leadsWPP,
            rev: revWPP,
            roi: roiWPP,
            gasto: (typeof spendWPP === 'number' ? spendWPP : null),
            clicks: (typeof clicksWPP === 'number' ? clicksWPP : null),
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
          const sellerIdToImg = {};
          (sellersDb || []).forEach(s => {
            if (!s || !s.id) return;
            sellerIdToName[s.id] = s.nome || String(s.id);
            sellerIdToImg[s.id] = s.perfil_img || null;
          });
          try {
            // mantém caches globais atualizados (ranking/pipeline/filtro)
            const nameMap = state.sellerNameById || {};
            const imgMap = state.sellerImgById || {};
            (sellersDb || []).forEach(s => {
              if (!s || !s.id) return;
              nameMap[s.id] = s.nome || String(s.id);
              imgMap[s.id] = s.perfil_img || null;
            });
            state.sellerNameById = nameMap;
            state.sellerImgById = imgMap;
          } catch (e) {}
          // fallback p/ modo vendedor (quando não carregamos lista completa)
          if (access && access.sellerId && access.sellerName && !sellerIdToName[access.sellerId]) {
            sellerIdToName[access.sellerId] = access.sellerName;
            sellerIdToImg[access.sellerId] = access.sellerImg || null;
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
          const novoLeadId = ETAPA_OPORTUNIDADE_ID;
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

          // 4) Proposta -> Fechamento (agora âncora por compras.data_compra, compras aprovadas)
          let qClose = sbClient
            .from('compras')
            .select('leadid, data_compra, vendedoresponsavel, valor_total')
            .not('leadid', 'is', null);
          qClose = applyApprovedPurchaseFilter(qClose);
          qClose = applyCutoffTimestamp(qClose, 'data_compra').gte('data_compra', start).lte('data_compra', end);
          qClose = applyCutoffTimestamp(qClose, 'created_at');
          if (state.selectedSeller) qClose = qClose.eq('vendedoresponsavel', state.selectedSeller);

          const { data: closedRows, error: closeErr } = await qClose;
          if (closeErr) console.error('[pipeline] erro compras(fechamento):', closeErr);

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
              perfilImg: sellerIdToImg[sellerId] || null,
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
          const clicks = (ch && ch.clicks != null && Number.isFinite(Number(ch.clicks))) ? Number(ch.clicks) : null;
          const clicksTxt = clicks != null ? String(Math.round(clicks)) : '--';
          const showClicks = (ch && ch.id === 'landing'); // pedido: cliques para LP
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
              ${showClicks ? `
              <div class="channel-stat">
                <div class="value">${clicksTxt}</div>
                <div class="label">Cliques</div>
              </div>
              ` : ``}
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
          const avatarUrl = resolveAvatarUrl(r && r.perfilImg, r && r.name);
          const avatarFallback = dicebearAvatarUrl(r && r.name);
          c.innerHTML = `
            <div class="pipeline-pivot">
              <div class="pipeline-pivot-header">
                <div class="pipeline-avatar-wrap">
                  <img class="pipeline-avatar" src="${avatarUrl}" alt="${escapeHtmlLite(r.name)}" onerror="this.onerror=null;this.src='${avatarFallback}';">
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
              const avatarUrl = resolveAvatarUrl(r && r.perfilImg, r && r.name);
              const avatarFallback = dicebearAvatarUrl(r && r.name);
              return `
              <div class="pipeline-seller-header">
                <div class="pipeline-avatar-wrap">
                    <img class="pipeline-avatar" src="${avatarUrl}" alt="${escapeHtmlLite(r.name)}" onerror="this.onerror=null;this.src='${avatarFallback}';">
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

        // 0. Update gauge label based on current filter
        const gaugeLabelEl = document.getElementById('gauge-month-label');
        if (gaugeLabelEl) {
          const now = new Date();
          const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                              'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const currentMonth = monthNames[now.getMonth()];
          const currentYear = now.getFullYear();

          if (state.dateFilter === 'semester') {
            gaugeLabelEl.textContent = `Meta Semestral (6 meses)`;
          } else if (state.dateFilter === 'year') {
            gaugeLabelEl.textContent = `Meta Anual (${currentYear})`;
          } else {
            gaugeLabelEl.textContent = `Meta de ${currentMonth}`;
          }
        }

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
        // IMPORTANTE (TV):
        // - Não destruir/recriar o chart em todo refresh (isso causa “piscar”).
        // - Preferir updateSeries/updateOptions quando já existe.
        
        const isDark = state.theme === 'dark';
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const labelColor = isDark ? '#94a3b8' : '#64748b';

        // TV: evitar loop de altura crescente (ApexCharts + flex/auto height).
        // Regra:
        // - Base: 280px (ou 320px em telas >= 1200px, alinhado ao CSS)
        // - Se houver height computado, aceitar apenas dentro de um range "seguro"
        //   (clamp) para não permitir crescimento infinito.
        let chartHeight = 280;
        try {
          const isWide = !!(window.matchMedia && window.matchMedia('(min-width: 1200px)').matches);
          const baseH = isWide ? 320 : 280;
          chartHeight = baseH;

          const cssHRaw = window.getComputedStyle(chartEl).height || '';
          const cssH = parseFloat(String(cssHRaw).replace('px', ''));
          if (Number.isFinite(cssH) && cssH > 0) {
            const minH = Math.max(240, baseH - 40);
            const maxH = baseH + 40;
            chartHeight = Math.max(minH, Math.min(maxH, cssH));
          }
        } catch (e) {}

        // Forçar a altura do container também (previne drift por layout externo).
        try { chartEl.style.height = `${Math.round(chartHeight)}px`; } catch (e) {}

        // Copiar arrays localmente para podermos “pad” quando o range é muito curto (ex.: hoje / semana na segunda)
        // ApexCharts frequentemente não desenha line/area quando há apenas 1 ponto.
        let categories = chartData ? [...(chartData.categories || [])] : ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        let rawDates = chartData ? (chartData.rawDates ? [...chartData.rawDates] : null) : null;
        const isYearly = chartData ? chartData.isYearly : false;

        let seriesDataLocal = chartData ? [...(chartData.seriesData || [])] : [0, 0, 0, 0];
        let seriesMetaLocal = chartData ? [...(chartData.seriesMeta || [])] : [0, 0, 0, 0];
        let seriesLastYearLocal = chartData ? [...(chartData.seriesLastYear || [])] : null;
        const seriesLastYearName = (chartData && chartData.seriesLastYearName) ? String(chartData.seriesLastYearName) : null;

        // Realizado deve seguir até o dia atual (linha tracejada),
        // mesmo que não tenha compra no dia. Após o dia atual, corta (null).
        // Amanhã, o "dia atual" muda automaticamente porque usa a data do sistema.
        const extendRealizadoToToday = (arr) => {
          try {
            if (!Array.isArray(arr) || arr.length === 0) return arr;
            const todayKey = formatYmdLocal(new Date());
            const todayIdx = (rawDates && Array.isArray(rawDates) && todayKey) ? rawDates.indexOf(todayKey) : -1;
            if (todayIdx < 0) return arr; // fallback: sem referência de hoje no eixo

            // último valor conhecido até hoje (acumulado)
            let lastVal = null;
            for (let i = todayIdx; i >= 0; i--) {
              const v = arr[i];
              const vn = (typeof v === 'number') ? v : parseFloat(String(v));
              if (Number.isFinite(vn)) { lastVal = vn; break; }
            }
            if (lastVal === null) lastVal = 0;

            return arr.map((v, idx) => {
              if (idx > todayIdx) return null; // corta após hoje
              const vn = (typeof v === 'number') ? v : parseFloat(String(v));
              return Number.isFinite(vn) ? vn : lastVal;
            });
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

        // Igual ao dashboard: reduzir labels quando o range diário é muito longo.
        let displayCategories = categories;
        if (isDaily && rawDates && categories.length > 35 && firstWednesdayIndex !== null && firstWednesdayIndex !== -1) {
          displayCategories = categories.map((c, idx) => ((idx - firstWednesdayIndex) % 7 === 0 ? c : ''));
        }

        // Séries:
        // - Realizado (ano atual)
        // - <ano passado> (mesmo mês alinhado por dia)
        // - Meta (steps)
        const series = [
          { name: "Realizado", data: seriesDataLocal }
        ];
        const hasLastYear = Array.isArray(seriesLastYearLocal) && seriesLastYearLocal.length > 0;
        if (hasLastYear) {
          while (seriesLastYearLocal.length < seriesDataLocal.length) {
            seriesLastYearLocal.push(seriesLastYearLocal[seriesLastYearLocal.length - 1] || 0);
          }
          series.push({ name: seriesLastYearName || 'Ano passado', data: seriesLastYearLocal });
        }
        series.push({ name: "Meta", data: seriesMetaLocal });

        // Projeção (Run Rate) — apenas em Mês/Ano (paridade com dashboard)
        const mode = (state && state.revenueChartMode) ? String(state.revenueChartMode) : 'month';
        let hasProjecao = false;
        let seriesProjecaoLocal = null;
        try {
          if (mode === 'month' || mode === 'year') {
            if (!isYearly && rawDates && Array.isArray(rawDates) && rawDates.length > 1) {
              // Diário (mês)
              const todayKey = formatYmdLocal(new Date());
              const todayIdx = rawDates.indexOf(todayKey);
              const idx = (todayIdx >= 0) ? todayIdx : (rawDates.length - 1);
              const daysSoFar = Math.max(1, idx + 1);
              const totalDays = rawDates.length;
              const revToDate = Number(seriesDataLocal[idx]) || 0;
              const projectedTotal = (revToDate / daysSoFar) * totalDays;
              const denom = Math.max(1, (totalDays - 1) - idx);
              seriesProjecaoLocal = rawDates.map((_d, i) => {
                if (i < idx) return null;
                const t = (i - idx) / denom;
                return revToDate + (projectedTotal - revToDate) * t;
              });
              hasProjecao = true;
            } else if (isYearly && Array.isArray(seriesDataLocal) && seriesDataLocal.length > 1) {
              // Mensal (ano)
              const curMonthIdx = Math.max(0, Math.min(seriesDataLocal.length - 1, new Date().getMonth()));
              const monthsSoFar = Math.max(1, curMonthIdx + 1);
              const revToDate = Number(seriesDataLocal[curMonthIdx]) || 0;
              const projectedTotal = (revToDate / monthsSoFar) * 12;
              const denom = Math.max(1, (seriesDataLocal.length - 1) - curMonthIdx);
              seriesProjecaoLocal = seriesDataLocal.map((_v, i) => {
                if (i < curMonthIdx) return null;
                const t = (i - curMonthIdx) / denom;
                return revToDate + (projectedTotal - revToDate) * t;
              });
              hasProjecao = true;
            }
          }
        } catch (e) {
          hasProjecao = false;
          seriesProjecaoLocal = null;
        }
        if (hasProjecao && Array.isArray(seriesProjecaoLocal)) {
          series.push({ name: "Projeção", data: seriesProjecaoLocal });
        }

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
            const valsLastYear = (Array.isArray(seriesLastYearLocal) ? seriesLastYearLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const valsMeta = (includeMeta && Array.isArray(seriesMetaLocal) ? seriesMetaLocal : [])
              .map(v => (typeof v === 'number' ? v : parseFloat(v)))
              .filter(v => Number.isFinite(v));
            const vals = [...valsReal, ...valsLastYear, ...valsMeta];
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

        // “Tooltip fixo” no dia atual (sem simular mouse):
        // - Linha vertical: annotation (xaxis) SEM label (Apex não suporta HTML no label.text).
        // - Caixa estilo tooltip: overlay HTML, posicionada acima do ponto do dia atual.
        const getDefaultIdx = () => {
          try {
            if (rawDates && Array.isArray(rawDates) && rawDates.length > 0 && isDaily) {
              const todayKey = formatYmdLocal(new Date());
              const idx = rawDates.indexOf(todayKey);
              if (idx >= 0) return idx;
              return rawDates.length - 1;
            }
            return 0;
          } catch (e) {
            return 0;
          }
        };

        const fmtMoney = (v) => {
          const n = (typeof v === 'number') ? v : parseFloat(String(v));
          if (!Number.isFinite(n)) return '--';
          return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
        };

        const ensureFocusBox = () => {
          try {
            // Toggle: esconder marcador/caixa quando desligado
            if (!(state && state.revenueChartShowTodayMarker)) {
              try {
                const existing = document.getElementById('revenue-focus-box-tv');
                if (existing) existing.style.display = 'none';
              } catch (e) {}
              return null;
            }

            // garantir que a caixa fique DENTRO do gráfico (não no card inteiro)
            const parent = chartEl;
            try { if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; } catch (e) {}
            let box = document.getElementById('revenue-focus-box-tv');
            if (!box) {
              box = document.createElement('div');
              box.id = 'revenue-focus-box-tv';
              box.style.position = 'absolute';
              box.style.top = '60px';
              box.style.left = '50%';
              box.style.transform = 'translateX(-50%)';
              box.style.zIndex = '6';
              box.style.padding = '10px 12px';
              box.style.borderRadius = '12px';
              box.style.border = '1px solid rgba(148,163,184,0.35)';
              box.style.background = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.96)';
              box.style.color = isDark ? '#e2e8f0' : '#0f172a';
              box.style.fontSize = '12px';
              box.style.boxShadow = '0 10px 30px rgba(15,23,42,0.18)';
              box.style.pointerEvents = 'none';
              box.style.minWidth = '220px';
              box.style.maxWidth = '320px';
              box.style.backdropFilter = 'blur(6px)';
              box.style.whiteSpace = 'normal';
              parent.appendChild(box);
            } else {
              // Se já existe, garantir que esteja preso ao chart atual (Bubble pode reusar DOM)
              if (box.parentElement !== parent) {
                try { parent.appendChild(box); } catch (e) {}
              }
              try { box.style.display = ''; } catch (e) {}
            }
            return box;
          } catch (e) {
            return null;
          }
        };

        const updateFocusBoxAtIndex = (idx, chartCtx = null) => {
          if (!(state && state.revenueChartShowTodayMarker)) {
            try {
              const existing = document.getElementById('revenue-focus-box-tv');
              if (existing) existing.style.display = 'none';
            } catch (e) {}
            return;
          }
          const box = ensureFocusBox();
          if (!box) return;
          try {
            const n = categories ? categories.length : 0;
            const safeIdx = Math.max(0, Math.min((n || 1) - 1, Number(idx) || 0));
            const cat = (categories && categories[safeIdx] !== undefined) ? categories[safeIdx] : '';
            const real = seriesDataLocal && seriesDataLocal[safeIdx] !== undefined ? seriesDataLocal[safeIdx] : null;
            const ly = (hasLastYear && Array.isArray(seriesLastYearLocal)) ? seriesLastYearLocal[safeIdx] : null;
            const meta = seriesMetaLocal && seriesMetaLocal[safeIdx] !== undefined ? seriesMetaLocal[safeIdx] : null;
            const lyLabel = (seriesLastYearName || '2025');

            // Padrão do print: compacto, com data no topo e linhas com bolinha + label + valor
            const dateTop = String(cat || '--');
            const dot = (c) => `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${c};"></span>`;
            // “soma até a última venda” = último valor conhecido do Realizado até o dia atual
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
              <div style="font-weight:800; margin-bottom:8px;">${dateTop}</div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px; opacity:.92;">${dot('#3b82f6')} <span>Realizado</span></div>
                <b>${fmtMoney(lastReal)}</b>
              </div>
              ${hasLastYear ? `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px; opacity:.92;">${dot('#ef4444')} <span>${lyLabel}</span></div>
                <b>${fmtMoney(ly)}</b>
              </div>` : ``}
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; align-items:center; gap:8px; opacity:.92;">${dot('#10b981')} <span>Meta</span></div>
                <b>${fmtMoney(meta)}</b>
              </div>
            `;

            // Posicionar a caixa em cima do ponto do dia atual usando métricas do plot do Apex (mais preciso).
            try {
              const w = chartEl.clientWidth || 0;
              const h = chartEl.clientHeight || 0;
              if (w < 30 || h < 30) {
                setTimeout(() => { try { updateFocusBoxAtIndex(safeIdx, chartCtx); } catch (e) {} }, 120);
                return;
              }

              // X/Y no grid do chart (coordenadas locais dentro do chartEl)
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

              // Y baseado no valor (usa o maior entre as séries presentes no dia para “colar” acima do desenho)
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

              // posicionar e clamp
              const boxW = box.offsetWidth || 260;
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
            const idx = getDefaultIdx();
            const cat = (categories && categories[idx] !== undefined) ? categories[idx] : '';
            if (!cat) return {};
            return {
              xaxis: [
                {
                  x: cat,
                  borderColor: 'rgba(148,163,184,0.55)',
                  strokeDashArray: 3
                }
              ]
            };
          } catch (e) {
            return {};
          }
        };

        // Bolinhas somente no "dia atual" para as 3 séries (Realizado, 2025, Meta)
        const buildFocusPointAnnotations = () => {
          try {
            if (!(state && state.revenueChartShowTodayMarker)) return [];
            const idx = getDefaultIdx();
            const cat = (displayCategories && displayCategories[idx] !== undefined) ? displayCategories[idx] : (categories && categories[idx] !== undefined ? categories[idx] : '');
            if (cat === undefined || cat === null || String(cat).trim() === '') return [];

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

            // seriesIndex: 0 Realizado, 1 Ano (2025), 2 Meta (TV sempre tem 3 linhas)
            if (rN !== null) {
              points.push({
                x: cat, y: rN, seriesIndex: 0,
                marker: { size: 6, fillColor: '#3b82f6', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' }
              });
            }
            if (lyN !== null) {
              points.push({
                x: cat, y: lyN, seriesIndex: 1,
                marker: { size: 6, fillColor: '#ef4444', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' }
              });
            }
            if (mN !== null) {
              points.push({
                x: cat, y: mN, seriesIndex: 2,
                marker: { size: 6, fillColor: '#10b981', strokeColor: '#ffffff', strokeWidth: 2, shape: 'circle' }
              });
            }
            return points;
          } catch (e) {
            return [];
          }
        };

        const chartOptions = {
          series: series,
          chart: {
            id: 'revenue-tv',
            type: 'area',
            height: chartHeight,
            fontFamily: 'inherit',
            toolbar: { show: false },
            zoom: {
              enabled: true,
              type: 'x',
              autoScaleYaxis: true,
              allowMouseWheelZoom: !!(state && state.revenueChartZoomEnabled)
            },
            selection: {
              enabled: true,
              type: 'x',
              fill: { color: '#3b82f6', opacity: 0.08 },
              stroke: { color: '#3b82f6', width: 1, dashArray: 0, opacity: 0.3 }
            },
            // TV: parar re-animações a cada refresh (isso fazia a linha de 2025 “piscar”)
            animations: { enabled: false },
            background: 'transparent',
            events: {
              mounted: function(chartContext) {
                // TV: Meta sempre visível (não esconder)
                try {
                  const idx = getDefaultIdx();
                  // esperar o Apex finalizar layout antes de posicionar
                  setTimeout(() => { try { updateFocusBoxAtIndex(idx, chartContext); } catch (e) {} }, 120);
                } catch (e) {}
              },
              updated: function(chartContext) {
                // Reposiciona a caixa após updates internos do Apex (resize/reflow)
                try {
                  const idx = getDefaultIdx();
                  setTimeout(() => { try { updateFocusBoxAtIndex(idx, chartContext); } catch (e) {} }, 60);
                } catch (e) {}
              },
              dataPointMouseEnter: function(_event, _chartContext, config) {
                // Quando o usuário passa o mouse, o Apex já mostra o tooltip.
                // Não fazemos nada aqui para não brigar com o comportamento nativo.
              },
              legendClick: function() { return undefined; }
            }
          },
          annotations: {
            ...(buildFocusLineAnnotation() || {}),
            points: buildFocusPointAnnotations()
          },
          // TV: não mostrar bolinhas em todos os pontos; apenas no hover
          markers: {
            size: 0,
            strokeWidth: 0,
            hover: { size: 6 }
          },
          colors: hasLastYear
            ? (hasProjecao ? ['#3b82f6', '#ef4444', '#10b981', '#0ea5e9'] : ['#3b82f6', '#ef4444', '#10b981'])
            : (hasProjecao ? ['#3b82f6', '#10b981', '#0ea5e9'] : ['#3b82f6', '#10b981']),
          // Meta: smooth. Projeção: tracejada.
          stroke: {
            curve: series.map(s => (s && s.name === 'Projeção') ? 'straight' : 'smooth'),
            width: series.map(() => 2),
            dashArray: series.map(s => (s && s.name === 'Projeção') ? 6 : 0)
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
            // TV: não permitir esconder séries (sempre 3 linhas visíveis)
            onItemClick: { toggleDataSeries: false },
            markers: {
              onClick: undefined
            }
          },
          theme: { mode: isDark ? 'dark' : 'light' }
        };

        // Atualiza (sem piscar) se já existe
        if (revenueChart) {
          try {
            // animate=false para evitar blink em série secundária (ex.: 2025)
            revenueChart.updateOptions(chartOptions, false, false);
            revenueChart.updateSeries(series, false);
            try {
              // reaplicar visibilidade via state (toggles)
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
              revenueMetaVisible = !!(state && state.revenueChartSeriesVisible && state.revenueChartSeriesVisible.Meta);
            } catch (e) {}
            try {
              const idx = getDefaultIdx();
              setTimeout(() => { try { updateFocusBoxAtIndex(idx, revenueChart); } catch (e) {} }, 60);
            } catch (e) {}
          } catch (e) {
            try { revenueChart.destroy(); } catch (e2) {}
            revenueChart = null;
          }
        }

        // Cria se não existir
        if (!revenueChart) {
          chartEl.innerHTML = "";
          revenueChart = new ApexCharts(chartEl, chartOptions);
        revenueChart.render();
        }

        // --- Controles do gráfico (paridade com dashboard) ---
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
            // procura a série que não é Realizado, Meta e Projeção
            return names.find(n => n && n !== 'Realizado' && n !== 'Meta' && n !== 'Projeção') || null;
          } catch (e) {
            return null;
          }
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

        bindOnce('rev-mode-month', async () => {
          try { state.revenueChartMode = 'month'; } catch (e) {}
          try { state.revenueChartZoom = null; } catch (e) {}
          await fetchRevenue();
          syncRevenueControls();
        });
        bindOnce('rev-mode-semester', async () => {
          try { state.revenueChartMode = 'semester'; } catch (e) {}
          try { state.revenueChartZoom = null; } catch (e) {}
          await fetchRevenue();
          syncRevenueControls();
        });
        bindOnce('rev-mode-year', async () => {
          try { state.revenueChartMode = 'year'; } catch (e) {}
          try { state.revenueChartZoom = null; } catch (e) {}
          await fetchRevenue();
          syncRevenueControls();
        });

        bindOnce('rev-zoom-toggle', () => {
          try { state.revenueChartZoomEnabled = !(state && state.revenueChartZoomEnabled); } catch (e) {}
          // re-render para aplicar allowMouseWheelZoom
          try { if (state && state.revenueChartData) renderRevenue(state.revenueChartData); } catch (e) {}
          syncRevenueControls();
        });
        bindOnce('rev-toggle-today', () => {
          try { state.revenueChartShowTodayMarker = !(state && state.revenueChartShowTodayMarker); } catch (e) {}
          try { if (state && state.revenueChartData) renderRevenue(state.revenueChartData); } catch (e) {}
          syncRevenueControls();
        });

        syncRevenueControls();
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

  // Compatibilidade: se o Bubble ainda estiver com widgetKey "wish-board", apontar para o mesmo init().
  // Isso evita o erro do loader: "widget 'wish-board' não registrou init()".
  try {
    window.CDN_WIDGET_REGISTRY[LEGACY_WIDGET_KEY] = window.CDN_WIDGET_REGISTRY[LEGACY_WIDGET_KEY] || {};
    window.CDN_WIDGET_REGISTRY[LEGACY_WIDGET_KEY].init = window.CDN_WIDGET_REGISTRY[WIDGET_KEY].init;
  } catch (e) {}
})();
  
