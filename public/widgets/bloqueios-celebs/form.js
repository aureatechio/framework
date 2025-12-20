;(function () {
  const WIDGET_KEY = "bloqueios-celebs";
  const SUPABASE_UMD_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js";

  const DEFAULT_SUPABASE_URL = "https://awqtzoefutnfmnbomujt.supabase.co";
  const DEFAULT_SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY";

  const safeStr = (v) => (v === null || v === undefined) ? "" : String(v);
  const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

  function debounce(fn, wait = 300) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function normalizeSupabaseProjectUrl(input) {
    const raw = safeStr(input).trim();
    if (!raw) return "";
    return raw
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/+$/g, "");
  }

  function ensureSupabaseUmd() {
    // dedupe global
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve();
    if (window.__cdnSupabaseUmdPromise) return window.__cdnSupabaseUmdPromise;

    window.__cdnSupabaseUmdPromise = new Promise((resolve, reject) => {
      const existing = Array.from(document.querySelectorAll("script")).find(s => s && s.src === SUPABASE_UMD_SRC);
      if (existing) {
        // já existe tag; espera carregar
        const t = setInterval(() => {
          if (window.supabase && typeof window.supabase.createClient === "function") {
            clearInterval(t);
            resolve();
          }
        }, 50);
        setTimeout(() => { clearInterval(t); reject(new Error("Supabase JS não carregou (timeout).")); }, 8000);
        return;
      }

      const s = document.createElement("script");
      s.src = SUPABASE_UMD_SRC;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar supabase-js (CDN)."));
      document.head.appendChild(s);
    });

    return window.__cdnSupabaseUmdPromise;
  }

  function remapDomIds(root, prefix) {
    const map = new Map();
    const nodes = Array.from(root.querySelectorAll("[id]"));
    nodes.forEach((el) => {
      const oldId = safeStr(el.id).trim();
      if (!oldId) return;
      const newId = `${prefix}-${oldId}`;
      map.set(oldId, newId);
      el.id = newId;
    });

    const remapAttr = (attrName, splitSpaces = false) => {
      Array.from(root.querySelectorAll(`[${attrName}]`)).forEach((el) => {
        const raw = safeStr(el.getAttribute(attrName)).trim();
        if (!raw) return;
        if (!splitSpaces) {
          if (map.has(raw)) el.setAttribute(attrName, map.get(raw));
          return;
        }
        const parts = raw.split(/\s+/g).filter(Boolean).map(p => map.get(p) || p);
        el.setAttribute(attrName, parts.join(" "));
      });
    };

    remapAttr("for", false);
    remapAttr("aria-controls", false);
    remapAttr("aria-labelledby", true);
    remapAttr("aria-describedby", true);

    return map;
  }

  function formatDateBR(isoOrDate) {
    try {
      const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
      if (Number.isNaN(d.getTime())) return "-";
      return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
    } catch (_) { return "-"; }
  }

  function csvEscape(val, delimiter) {
    const s = safeStr(val);
    const d = delimiter || ",";
    if (s.includes('"') || s.includes(d) || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadText(filename, text) {
    // BOM ajuda Excel/Windows a reconhecer UTF-8 com acentos.
    const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function init(container, params) {
    const root = container ? (container.querySelector(`[data-cdn-widget="${WIDGET_KEY}"]`) || container) : null;
    if (!root) return;
    if (root.getAttribute("data-bloqueios-inited") === "1") return;
    root.setAttribute("data-bloqueios-inited", "1");

    const instanceId = safeStr(params && (params.instanceId || params._instanceId)).trim() || Math.random().toString(36).slice(2, 9);
    const idPrefix = `${WIDGET_KEY}-${instanceId}`;
    const idMap = remapDomIds(root, idPrefix);

    const $ = (id) => {
      if (!root) return null;
      const mapped = idMap && idMap.get(id);
      return root.querySelector("#" + (mapped || id));
    };
    const $$ = (sel) => root ? Array.from(root.querySelectorAll(sel)) : [];

    function showToast(message, icon) {
      const toast = $("toast");
      const txt = $("toast-txt");
      if (!toast || !txt) return;
      txt.textContent = message;
      const ic = toast.querySelector(".material-symbols-rounded");
      if (ic && icon) ic.textContent = icon;
      toast.classList.add("active");
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => toast.classList.remove("active"), 1600);
    }

    // =========================
    // Estado (por instância)
    // =========================
    const cfg = params || {};
    const cfgUrl = normalizeSupabaseProjectUrl(cfg.supabaseUrl || DEFAULT_SUPABASE_URL);
    const cfgKey = safeStr(cfg.supabaseAnonKey || DEFAULT_SUPABASE_KEY).trim();
    const cfgPageSize = Math.max(20, parseInt(cfg.pageSize, 10) || 100);

    const STATE = {
      supabase: null,
      sbUrl: "",
      sbKey: "",
      pageSize: cfgPageSize,
      offset: 0,
      total: 0,
      loading: false,
      exporting: false,
      sort: { col: "created_at", dir: "desc" },
      selectedRowId: null,
      celebNameById: new Map(), // id -> nome
      filters: {
        q: "",
        dateStart: null, // Date | null
        dateEnd: null,   // Date | null
        tipo: [],
        estado: [],
        cidade: [],
        segmento: [],
        subsegmento: [],
        negocio: [],
        cliente: "",
        celebridade: ""
      },
      options: {
        loaded: false,
        tipo: [],
        estado: [],
        cidade: [],
        segmento: [],
        subsegmento: [],
        negocio: []
      }
    };

    // =========================
    // UI helpers
    // =========================
    function setKpi(countText, statusText) {
      const c = $("kpi-count");
      const s = $("kpi-status");
      if (c) c.textContent = countText;
      if (s) s.textContent = statusText;
    }

    function setState(which) {
      const loading = $("state-loading");
      const empty = $("state-empty");
      const error = $("state-error");
      const thead = $("thead");
      if (loading) loading.classList.toggle("active", which === "loading");
      if (empty) empty.classList.toggle("active", which === "empty");
      if (error) error.classList.toggle("active", which === "error");
      if (thead) thead.style.display = (which === "ready") ? "grid" : "none";
    }

    function updatePager() {
      const prev = $("btn-prev");
      const next = $("btn-next");
      const label = $("page-label");
      const pageSize = STATE.pageSize;
      const total = STATE.total || 0;
      const offset = STATE.offset || 0;
      const page = Math.floor(offset / pageSize) + 1;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = total ? (offset + 1) : 0;
      const end = Math.min(offset + pageSize, total);

      if (label) label.textContent = total ? `${start}–${end} de ${total} (pág. ${page}/${totalPages})` : "—";
      if (prev) prev.disabled = STATE.loading || offset <= 0;
      if (next) next.disabled = STATE.loading || (offset + pageSize >= total);
    }

    function setDateLabel() {
      const el = $("date-label");
      if (!el) return;
      const s = STATE.filters.dateStart;
      const e = STATE.filters.dateEnd;
      if (!s && !e) { el.textContent = "Datas"; return; }
      const a = s ? formatDateBR(s) : "—";
      const b = e ? formatDateBR(e) : "—";
      el.textContent = `${a} → ${b}`;
    }

    function clearSelection() {
      STATE.selectedRowId = null;
      const tbody = $("tbody");
      if (tbody) tbody.classList.remove("dim-others");
      $$(".tbody .tr.is-selected").forEach(el => el.classList.remove("is-selected"));
    }

    // =========================
    // Supabase init
    // =========================
    function waitForSupabase(cb, maxAttempts = 60) {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (window.supabase && typeof window.supabase.createClient === "function") {
          clearInterval(t);
          cb();
          return;
        }
        if (tries >= maxAttempts) {
          clearInterval(t);
          cb(new Error("Supabase JS não carregou (timeout). Verifique bloqueio de CDN no Bubble ou conflito de scripts."));
        }
      }, 120);
    }

    function initSupabase() {
      const url = cfgUrl || DEFAULT_SUPABASE_URL;
      const key = cfgKey || DEFAULT_SUPABASE_KEY;
      if (!url || !key) throw new Error("Config Supabase ausente (URL/AnonKey).");
      STATE.sbUrl = url;
      STATE.sbKey = key;
      STATE.supabase = window.supabase.createClient(url, key);
      return true;
    }

    // =========================
    // REST fallback (PostgREST)
    // =========================
    function getRestBase() {
      const base = safeStr(STATE.sbUrl).trim().replace(/\/+$/g, "");
      if (!base) throw new Error("Supabase URL não inicializada.");
      return base + "/rest/v1";
    }

    function parseContentRangeTotal(contentRange) {
      const s = safeStr(contentRange);
      const m = s.match(/\/(\d+)\s*$/);
      return m ? (parseInt(m[1], 10) || 0) : 0;
    }

    function buildInList(values) {
      const list = (Array.isArray(values) ? values : []).map(v => safeStr(v).trim()).filter(Boolean);
      if (!list.length) return null;
      // aspas para suportar espaços/acentos
      return "in.(" + list.map(v => JSON.stringify(v)).join(",") + ")";
    }

    function sanitizeForPostgrestValue(raw) {
      // evita quebrar querystring (principalmente no `or=` que usa vírgula/parenteses como separadores)
      return safeStr(raw).replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
    }

    async function restFetchJson(pathWithQuery, { preferCountExact = false } = {}) {
      const url = getRestBase() + pathWithQuery;
      const headers = {
        apikey: STATE.sbKey,
        Authorization: `Bearer ${STATE.sbKey}`,
      };
      if (preferCountExact) headers.Prefer = "count=exact";
      const res = await fetch(url, { method: "GET", headers });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
      if (!res.ok) {
        const msg = (json && (json.message || json.error)) ? (json.message || json.error) : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return { json, headers: res.headers };
    }

    // =========================
    // Query builder
    // =========================
    async function resolveCelebrityFilterIds(term) {
      const t = safeStr(term).trim();
      if (!t) return null;
      if (isUUID(t)) return { mode: "uuid", ids: [t] };

      // 1) tenta via supabase-js (se estiver ok)
      try {
        const { data, error } = await STATE.supabase
          .from("celebridadesReferencia")
          .select("id, nome")
          .ilike("nome", `%${t}%`)
          .limit(50);
        if (error) throw error;
        const ids = (Array.isArray(data) ? data : []).map(r => r && r.id).filter(Boolean);
        return { mode: "name", ids };
      } catch (_) {}

      // 2) fallback via REST
      try {
        const qs = new URLSearchParams();
        qs.set("select", "id");
        qs.set("nome", `ilike.*${t}*`);
        qs.set("limit", "50");
        const { json } = await restFetchJson(`/celebridadesReferencia?${qs.toString()}`);
        const ids = (Array.isArray(json) ? json : []).map(r => r && r.id).filter(Boolean);
        return { mode: "name", ids };
      } catch (_) {
        return { mode: "name", ids: [] };
      }
    }

    async function hydrateCelebrityNamesFromRows(rows) {
      const ids = Array.from(new Set((Array.isArray(rows) ? rows : [])
        .map(r => safeStr(r && r.celebridade).trim())
        .filter(v => v && isUUID(v))));
      const missing = ids.filter(id => !STATE.celebNameById.has(id));
      if (!missing.length) return;

      // chunk para evitar URL grande
      const chunkSize = 120;
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        const qs = new URLSearchParams();
        qs.set("select", "id,nome");
        qs.set("id", buildInList(chunk));
        qs.set("limit", String(chunkSize));
        const { json } = await restFetchJson(`/celebridadesReferencia?${qs.toString()}`);
        (Array.isArray(json) ? json : []).forEach(r => {
          const id = safeStr(r && r.id).trim();
          const nome = safeStr(r && r.nome).trim();
          if (id) STATE.celebNameById.set(id, nome || id);
        });
      }
    }

    async function restFetchBloqueiosPage({ offset, limit, withCount, celebResolved } = {}) {
      const qs = new URLSearchParams();
      qs.set("select", "id,created_at,estado,cidade,tipo_bloqueio,segmento_nome,subsegmento_nome,negocio_nome,cliente_nome,celebridade");
      qs.set("order", `${STATE.sort.col}.${STATE.sort.dir}`);
      qs.set("limit", String(Math.max(1, parseInt(limit, 10) || 100)));
      qs.set("offset", String(Math.max(0, parseInt(offset, 10) || 0)));

      // Date range
      if (STATE.filters.dateStart instanceof Date && !Number.isNaN(STATE.filters.dateStart.getTime())) {
        qs.append("created_at", `gte.${STATE.filters.dateStart.toISOString()}`);
      }
      if (STATE.filters.dateEnd instanceof Date && !Number.isNaN(STATE.filters.dateEnd.getTime())) {
        const end = new Date(STATE.filters.dateEnd);
        end.setHours(23, 59, 59, 999);
        qs.append("created_at", `lte.${end.toISOString()}`);
      }

      // Multi-select
      const tipoIn = buildInList(STATE.filters.tipo); if (tipoIn) qs.set("tipo_bloqueio", tipoIn);
      const estadoIn = buildInList(STATE.filters.estado); if (estadoIn) qs.set("estado", estadoIn);
      const cidadeIn = buildInList(STATE.filters.cidade); if (cidadeIn) qs.set("cidade", cidadeIn);
      const segIn = buildInList(STATE.filters.segmento); if (segIn) qs.set("segmento_nome", segIn);
      const subIn = buildInList(STATE.filters.subsegmento); if (subIn) qs.set("subsegmento_nome", subIn);
      const negIn = buildInList(STATE.filters.negocio); if (negIn) qs.set("negocio_nome", negIn);

      // Cliente
      const cliente = sanitizeForPostgrestValue(STATE.filters.cliente);
      if (cliente) qs.set("cliente_nome", `ilike.*${cliente}*`);

      // Celebridade
      const celebTerm = safeStr(STATE.filters.celebridade).trim();
      const resolved = celebResolved || (celebTerm ? await resolveCelebrityFilterIds(celebTerm) : null);
      if (resolved && Array.isArray(resolved.ids)) {
        if (resolved.ids.length === 0) qs.set("id", "eq.-1");
        else if (resolved.ids.length === 1) qs.set("celebridade", `eq.${resolved.ids[0]}`);
        else qs.set("celebridade", "in.(" + resolved.ids.map(v => JSON.stringify(v)).join(",") + ")");
      }

      // Busca rápida (OR)
      const term = sanitizeForPostgrestValue(STATE.filters.q);
      if (term) {
        const like = `*${term}*`;
        qs.set("or", "(" + [
          `tipo_bloqueio.ilike.${like}`,
          `estado.ilike.${like}`,
          `cidade.ilike.${like}`,
          `segmento_nome.ilike.${like}`,
          `subsegmento_nome.ilike.${like}`,
          `negocio_nome.ilike.${like}`,
          `cliente_nome.ilike.${like}`,
        ].join(",") + ")");
      }

      const { json, headers } = await restFetchJson(`/bloqueiosCelebridades?${qs.toString()}`, { preferCountExact: !!withCount });
      const total = withCount ? parseContentRangeTotal(headers.get("content-range")) : null;
      return { rows: Array.isArray(json) ? json : [], total };
    }

    // =========================
    // Options (distinct-ish)
    // =========================
    function uniqSorted(arr) {
      const set = new Set();
      (Array.isArray(arr) ? arr : []).forEach(v => {
        const s = safeStr(v).trim();
        if (s) set.add(s);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    async function loadFilterOptionsIfNeeded() {
      if (STATE.options.loaded) return;
      setKpi("—", "Carregando filtros…");
      try {
        const qs = new URLSearchParams();
        qs.set("select", "tipo_bloqueio,estado,cidade,segmento_nome,subsegmento_nome,negocio_nome");
        qs.set("limit", "5000");
        const { json } = await restFetchJson(`/bloqueiosCelebridades?${qs.toString()}`);
        const rows = Array.isArray(json) ? json : [];
        STATE.options.tipo = uniqSorted(rows.map(r => r && r.tipo_bloqueio));
        STATE.options.estado = uniqSorted(rows.map(r => r && r.estado));
        STATE.options.cidade = uniqSorted(rows.map(r => r && r.cidade));
        STATE.options.segmento = uniqSorted(rows.map(r => r && r.segmento_nome));
        STATE.options.subsegmento = uniqSorted(rows.map(r => r && r.subsegmento_nome));
        STATE.options.negocio = uniqSorted(rows.map(r => r && r.negocio_nome));
        STATE.options.loaded = true;
      } finally {
        setKpi(STATE.total ? `${STATE.total} bloqueios` : "—", "Pronto");
      }
    }

    function renderChecklist(listEl, values, selectedArr, onToggle, filterText) {
      if (!listEl) return;
      const term = safeStr(filterText).trim().toLowerCase();
      const items = (Array.isArray(values) ? values : []).filter(v => {
        if (!term) return true;
        return safeStr(v).toLowerCase().includes(term);
      });
      const selected = new Set((Array.isArray(selectedArr) ? selectedArr : []).map(v => safeStr(v)));

      listEl.innerHTML = "";
      if (items.length === 0) {
        const div = document.createElement("div");
        div.style.padding = "12px";
        div.style.fontSize = "12px";
        div.style.color = "#5F6368";
        div.textContent = "Sem opções.";
        listEl.appendChild(div);
        return;
      }

      items.forEach(v => {
        const id = "chk-" + Math.random().toString(16).slice(2);
        const row = document.createElement("label");
        row.className = "check-item";
        row.setAttribute("for", id);
        row.innerHTML = `
          <input id="${id}" type="checkbox" ${selected.has(String(v)) ? "checked" : ""} />
          <div class="txt">${safeStr(v) || "-"}</div>
        `;
        row.addEventListener("click", (e) => {
          // não deixa o label dar double toggle
          if (e.target && e.target.tagName === "INPUT") return;
          const cb = row.querySelector("input");
          if (cb) cb.checked = !cb.checked;
          onToggle(v, cb ? cb.checked : false);
        });
        const cb = row.querySelector("input");
        if (cb) {
          cb.addEventListener("change", () => onToggle(v, cb.checked));
        }
        listEl.appendChild(row);
      });
    }

    function renderSelectedChips() {
      const host = $("chips-selected");
      if (!host) return;
      host.innerHTML = "";

      const toneFromKey = (key) => {
        switch (key) {
          case "tipo": return "tone-blue";
          case "estado": return "tone-green";
          case "cidade": return "tone-green";
          case "segmento": return "tone-yellow";
          case "subsegmento": return "tone-yellow";
          case "negocio": return "tone-red";
          case "cliente": return "tone-blue";
          case "celebridade": return "tone-red";
          default: return "tone-blue";
        }
      };

      const f = STATE.filters;
      const makeRemoveArr = (key, val) => () => {
        f[key] = (Array.isArray(f[key]) ? f[key] : []).filter(x => x !== val);
        syncFilterUiCounts();
        renderFiltersModalLists(); // reflete checkboxes
        renderSelectedChips();
      };

      (f.tipo || []).forEach(v => { const k="tipo"; const elLabel=`Tipo: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      (f.estado || []).forEach(v => { const k="estado"; const elLabel=`UF: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      (f.cidade || []).forEach(v => { const k="cidade"; const elLabel=`Cidade: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      (f.segmento || []).forEach(v => { const k="segmento"; const elLabel=`Seg: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      (f.subsegmento || []).forEach(v => { const k="subsegmento"; const elLabel=`Sub: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      (f.negocio || []).forEach(v => { const k="negocio"; const elLabel=`Neg: ${v}`; const on=makeRemoveArr(k, v); const tone=toneFromKey(k); const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${elLabel}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", on); host.appendChild(chip); });
      if (safeStr(f.cliente).trim()) { const k="cliente"; const tone=toneFromKey(k); const label=`Cliente: ${safeStr(f.cliente).trim()}`; const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${label}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", () => { f.cliente = ""; const inp = $("filtro-cliente"); if (inp) inp.value = ""; renderSelectedChips(); }); host.appendChild(chip); }
      if (safeStr(f.celebridade).trim()) { const k="celebridade"; const tone=toneFromKey(k); const label=`Celeb: ${safeStr(f.celebridade).trim()}`; const chip=document.createElement("span"); chip.className=`chip ${tone}`; chip.innerHTML=`<span class="ellipsis">${label}</span>`; chip.style.cursor="pointer"; chip.title="Clique para remover"; chip.addEventListener("click", () => { f.celebridade = ""; const inp = $("filtro-celeb"); if (inp) inp.value = ""; renderSelectedChips(); }); host.appendChild(chip); }
    }

    function syncFilterUiCounts() {
      const f = STATE.filters;
      const set = (id, n) => { const el = $(id); if (el) el.textContent = `${n} selecionados`; };
      set("count-tipo", (f.tipo || []).length);
      set("count-estado", (f.estado || []).length);
      set("count-cidade", (f.cidade || []).length);
      set("count-seg", (f.segmento || []).length);
      set("count-sub", (f.subsegmento || []).length);
      set("count-neg", (f.negocio || []).length);
    }

    function renderFiltersModalLists() {
      renderChecklist($("list-tipo"), STATE.options.tipo, STATE.filters.tipo, (v, checked) => {
        const a = STATE.filters.tipo;
        STATE.filters.tipo = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-tipo-q")?.value);

      renderChecklist($("list-estado"), STATE.options.estado, STATE.filters.estado, (v, checked) => {
        const a = STATE.filters.estado;
        STATE.filters.estado = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-estado-q")?.value);

      renderChecklist($("list-cidade"), STATE.options.cidade, STATE.filters.cidade, (v, checked) => {
        const a = STATE.filters.cidade;
        STATE.filters.cidade = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-cidade-q")?.value);

      renderChecklist($("list-seg"), STATE.options.segmento, STATE.filters.segmento, (v, checked) => {
        const a = STATE.filters.segmento;
        STATE.filters.segmento = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-seg-q")?.value);

      renderChecklist($("list-sub"), STATE.options.subsegmento, STATE.filters.subsegmento, (v, checked) => {
        const a = STATE.filters.subsegmento;
        STATE.filters.subsegmento = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-sub-q")?.value);

      renderChecklist($("list-neg"), STATE.options.negocio, STATE.filters.negocio, (v, checked) => {
        const a = STATE.filters.negocio;
        STATE.filters.negocio = checked ? Array.from(new Set([...a, v])) : a.filter(x => x !== v);
        syncFilterUiCounts(); renderSelectedChips();
      }, $("filtro-neg-q")?.value);
    }

    // =========================
    // Fetch + render
    // =========================
    async function copyRowToClipboard(row) {
      const r = row || {};
      const id = safeStr(r.id);
      const local = [safeStr(r.estado).trim(), safeStr(r.cidade).trim()].filter(Boolean).join(" • ") || "-";
      const seg = [safeStr(r.segmento_nome).trim(), safeStr(r.subsegmento_nome).trim()].filter(Boolean).join(" • ") || "-";
      const tipo = safeStr(r.tipo_bloqueio).trim() || "-";
      const negocio = safeStr(r.negocio_nome).trim() || "-";
      const cliente = safeStr(r.cliente_nome).trim() || "-";
      const celebId = safeStr(r.celebridade).trim() || "-";
      const celebNome = (celebId && celebId !== "-" && STATE.celebNameById && STATE.celebNameById.get(celebId)) ? STATE.celebNameById.get(celebId) : "";

      const text = [
        `Data: ${formatDateBR(r.created_at)}`,
        `Tipo: ${tipo}`,
        `Local: ${local}`,
        `Segmento/Sub: ${seg}`,
        `Negócio: ${negocio}`,
        `Cliente: ${cliente}`,
        `Celebridade: ${celebNome ? `${celebNome} (${celebId})` : celebId}`,
        `Bloqueio (id): ${id}`
      ].join("\n");

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        showToast("Linha copiada", "content_copy");
        return true;
      } catch (_) {
        showToast("Não foi possível copiar", "error");
        return false;
      }
    }

    function renderRows(rows) {
      const tbody = $("tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      tbody.classList.remove("dim-others");

      const toneFromText = (text) => {
        const s = safeStr(text).toLowerCase();
        if (s.includes("consult")) return "tone-yellow";
        if (s.includes("cliente")) return "tone-red";
        if (s.includes("celeb")) return "tone-blue";
        // fallback determinístico (hash simples) -> 4 cores Google
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
        const tones = ["tone-blue","tone-red","tone-yellow","tone-green"];
        return tones[Math.abs(h) % tones.length];
      };

      const frag = document.createDocumentFragment();
      (Array.isArray(rows) ? rows : []).forEach(r => {
        const id = safeStr(r.id);
        const tr = document.createElement("div");
        tr.className = "grid tr";
        tr.dataset.rowid = id;
        tr.setAttribute("role", "row");
        tr.tabIndex = 0;

        const local = [safeStr(r.estado).trim(), safeStr(r.cidade).trim()].filter(Boolean).join(" • ") || "-";
        const seg = [safeStr(r.segmento_nome).trim(), safeStr(r.subsegmento_nome).trim()].filter(Boolean).join(" • ") || "-";
        const tipo = safeStr(r.tipo_bloqueio).trim() || "-";
        const negocio = safeStr(r.negocio_nome).trim() || "-";
        const cliente = safeStr(r.cliente_nome).trim() || "-";
        const celebId = safeStr(r.celebridade).trim() || "-";
        const celebNome = (celebId && celebId !== "-" && STATE.celebNameById && STATE.celebNameById.get(celebId)) ? STATE.celebNameById.get(celebId) : "";
        const celebLabel = celebNome ? celebNome : celebId;

        tr.innerHTML = `
          <div class="td" role="cell"><span class="ellipsis">${formatDateBR(r.created_at)}</span></div>
          <div class="td" role="cell"><span class="chip ${toneFromText(tipo)}"><span class="ellipsis">${tipo}</span></span></div>
          <div class="td" role="cell"><span class="ellipsis">${local}</span></div>
          <div class="td" role="cell"><span class="ellipsis">${seg}</span></div>
          <div class="td" role="cell"><span class="ellipsis">${negocio}</span></div>
          <div class="td" role="cell"><span class="ellipsis">${cliente}</span></div>
          <div class="td" role="cell" title="${celebNome ? `${celebNome} • ${celebId}` : celebId}">
            <span class="ellipsis">${safeStr(celebLabel) || "-"}</span>
          </div>
        `;

        tr.addEventListener("click", (e) => {
          e.preventDefault();
          const rowId = tr.dataset.rowid;
          const already = (STATE.selectedRowId && STATE.selectedRowId === rowId);
          clearSelection();
          if (!already) {
            STATE.selectedRowId = rowId;
            tbody.classList.add("dim-others");
            tr.classList.add("is-selected");
          }
        });

        tr.addEventListener("dblclick", async (e) => {
          e.preventDefault();
          await copyRowToClipboard(r);
        });

        tr.addEventListener("keydown", async (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            tr.click();
            return;
          }
          // Ctrl+C / Cmd+C copia (quando a linha está focada)
          const isCopy = (e.key && e.key.toLowerCase() === "c") && (e.ctrlKey || e.metaKey);
          if (isCopy) {
            e.preventDefault();
            await copyRowToClipboard(r);
          }
        });

        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    async function fetchAndRender() {
      if (STATE.loading) return;
      STATE.loading = true;
      clearSelection();
      updatePager();
      setKpi(STATE.total ? `${STATE.total} bloqueios` : "—", "Carregando…");
      setState("loading");

      try {
        const { rows, total } = await restFetchBloqueiosPage({ offset: STATE.offset, limit: STATE.pageSize, withCount: true });
        await hydrateCelebrityNamesFromRows(rows);
        STATE.total = (typeof total === "number") ? total : (Array.isArray(rows) ? rows.length : 0);
        updatePager();
        setKpi(`${STATE.total} bloqueios`, "Pronto");
        setDateLabel();

        if (!rows || rows.length === 0) {
          const tbody = $("tbody");
          if (tbody) tbody.innerHTML = "";
          setState("empty");
          return;
        }
        setState("ready");
        renderRows(rows);
      } catch (err) {
        const msg = safeStr(err && (err.message || err.toString())) || "Erro desconhecido";
        const el = $("state-error-msg");
        if (el) el.textContent = msg;
        setKpi("—", "Erro");
        setState("error");
      } finally {
        STATE.loading = false;
        updatePager();
      }
    }

    // =========================
    // Export CSV (resultado filtrado)
    // =========================
    async function exportCsv() {
      if (STATE.exporting || STATE.loading) return;
      const btn = $("btn-export");
      const prevBtnLabel = btn ? btn.textContent : "";
      STATE.exporting = true;
      if (btn) { btn.disabled = true; btn.textContent = "Exportando…"; }
      setKpi(`${STATE.total || "—"} bloqueios`, "Exportando…");
      showToast("Exportando CSV…", "download");

      try {
        const batchSize = 1000;
        let offset = 0;
        const all = [];
        const celebTerm = safeStr(STATE.filters.celebridade).trim();
        const celebResolved = celebTerm ? await resolveCelebrityFilterIds(celebTerm) : null;

        while (true) {
          const { rows } = await restFetchBloqueiosPage({ offset, limit: batchSize, withCount: false, celebResolved });
          all.push(...rows);
          if (rows.length < batchSize) break;
          offset += batchSize;
        }

        // Excel PT-BR costuma abrir melhor com separador ';'
        const delimiter = ";";
        const header = ["id","created_at","tipo_bloqueio","estado","cidade","segmento_nome","subsegmento_nome","negocio_nome","cliente_nome","celebridade"];
        const lines = [header.join(delimiter)];
        all.forEach(r => {
          const line = [
            csvEscape(r.id, delimiter),
            csvEscape(r.created_at, delimiter),
            csvEscape(r.tipo_bloqueio, delimiter),
            csvEscape(r.estado, delimiter),
            csvEscape(r.cidade, delimiter),
            csvEscape(r.segmento_nome, delimiter),
            csvEscape(r.subsegmento_nome, delimiter),
            csvEscape(r.negocio_nome, delimiter),
            csvEscape(r.cliente_nome, delimiter),
            csvEscape(r.celebridade, delimiter)
          ].join(delimiter);
          lines.push(line);
        });
        const filename = `bloqueios_${new Date().toISOString().slice(0,10)}.csv`;
        downloadText(filename, lines.join("\n"));
        showToast(`CSV gerado (${all.length})`, "check_circle");
      } catch (err) {
        showToast("Falha ao exportar", "error");
      } finally {
        STATE.exporting = false;
        if (btn) { btn.disabled = false; btn.textContent = prevBtnLabel || "Exportar CSV"; }
        setKpi(`${STATE.total || "—"} bloqueios`, "Pronto");
      }
    }

    // =========================
    // Eventos (UI)
    // =========================
    function openFilters() {
      const modal = $("filters-modal");
      if (!modal) return;
      modal.classList.add("active");
      modal.setAttribute("aria-hidden", "false");
    }
    function closeFilters() {
      const modal = $("filters-modal");
      if (!modal) return;
      modal.classList.remove("active");
      modal.setAttribute("aria-hidden", "true");
    }
    function toggleDatePopover(force) {
      const pop = $("date-popover");
      if (!pop) return;
      const shouldOpen = (typeof force === "boolean") ? force : !pop.classList.contains("active");
      pop.classList.toggle("active", shouldOpen);
    }

    function wireUi() {
      // busca
      const search = $("blk-search");
      if (search) {
        search.addEventListener("input", debounce(() => {
          STATE.filters.q = search.value || "";
          STATE.offset = 0;
          fetchAndRender();
        }, 450));
      }

      // paginação
      $("btn-prev")?.addEventListener("click", () => {
        STATE.offset = Math.max(0, (STATE.offset || 0) - STATE.pageSize);
        fetchAndRender();
      });
      $("btn-next")?.addEventListener("click", () => {
        STATE.offset = (STATE.offset || 0) + STATE.pageSize;
        fetchAndRender();
      });

      // sort (apenas data por enquanto)
      $$(".th.sortable").forEach(th => {
        th.addEventListener("click", () => {
          const col = th.dataset.sort || "created_at";
          if (STATE.sort.col === col) {
            STATE.sort.dir = (STATE.sort.dir === "asc") ? "desc" : "asc";
          } else {
            STATE.sort.col = col;
            STATE.sort.dir = "desc";
          }
          STATE.offset = 0;
          fetchAndRender();
        });
      });

      // click fora: limpa destaque
      document.addEventListener("click", (e) => {
        const tbody = $("tbody");
        if (!tbody) return;
        const pop = $("date-popover");
        const btnDate = $("btn-date");
        const btnFilters = $("btn-filters");
        const modal = $("filters-modal");

        if (pop && pop.classList.contains("active")) {
          if (btnDate && btnDate.contains(e.target)) return;
          if (pop.contains(e.target)) return;
          toggleDatePopover(false);
        }

        if (modal && modal.classList.contains("active")) return; // modal controla backdrop
        if (tbody.contains(e.target)) return;
        clearSelection();

        // evitar fechar filtros ao clicar no botão
        if (btnFilters && btnFilters.contains(e.target)) return;
      });

      // date popover
      $("btn-date")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDatePopover();
      });
      $("btn-close-date")?.addEventListener("click", () => toggleDatePopover(false));
      $("btn-clear-date")?.addEventListener("click", () => {
        STATE.filters.dateStart = null;
        STATE.filters.dateEnd = null;
        const a = $("date-start"); const b = $("date-end");
        if (a) a.value = "";
        if (b) b.value = "";
        setDateLabel();
        STATE.offset = 0;
        fetchAndRender();
      });
      $("btn-apply-date")?.addEventListener("click", () => {
        const a = $("date-start")?.value || "";
        const b = $("date-end")?.value || "";
        STATE.filters.dateStart = a ? new Date(a + "T00:00:00") : null;
        STATE.filters.dateEnd = b ? new Date(b + "T00:00:00") : null;
        setDateLabel();
        toggleDatePopover(false);
        STATE.offset = 0;
        fetchAndRender();
      });
      $$(".preset").forEach(p => {
        p.addEventListener("click", () => {
          const type = p.dataset.preset;
          const now = new Date();
          const start = new Date(now);
          const end = new Date(now);
          if (type === "all") {
            STATE.filters.dateStart = null;
            STATE.filters.dateEnd = null;
          } else if (type === "today") {
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            STATE.filters.dateStart = start;
            STATE.filters.dateEnd = end;
          } else if (type === "7d") {
            start.setDate(start.getDate() - 6);
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            STATE.filters.dateStart = start;
            STATE.filters.dateEnd = end;
          } else if (type === "30d") {
            start.setDate(start.getDate() - 29);
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            STATE.filters.dateStart = start;
            STATE.filters.dateEnd = end;
          }
          const a = $("date-start"); const b = $("date-end");
          if (a) a.value = STATE.filters.dateStart ? STATE.filters.dateStart.toISOString().slice(0,10) : "";
          if (b) b.value = STATE.filters.dateEnd ? STATE.filters.dateEnd.toISOString().slice(0,10) : "";
          setDateLabel();
          toggleDatePopover(false);
          STATE.offset = 0;
          fetchAndRender();
        });
      });

      // modal filtros
      $("btn-filters")?.addEventListener("click", async () => {
        toggleDatePopover(false);
        await loadFilterOptionsIfNeeded();
        syncFilterUiCounts();
        renderFiltersModalLists();
        renderSelectedChips();
        openFilters();
      });
      $("btn-close-filters")?.addEventListener("click", closeFilters);
      $("filters-modal")?.addEventListener("click", (e) => {
        if (e.target === $("filters-modal")) closeFilters();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if ($("filters-modal")?.classList.contains("active")) closeFilters();
        if ($("date-popover")?.classList.contains("active")) toggleDatePopover(false);
      });

      // filtrar listas no modal
      ["filtro-tipo-q","filtro-estado-q","filtro-cidade-q","filtro-seg-q","filtro-sub-q","filtro-neg-q"].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("input", debounce(renderFiltersModalLists, 160));
      });

      // inputs texto
      $("filtro-cliente")?.addEventListener("input", debounce((e) => {
        STATE.filters.cliente = e.target.value || "";
        renderSelectedChips();
      }, 180));
      $("filtro-celeb")?.addEventListener("input", debounce((e) => {
        STATE.filters.celebridade = e.target.value || "";
        renderSelectedChips();
      }, 180));

      $("btn-clear-filters")?.addEventListener("click", () => {
        STATE.filters.tipo = [];
        STATE.filters.estado = [];
        STATE.filters.cidade = [];
        STATE.filters.segmento = [];
        STATE.filters.subsegmento = [];
        STATE.filters.negocio = [];
        STATE.filters.cliente = "";
        STATE.filters.celebridade = "";
        const ids = ["filtro-cliente","filtro-celeb"];
        ids.forEach(id => { const el = $(id); if (el) el.value = ""; });
        syncFilterUiCounts();
        renderFiltersModalLists();
        renderSelectedChips();
      });
      $("btn-apply-filters")?.addEventListener("click", () => {
        closeFilters();
        STATE.offset = 0;
        fetchAndRender();
      });

      // export
      $("btn-export")?.addEventListener("click", exportCsv);

      // retry
      $("btn-retry")?.addEventListener("click", () => {
        STATE.offset = 0;
        fetchAndRender();
      });
    }

    // =========================
    // Boot
    // =========================
    function startApp(err) {
      if (err) {
        const msgEl = $("state-error-msg");
        if (msgEl) msgEl.textContent = safeStr(err.message || err);
        setKpi("—", "Erro");
        setState("error");
        return;
      }
      try {
        initSupabase();
        wireUi();
        setDateLabel();
        fetchAndRender();
      } catch (e) {
        const msgEl = $("state-error-msg");
        if (msgEl) msgEl.textContent = safeStr(e.message || e);
        setState("error");
      }
    }

    setState("loading");
    setKpi("—", "Conectando…");

    // carrega UMD se necessário e inicia
    ensureSupabaseUmd()
      .then(() => waitForSupabase(startApp))
      .catch((e) => startApp(e));
  }

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};
  window.CDN_WIDGET_REGISTRY[WIDGET_KEY] = { init };
})();

