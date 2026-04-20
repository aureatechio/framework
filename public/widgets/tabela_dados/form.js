(function () {
  "use strict";

  const WIDGET_KEY = "tabela_dados";
  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  // Default maior para carregar mais leads por página (pode ser sobrescrito por params.limit/pageSize)
  const PAGE_SIZE_DEFAULT = 50;
  const COLSPAN = 16;

  const VIEW = {
    leads: "leads",
    opps: "opps",
    meetings: "meetings",
  };

  // Etapas (etapaVendedorFunil = UUID) — confirmadas pelo usuário
  const STAGE_OPPORTUNITY_ID = "a6709949-9857-4b25-965d-b4bf8270426b";
  const STAGE_MEETING_IDS = [
    "d4531963-4639-44ed-8f8a-6f55986592f2",
    "e4d37489-9eec-4b31-a34a-7732cff675d9",
  ];

  function maskSecret(value) {
    const s = safeStr(value);
    if (!s) return "";
    if (s.length <= 10) return "***";
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }

  function dbgEnabled() {
    return Boolean(window.__TD_DEBUG__);
  }

  function dbg(...args) {
    if (!dbgEnabled()) return;
    try {
      console.log("[tabela_dados]", ...args);
    } catch (_e) {}
  }

  function dbgWarn(...args) {
    if (!dbgEnabled()) return;
    try {
      console.warn("[tabela_dados]", ...args);
    } catch (_e) {}
  }

  function loadScriptOnce(url) {
    if (!url) return Promise.resolve();
    window.__tabelaDadosScriptPromises = window.__tabelaDadosScriptPromises || {};
    if (window.__tabelaDadosScriptPromises[url]) return window.__tabelaDadosScriptPromises[url];

    window.__tabelaDadosScriptPromises[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });

    return window.__tabelaDadosScriptPromises[url];
  }

  async function ensureSupabaseJs() {
    // UMD build (garante global `supabase` no browser)
    dbg("carregando supabase-js (CDN)…");
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
    dbg("supabase-js carregado.");
  }

  function getSupabaseCreateClient() {
    if (typeof supabase !== "undefined" && supabase && typeof supabase.createClient === "function") {
      return supabase.createClient;
    }
    if (typeof Supabase !== "undefined" && Supabase && typeof Supabase.createClient === "function") {
      return Supabase.createClient;
    }
    return null;
  }

  const LEADS_SELECT = [
    "lead_id",
    "created_at",
    "entradaetapaatualvendedor",
    "entradaetapa",
    "data_atualizacao",
    "empresa",
    "nome",
    "segmentotext",
    "segmento_mgs_text",
    "email",
    "telefone",
    "utm_campaign",
    "utm_medium",
    "utm_source",
    "utm_term",
    "utm_content",
    "agencia",
    "agenciatext",
    "segmento",
    "etapaVendedorFunil",
    "vendedorResponsavel",
    "funilVendedor",
    "vendedor:vendedores!leads_vendedorResponsavel_fkey(nome)",
    "agenciaRel:agencias!leads_agencia_fkey(nome)",
    "segmentoRel:segmentos!leads_segmento_fkey(nome)",
    "etapaVendedor:etapa!leads_etapaVendedorFunil_fkey(id,name)",
  ].join(",");

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function isDateOnlyString(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function addDaysDateOnly(dateOnly, days) {
    if (!isDateOnlyString(dateOnly)) return "";
    const d = new Date(`${dateOnly}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function applyDateFiltersToQuery(q, view, dateFrom, dateTo) {
    const from = isDateOnlyString(dateFrom) ? dateFrom : "";
    const to = isDateOnlyString(dateTo) ? dateTo : "";
    if (!from && !to) return q;

    // A coluna "Data" exibida muda conforme a aba:
    // - leads: created_at
    // - opps/meetings: entradaetapaatualvendedor (fallbacks existem no display, mas aqui filtramos pela principal)
    const col = view === VIEW.leads ? "created_at" : "entradaetapaatualvendedor";

    if (from) q = q.gte(col, from);
    if (to) {
      const toPlusOne = addDaysDateOnly(to, 1);
      if (toPlusOne) q = q.lt(col, toPlusOne);
    }
    return q;
  }

  function formatDatePtBr(value) {
    try {
      if (!value) return "—";
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("pt-BR");
    } catch (_e) {
      return "—";
    }
  }

  function safeStr(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return s.trim();
  }

  function normalizeUuidParam(v) {
    const s = safeStr(v);
    if (!s) return "";
    const low = s.toLowerCase();
    // Bubble às vezes injeta "null"/"undefined" como string; isso quebra filtros uuid no PostgREST
    if (["null", "undefined", "none", "nan"].includes(low)) return "";
    // UUID v1-v5: 8-4-4-4-12 (hex)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "";
    return s;
  }

  function parseBool(v) {
    if (typeof v === "boolean") return v;
    const s = safeStr(v).toLowerCase();
    if (!s) return false;
    if (["true", "1", "sim", "yes", "y"].includes(s)) return true;
    if (["false", "0", "nao", "não", "no", "n"].includes(s)) return false;
    return false;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(s) {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function csvEscapeCell(v) {
    const s = String(v ?? "");
    if (/[",\n\r;]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  }

  function toCsv(rows) {
    const header = [
      "Id",
      "Data",
      "Nome do Cliente",
      "Segmento do cliente",
      "E-mail",
      "Telefone",
      "UTM Campaign",
      "UTM Medium",
      "UTM Source",
      "UTM Term",
      "UTM Content",
      "Vendedor",
      "Agência",
      "Nome da Agência",
    ];
    const lines = [header.map(csvEscapeCell).join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.dateLabel,
          r.clientName,
          r.segmento,
          r.email,
          r.telefone,
          r.utm_campaign,
          r.utm_medium,
          r.utm_source,
          r.utm_term,
          r.utm_content,
          r.vendedor,
          r.isAgencia ? "true" : "false",
          r.agenciaNome,
        ]
          .map(csvEscapeCell)
          .join(";")
      );
    }
    return lines.join("\n");
  }

  function downloadTextFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildMockRows(view) {
    const baseDate = view === VIEW.leads ? "24/10/2023" : "23/10/2023";
    return [
      {
        id: "00000000-0000-0000-0000-000000000001",
        dateLabel: baseDate,
        clientName: "Coca-Cola Brasil",
        segmento: "Bebidas",
        email: "contato@coca-cola.com",
        telefone: "11999990000",
        utm_campaign: "campanha_exemplo",
        utm_medium: "cpc",
        utm_source: "google",
        utm_term: "anitta",
        utm_content: "banner_a",
        vendedor: "Vendedor 1",
        isAgencia: false,
        agenciaNome: "",
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        dateLabel: "22/10/2023",
        clientName: "Nubank Pagamentos",
        segmento: "Fintech",
        email: "marketing@nubank.com.br",
        telefone: "11911112222",
        utm_campaign: "campanha_nubank",
        utm_medium: "paid_social",
        utm_source: "meta",
        utm_term: "",
        utm_content: "criativo_1",
        vendedor: "Vendedor 2",
        isAgencia: true,
        agenciaNome: "Agency Africa",
      },
    ];
  }

  function coerceRowsFromParams(params) {
    // futuro: permitir params.rows
    const rows = params && Array.isArray(params.rows) ? params.rows : null;
    if (!rows) return null;

    // normaliza um shape mínimo
    return rows
      .map((r, idx) => {
        const id = r && (r.id || r._id) ? String(r.id || r._id) : `row-${idx + 1}`;
        return {
          id,
          dateLabel: String(r.dateLabel ?? r.data ?? r.date ?? "—"),
          clientName: String(r.clientName ?? r.cliente ?? "—"),
          segmento: String(r.segmento ?? r.segmentoCliente ?? "—"),
          email: String(r.email ?? "—"),
          telefone: String(r.telefone ?? "—"),
          utm_campaign: String(r.utm_campaign ?? r.utmCampaign ?? ""),
          utm_medium: String(r.utm_medium ?? r.utmMedium ?? ""),
          utm_source: String(r.utm_source ?? r.utmSource ?? ""),
          utm_term: String(r.utm_term ?? r.utmTerm ?? ""),
          utm_content: String(r.utm_content ?? r.utmContent ?? ""),
          vendedor: String(r.vendedor ?? "—"),
          isAgencia: Boolean(r.isAgencia ?? r.agencia ?? false),
          agenciaNome: String(r.agenciaNome ?? r.nomeAgencia ?? ""),
        };
      })
      .filter(Boolean);
  }

  function renderRow(r, checked) {
    const checkedAttr = checked ? ' checked="checked"' : "";
    return `
<tr data-row-id="${escapeHtml(r.id)}">
  <td class="td-colCheck">
    <input class="td-check" type="checkbox" data-role="row-check"${checkedAttr} aria-label="Selecionar linha" />
  </td>
  <td class="td-mono">${escapeHtml(r.id)}</td>
  <td>${escapeHtml(r.dateLabel)}</td>
  <td>${escapeHtml(r.clientName)}</td>
  <td>${escapeHtml(r.segmento)}</td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.email)}">${escapeHtml(r.email)}</span></td>
  <td class="td-mono">${escapeHtml(r.telefone)}</td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.utm_campaign)}">${escapeHtml(r.utm_campaign)}</span></td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.utm_medium)}">${escapeHtml(r.utm_medium)}</span></td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.utm_source)}">${escapeHtml(r.utm_source)}</span></td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.utm_term)}">${escapeHtml(r.utm_term)}</span></td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.utm_content)}">${escapeHtml(r.utm_content)}</span></td>
  <td>${escapeHtml(r.vendedor)}</td>
  <td class="td-colBool"><span class="td-bool${r.isAgencia ? " td-bool--true" : ""}">${r.isAgencia ? "Sim" : "Não"}</span></td>
  <td><span class="td-ellipsis" title="${escapeHtml(r.agenciaNome)}">${escapeHtml(r.agenciaNome)}</span></td>
  <td class="td-colMore">
    <button class="td-moreBtn" type="button" data-role="more" aria-label="Mais">⋮</button>
  </td>
</tr>
`.trim();
  }

  function deriveIsAgencia(lead) {
    try {
      return Boolean(lead && (lead.agencia || lead.agenciatext));
    } catch (_e) {
      return false;
    }
  }

  function pickClientName(lead) {
    const empresa = safeStr(lead && lead.empresa);
    if (empresa) return empresa;
    const nome = safeStr(lead && lead.nome);
    if (nome) return nome;
    return "—";
  }

  function pickSegmento(lead) {
    const t = safeStr(lead && (lead.segmentotext || lead.segmento_mgs_text));
    if (t) return t;
    const rel = lead && lead.segmentoRel;
    const relNome = safeStr(rel && rel.nome);
    if (relNome) return relNome;
    return "—";
  }

  function pickAgenciaNome(lead) {
    const t = safeStr(lead && lead.agenciatext);
    if (t) return t;
    const rel = lead && lead.agenciaRel;
    const relNome = safeStr(rel && rel.nome);
    if (relNome) return relNome;
    return "";
  }

  function pickVendedorNome(lead) {
    const rel = lead && lead.vendedor;
    const relNome = safeStr(rel && rel.nome);
    if (relNome) return relNome;
    return "—";
  }

  function pickDateForView(lead, view) {
    if (view === VIEW.leads) return lead && lead.created_at;
    // etapa do vendedor: preferir timestamp de entrada da etapa do vendedor
    return (
      (lead && (lead.entradaetapaatualvendedor || lead.entradaetapa)) ||
      (lead && lead.data_atualizacao) ||
      (lead && lead.created_at)
    );
  }

  async function fetchRowsFromSupabase(sbClient, view, params, page, pageSize) {
    const limit = Math.max(1, Math.min(2000, Number(pageSize) || 25));
    const from = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit);
    const to = from + limit - 1;
    const sellerId = normalizeUuidParam(params && (params.vendedorResponsavelId || params.sellerId));
    const funilVendedorId = normalizeUuidParam(params && (params.funilVendedorId || params.funilId));
    const dateFrom = safeStr(params && (params.dateFrom || params.dataDe));
    const dateTo = safeStr(params && (params.dateTo || params.dataAte));

    dbg("query supabase-js", {
      view,
      page,
      pageSize: limit,
      range: { from, to },
      sellerId: sellerId || null,
      funilVendedorId: funilVendedorId || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    });

    let q = sbClient
      .from("leads")
      .select(LEADS_SELECT, { count: "exact" })
      .range(from, to);

    // excluido != true (inclui null/false)
    q = q.or("excluido.is.null,excluido.eq.false");

    if (sellerId) q = q.eq("vendedorResponsavel", sellerId);
    if (funilVendedorId) q = q.eq("funilVendedor", funilVendedorId);

    // filtros por aba (menu lateral esquerdo)
    // - leads: não filtra por etapa (lista completa)
    // - opps: somente etapa de oportunidade
    // - meetings: somente etapas de reunião
    if (view === VIEW.opps) q = q.eq("etapaVendedorFunil", STAGE_OPPORTUNITY_ID);
    if (view === VIEW.meetings) q = q.in("etapaVendedorFunil", STAGE_MEETING_IDS);

    // filtros de data (inputs De/Ate)
    q = applyDateFiltersToQuery(q, view, dateFrom, dateTo);

    // ordenação
    if (view === VIEW.leads) {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q
        .order("entradaetapaatualvendedor", { ascending: false, nullsFirst: false })
        .order("entradaetapa", { ascending: false, nullsFirst: false })
        .order("data_atualizacao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    const { data, error, count } = await q;
    if (error) throw error;

    const arr = Array.isArray(data) ? data : [];
    const total = typeof count === "number" ? count : null;
    dbg("supabase-js retorno", { rows: arr.length, total });

    return {
      rows: arr.map((lead) => {
      const id = safeStr(lead && lead.lead_id) || "—";
      const dateVal = pickDateForView(lead, view);
      return {
        id,
        dateLabel: formatDatePtBr(dateVal),
        clientName: pickClientName(lead),
        segmento: pickSegmento(lead),
        email: safeStr(lead && lead.email) || "—",
        telefone: safeStr(lead && lead.telefone) || "—",
        utm_campaign: safeStr(lead && lead.utm_campaign),
        utm_medium: safeStr(lead && lead.utm_medium),
        utm_source: safeStr(lead && lead.utm_source),
        utm_term: safeStr(lead && lead.utm_term),
        utm_content: safeStr(lead && lead.utm_content),
        vendedor: pickVendedorNome(lead),
        isAgencia: deriveIsAgencia(lead),
        agenciaNome: pickAgenciaNome(lead),
      };
      }),
      total,
      hasMore: total !== null ? from + arr.length < total : arr.length === limit,
    };
  }

  async function fetchRowsFromRest(supabaseUrl, supabaseAnonKey, view, params, page, pageSize) {
    const limit = Math.max(1, Math.min(2000, Number(pageSize) || 25));
    const from = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit);
    // Para saber se tem próxima página sem usar headers (CORS), pedimos 1 item extra.
    const limitPlusOne = Math.min(2001, limit + 1);
    const sellerId = normalizeUuidParam(params && (params.vendedorResponsavelId || params.sellerId));
    const funilVendedorId = normalizeUuidParam(params && (params.funilVendedorId || params.funilId));
    const dateFrom = safeStr(params && (params.dateFrom || params.dataDe));
    const dateTo = safeStr(params && (params.dateTo || params.dataAte));

    const base = safeStr(supabaseUrl).replace(/\/$/, "");
    const url = new URL(`${base}/rest/v1/leads`);

    url.searchParams.set("select", LEADS_SELECT);
    url.searchParams.set("limit", String(limitPlusOne));
    url.searchParams.set("offset", String(from));
    // excluido != true (inclui null/false)
    url.searchParams.set("or", "(excluido.is.null,excluido.eq.false)");

    // filtros opcionais (uuid)
    if (sellerId) url.searchParams.set("vendedorResponsavel", `eq.${sellerId}`);
    if (funilVendedorId) url.searchParams.set("funilVendedor", `eq.${funilVendedorId}`);

    // filtros por aba
    if (view === VIEW.opps) url.searchParams.set("etapaVendedorFunil", `eq.${STAGE_OPPORTUNITY_ID}`);
    if (view === VIEW.meetings) {
      url.searchParams.set("etapaVendedorFunil", `in.(${STAGE_MEETING_IDS.join(",")})`);
    }

    // filtros de data (inputs De/Ate)
    const col = view === VIEW.leads ? "created_at" : "entradaetapaatualvendedor";
    if (isDateOnlyString(dateFrom)) url.searchParams.append(col, `gte.${dateFrom}`);
    if (isDateOnlyString(dateTo)) {
      const toPlusOne = addDaysDateOnly(dateTo, 1);
      if (toPlusOne) url.searchParams.append(col, `lt.${toPlusOne}`);
    }

    // ordenação
    if (view === VIEW.leads) {
      url.searchParams.set("order", "created_at.desc");
    } else {
      url.searchParams.set("order", "entradaetapaatualvendedor.desc.nullslast,entradaetapa.desc.nullslast,data_atualizacao.desc.nullslast,created_at.desc");
    }

    dbg("query REST", {
      view,
      page,
      pageSize: limit,
      offset: from,
      sellerId: sellerId || null,
      funilVendedorId: funilVendedorId || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      url: url.toString(),
      anonKey: maskSecret(supabaseAnonKey),
    });

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`REST HTTP ${res.status}: ${text || "sem corpo"}`);
    }

    const data = await res.json();
    const arrAll = Array.isArray(data) ? data : [];
    const hasMore = arrAll.length > limit;
    const arr = arrAll.slice(0, limit);
    dbg("REST retorno", { rows: arr.length, hasMore });

    return {
      rows: arr.map((lead) => {
      const id = safeStr(lead && lead.lead_id) || "—";
      const dateVal = pickDateForView(lead, view);
      return {
        id,
        dateLabel: formatDatePtBr(dateVal),
        clientName: pickClientName(lead),
        segmento: pickSegmento(lead),
        email: safeStr(lead && lead.email) || "—",
        telefone: safeStr(lead && lead.telefone) || "—",
        utm_campaign: safeStr(lead && lead.utm_campaign),
        utm_medium: safeStr(lead && lead.utm_medium),
        utm_source: safeStr(lead && lead.utm_source),
        utm_term: safeStr(lead && lead.utm_term),
        utm_content: safeStr(lead && lead.utm_content),
        vendedor: pickVendedorNome(lead),
        isAgencia: deriveIsAgencia(lead),
        agenciaNome: pickAgenciaNome(lead),
      };
      }),
      total: null,
      hasMore,
    };
  }

  function init(root, params) {
    // idempotência por container
    try {
      if (root && root.getAttribute && root.getAttribute("data-td-inited") === "1") return;
      if (root && root.setAttribute) root.setAttribute("data-td-inited", "1");
    } catch (e) {}

    // Debug (liga console.logs). Use params.debug=true no Bubble.
    try {
      window.__TD_DEBUG__ = parseBool(params && params.debug);
    } catch (_e) {
      window.__TD_DEBUG__ = false;
    }
    dbg("init()", {
      hasRoot: Boolean(root),
      paramsKeys: params ? Object.keys(params) : [],
      supabaseUrl: params && params.supabaseUrl ? safeStr(params.supabaseUrl) : "",
      anonKey: params && (params.supabaseAnonKey || params.supabaseKey) ? maskSecret(params.supabaseAnonKey || params.supabaseKey) : "",
    });

    const el = root.querySelector('[data-cdn-widget="tabela_dados"]') || root;
    const tbody = el.querySelector('[data-role="tbody"]');
    const search = el.querySelector('[data-role="search"]');
    const checkAll = el.querySelector('[data-role="check-all"]');
    const range = el.querySelector('[data-role="range"]');
    const btnPrev = el.querySelector('[data-role="prev"]');
    const btnNext = el.querySelector('[data-role="next"]');
    const btnExport = el.querySelector('[data-role="export"]');
    const btnPageSize = el.querySelector('[data-role="page-size"]');
    const pageSizeLabel = el.querySelector('[data-role="page-size-label"]');
    const titleEl = el.querySelector('[data-role="title"]');
    const dateFromInput = el.querySelector('[data-role="date-from"]');
    const dateToInput = el.querySelector('[data-role="date-to"]');
    const dateClearBtn = el.querySelector('[data-role="date-clear"]');

    const navLeads = el.querySelector('[data-role="nav-leads"]');
    const navOpps = el.querySelector('[data-role="nav-opps"]');
    const navMeetings = el.querySelector('[data-role="nav-meetings"]');
    const navItems = [navLeads, navOpps, navMeetings].filter(Boolean);

    const rowsFromParams = coerceRowsFromParams(params);

    const initialPageSize = clamp(Number((params && (params.pageSize || params.limit)) || PAGE_SIZE_DEFAULT) || PAGE_SIZE_DEFAULT, 1, 2000);

    const state = {
      page: 1,
      pageSize: initialPageSize,
      q: "",
      selected: new Set(), // ids
      view: VIEW.leads,
      allRows: rowsFromParams && rowsFromParams.length ? rowsFromParams : buildMockRows(VIEW.leads),
      total: rowsFromParams && rowsFromParams.length ? rowsFromParams.length : null,
      hasMore: false,
      cache: {}, // `${view}|${pageSize}|${page}` -> { rows, total, hasMore }
      loading: false,
      lastError: "",
      dateFrom: safeStr(params && (params.dateFrom || params.dataDe)),
      dateTo: safeStr(params && (params.dateTo || params.dataAte)),
    };

    // inicializa inputs de data
    if (dateFromInput && isDateOnlyString(state.dateFrom)) dateFromInput.value = state.dateFrom;
    if (dateToInput && isDateOnlyString(state.dateTo)) dateToInput.value = state.dateTo;

    function filteredRows() {
      const q = normalizeText(state.q);
      const src = Array.isArray(state.allRows) ? state.allRows : [];
      if (!q) return src.slice();
      return src.filter((r) => {
        const hay =
          normalizeText(r.dateLabel) +
          " " +
          normalizeText(r.id) +
          " " +
          normalizeText(r.clientName) +
          " " +
          normalizeText(r.segmento) +
          " " +
          normalizeText(r.email) +
          " " +
          normalizeText(r.telefone) +
          " " +
          normalizeText(r.utm_campaign) +
          " " +
          normalizeText(r.utm_medium) +
          " " +
          normalizeText(r.utm_source) +
          " " +
          normalizeText(r.utm_term) +
          " " +
          normalizeText(r.utm_content) +
          " " +
          normalizeText(r.vendedor) +
          " " +
          normalizeText(r.isAgencia ? "agencia sim true" : "agencia nao false") +
          " " +
          normalizeText(r.agenciaNome);
        return hay.includes(q);
      });
    }

    function getOffsetStart() {
      return Math.max(0, (Math.max(1, Number(state.page) || 1) - 1) * (Number(state.pageSize) || PAGE_SIZE_DEFAULT));
    }

    function updateCheckAllForVisible(visible) {
      if (!checkAll) return;
      const totalVisible = visible.length;
      const selectedVisible = visible.filter((r) => state.selected.has(r.id)).length;

      checkAll.indeterminate = totalVisible > 0 && selectedVisible > 0 && selectedVisible < totalVisible;
      checkAll.checked = totalVisible > 0 && selectedVisible === totalVisible;
      checkAll.disabled = totalVisible === 0;
    }

    function render() {
      if (!tbody) return;

      if (state.loading) {
        tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="td-empty">Carregando...</td></tr>`;
        if (range) range.textContent = "—";
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        updateCheckAllForVisible([]);
        return;
      }

      if (state.lastError) {
        tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="td-empty">Erro ao carregar: ${escapeHtml(state.lastError)}</td></tr>`;
        if (range) range.textContent = "—";
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        updateCheckAllForVisible([]);
        return;
      }

      const fr = filteredRows();
      const slice = fr;
      const pageSize = Number(state.pageSize) || PAGE_SIZE_DEFAULT;
      const offsetStart = getOffsetStart();
      const end = offsetStart + slice.length;
      const total = typeof state.total === "number" ? state.total : null;
      const pages = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : null;

      if (range) {
        if (!slice.length) {
          range.textContent = total !== null ? `0 de ${total}` : "0";
        } else if (total !== null) {
          range.textContent = `${offsetStart + 1}-${Math.min(end, total)} de ${total}`;
        } else {
          range.textContent = `${offsetStart + 1}-${end}${state.hasMore ? "+" : ""}`;
        }
      }
      if (btnPrev) btnPrev.disabled = state.page <= 1 || !slice.length;
      if (btnNext) btnNext.disabled = total !== null ? state.page >= pages || !slice.length : !state.hasMore;

      if (!slice.length) {
        tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="td-empty">Nenhum resultado encontrado.</td></tr>`;
        updateCheckAllForVisible([]);
        return;
      }

      tbody.innerHTML = slice.map((r) => renderRow(r, state.selected.has(r.id))).join("\n");
      updateCheckAllForVisible(slice);
    }

    function getVisibleRows() {
      return filteredRows();
    }

    function getExportRows() {
      const selectedIds = state.selected;
      const src = Array.isArray(state.allRows) ? state.allRows : [];
      const selectedRows = src.filter((r) => selectedIds.has(r.id));
      if (selectedRows.length) return selectedRows;
      return getVisibleRows();
    }

    function setActiveNav(view) {
      state.view = view;
      for (const a of navItems) a.classList.remove("td-navItem--active");
      const map = {
        [VIEW.leads]: navLeads,
        [VIEW.opps]: navOpps,
        [VIEW.meetings]: navMeetings,
      };
      const active = map[view];
      if (active) active.classList.add("td-navItem--active");

      if (titleEl) {
        titleEl.textContent =
          view === VIEW.leads ? "Leads" : view === VIEW.opps ? "Oportunidades" : "Reuniões";
      }
    }

    async function loadView(view) {
      setActiveNav(view);
      state.q = "";
      if (search) search.value = "";
      state.page = 1;
      state.selected.clear();
      state.total = null;
      state.hasMore = false;

      dbg("loadView()", { view });

      // Se vier rows via params, não força Supabase.
      if (rowsFromParams && rowsFromParams.length) {
        state.allRows = rowsFromParams;
        state.total = rowsFromParams.length;
        state.hasMore = false;
        state.lastError = "";
        state.loading = false;
        render();
        return;
      }

      const supabaseUrl = safeStr((params && params.supabaseUrl) || "https://awqtzoefutnfmnbomujt.supabase.co");
      const supabaseAnonKey = safeStr(
        (params && (params.supabaseAnonKey || params.supabaseKey)) ||
          // fallback: mesma anon key já usada no repo (widget popup-criar-lead)
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY"
      );

      if (!supabaseUrl || !supabaseAnonKey) {
        state.allRows = buildMockRows(view);
        state.cache[view] = state.allRows;
        state.lastError = "";
        state.loading = false;
        render();
        return;
      }

      state.loading = true;
      state.lastError = "";
      render();

      try {
        await loadPage(view, state.page);
      } catch (e) {
        console.error("[tabela_dados] falha ao buscar no Supabase:", e);
        state.loading = false;
        state.lastError =
          (e && e.message ? e.message : "Erro desconhecido") +
          (dbgEnabled() ? "" : " (dica: passe params.debug=true para ver logs no console)");
        render();
      }
    }

    async function loadPage(view, page) {
      const supabaseUrl = safeStr((params && params.supabaseUrl) || "https://awqtzoefutnfmnbomujt.supabase.co");
      const supabaseAnonKey = safeStr(
        (params && (params.supabaseAnonKey || params.supabaseKey)) ||
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY"
      );

      const key = `${view}|${state.pageSize}|${page}`;
      if (state.cache[key]) {
        const cached = state.cache[key];
        state.page = page;
        state.allRows = cached.rows;
        state.total = cached.total;
        state.hasMore = cached.hasMore;
        state.loading = false;
        state.lastError = "";
        render();
        return;
      }

      state.loading = true;
      state.lastError = "";
      render();

      // Tentativa A: supabase-js (CDN). Pode falhar no Bubble por CSP bloqueando cdn.jsdelivr.net.
      let out = null;
      try {
        await ensureSupabaseJs();
        const createClient = getSupabaseCreateClient();
        if (!createClient) throw new Error("Supabase JS não carregou (createClient indisponível).");
        dbg("createClient OK (supabase-js).");
        const sbClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          accessToken: async () => supabaseAnonKey,
        });
        out = await fetchRowsFromSupabase(
          sbClient,
          view,
          { ...(params || {}), dateFrom: state.dateFrom, dateTo: state.dateTo },
          page,
          state.pageSize
        );
      } catch (e1) {
        dbgWarn("supabase-js falhou; tentando REST direto…", e1 && e1.message ? e1.message : e1);
        out = await fetchRowsFromRest(
          supabaseUrl,
          supabaseAnonKey,
          view,
          { ...(params || {}), dateFrom: state.dateFrom, dateTo: state.dateTo },
          page,
          state.pageSize
        );
      }

      state.page = page;
      state.allRows = out.rows;
      state.total = out.total;
      state.hasMore = Boolean(out.hasMore);
      state.cache[key] = out;
      state.loading = false;
      state.lastError = "";
      render();
    }

    // Listeners
    if (search) {
      search.addEventListener("input", () => {
        state.q = search.value || "";
        state.page = 1;
        render();
      });
    }

    if (navLeads) navLeads.addEventListener("click", () => void loadView(VIEW.leads));
    if (navOpps) navOpps.addEventListener("click", () => void loadView(VIEW.opps));
    if (navMeetings) navMeetings.addEventListener("click", () => void loadView(VIEW.meetings));

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        const nextPage = Math.max(1, state.page - 1);
        void loadPage(state.view, nextPage);
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        const nextPage = state.page + 1;
        void loadPage(state.view, nextPage);
      });
    }

    if (checkAll) {
      checkAll.addEventListener("change", () => {
        const visible = getVisibleRows();
        if (!visible.length) return;
        if (checkAll.checked) {
          for (const r of visible) state.selected.add(r.id);
        } else {
          for (const r of visible) state.selected.delete(r.id);
        }
        render();
      });
    }

    if (tbody) {
      tbody.addEventListener("change", (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.getAttribute("data-role") !== "row-check") return;

        const tr = t.closest("tr");
        const id = tr ? tr.getAttribute("data-row-id") : null;
        if (!id) return;

        if (t.checked) state.selected.add(id);
        else state.selected.delete(id);

        updateCheckAllForVisible(getVisibleRows());
      });
    }

    if (btnExport) {
      btnExport.addEventListener("click", () => {
        try {
          const rows = getExportRows();
          const csv = toCsv(rows);
          const suffix = new Date().toISOString().slice(0, 10);
          const prefix =
            state.view === VIEW.leads ? "leads" : state.view === VIEW.opps ? "oportunidades" : "reunioes";
          downloadTextFile(`${prefix}_${suffix}.csv`, csv, "text/csv;charset=utf-8");
        } catch (e) {
          console.error("[tabela_dados] falha ao exportar:", e);
          alert("Não consegui exportar o CSV. Veja o console para detalhes.");
        }
      });
    }

    if (btnPageSize) {
      // Inclui 1 (paginação 1 a 1) e opções maiores para reduzir cliques em listas grandes.
      const baseOptions = [1, 25, 50, 100, 200];
      const options = Array.from(new Set(baseOptions.concat([Number(state.pageSize) || PAGE_SIZE_DEFAULT])))
        .filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 2000)
        .sort((a, b) => a - b);
      btnPageSize.addEventListener("click", () => {
        const current = Number(state.pageSize);
        const idx = Math.max(0, options.indexOf(current));
        const next = options[(idx + 1) % options.length];
        state.pageSize = next;
        state.page = 1;
        // página/tamanho mudou -> invalida cache (evita misturar ranges)
        state.cache = {};
        if (pageSizeLabel) pageSizeLabel.textContent = String(next);
        void loadPage(state.view, 1);
      });
    }

    // filtros de data (server-side)
    function onDateFilterChange() {
      state.dateFrom = dateFromInput ? safeStr(dateFromInput.value) : "";
      state.dateTo = dateToInput ? safeStr(dateToInput.value) : "";
      state.page = 1;
      state.selected.clear();
      state.cache = {};
      void loadPage(state.view, 1);
    }

    if (dateFromInput) dateFromInput.addEventListener("change", onDateFilterChange);
    if (dateToInput) dateToInput.addEventListener("change", onDateFilterChange);
    if (dateClearBtn) {
      dateClearBtn.addEventListener("click", () => {
        if (dateFromInput) dateFromInput.value = "";
        if (dateToInput) dateToInput.value = "";
        onDateFilterChange();
      });
    }

    // Render inicial
    if (pageSizeLabel) pageSizeLabel.textContent = String(state.pageSize);
    void loadView(VIEW.leads);
  }

  window.CDN_WIDGET_REGISTRY[WIDGET_KEY] = { init };
})();

