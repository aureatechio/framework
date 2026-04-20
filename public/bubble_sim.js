/* Bubble Simulator (local) */
;(function () {
  const $ = (id) => document.getElementById(id);
  const folderSel = $("widget-folder");
  const versionSel = $("widget-version");
  const rootIdEl = $("root-id");
  const widgetKeyEl = $("widget-key");
  const paramsEl = $("params-json");
  const btnMount = $("btn-mount");
  const btnClear = $("btn-clear");
  const err = $("err");
  const ok = $("ok");
  const previewInfo = $("preview-info");
  const urlLoaderEl = $("url-loader");
  const urlHtmlEl = $("url-html");
  const urlCssEl = $("url-css");
  const urlJsEl = $("url-js");

  function showErr(message) {
    if (!err) return;
    err.style.display = "block";
    err.textContent = String(message || "Erro desconhecido");
    if (ok) ok.style.display = "none";
  }

  function showOk(message) {
    if (!ok) return;
    ok.style.display = "block";
    ok.textContent = String(message || "OK");
    if (err) err.style.display = "none";
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
    return await res.text();
  }

  async function listDirHrefs(url) {
    // Python http.server retorna uma listagem HTML simples; vamos parsear.
    const html = await fetchText(url);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a"))
      .map((a) => (a.getAttribute("href") || "").trim())
      .filter(Boolean);
    return links;
  }

  async function discoverWidgetFolders() {
    const hrefs = await listDirHrefs("widgets/");
    // pastas vêm como "dashboard_tv/" etc.
    return hrefs
      .filter((h) => h.endsWith("/"))
      .filter((h) => h !== "../")
      .map((h) => h.replace(/\/$/, ""));
  }

  async function discoverWidgetVersions(folder) {
    try {
      const hrefs = await listDirHrefs(`widgets/${encodeURIComponent(folder)}/`);
      const dirs = hrefs
        .filter((h) => h.endsWith("/"))
        .filter((h) => h !== "../")
        .map((h) => h.replace(/\/$/, ""))
        .filter((name) => /^v\d+$/i.test(name));
      return ["(root)", ...dirs];
    } catch (e) {
      return ["(root)"];
    }
  }

  function widgetBasePath(folder, version) {
    if (version && version !== "(root)") return `widgets/${folder}/${version}`;
    return `widgets/${folder}`;
  }

  function parseWidgetKeyFromJs(jsText) {
    // tenta padrão: const WIDGET_KEY = "..."
    const m = jsText.match(/const\s+WIDGET_KEY\s*=\s*["']([^"']+)["']/);
    if (m && m[1]) return m[1];
    return "";
  }

  async function updateAutoWidgetKey() {
    try {
      const folder = folderSel.value;
      const version = versionSel.value;
      const base = widgetBasePath(folder, version);
      const js = await fetchText(`${base}/form.js`);
      const key = parseWidgetKeyFromJs(js);
      if (key) widgetKeyEl.value = key;
    } catch (e) {
      // silencioso; usuário pode preencher manualmente
    }
  }

  function ensureRootContainer(rootId) {
    const previewBody = document.getElementById("preview-body");
    if (!previewBody) return null;
    let el = document.getElementById(rootId);
    if (!el) {
      el = document.createElement("div");
      el.id = rootId;
      previewBody.innerHTML = "";
      previewBody.appendChild(el);
    }
    return el;
  }

  function safeJsonParse(text) {
    const s = String(text || "").trim();
    if (!s) return {};
    return JSON.parse(s);
  }

  async function mountSelected() {
    const folder = String(folderSel.value || "").trim();
    const version = String(versionSel.value || "").trim();
    const rootId = String(rootIdEl.value || "").trim();
    const widgetKey = String(widgetKeyEl.value || "").trim();

    if (!folder) return showErr("Escolha uma pasta de widget.");
    if (!rootId) return showErr("Informe rootId.");
    if (!widgetKey) return showErr("widgetKey vazio. (Preencha ou selecione um widget com WIDGET_KEY no JS)");

    let params = {};
    try {
      params = safeJsonParse(paramsEl.value);
    } catch (e) {
      return showErr(`params JSON inválido: ${e.message || e}`);
    }

    const base = widgetBasePath(folder, version);
    const widget = {
      rootId,
      widgetKey,
      htmlUrl: `${base}/form.html`,
      cssUrl: `${base}/form.css`,
      jsUrl: `${base}/form.js`,
      params,
    };

    // Exibir URLs em uso (inclui loader)
    try {
      const origin = window.location.origin || "";
      if (urlLoaderEl) urlLoaderEl.textContent = `${origin}/public/script.js`;
      if (urlHtmlEl) urlHtmlEl.textContent = `${origin}/public/${widget.htmlUrl}`;
      if (urlCssEl) urlCssEl.textContent = `${origin}/public/${widget.cssUrl}`;
      if (urlJsEl) urlJsEl.textContent = `${origin}/public/${widget.jsUrl}`;
    } catch (e) {}

    const rootEl = ensureRootContainer(rootId);
    if (!rootEl) return showErr("Não consegui criar o container de preview.");

    // Reset para permitir re-mount
    try {
      if (window.CDN_LOADER && typeof window.CDN_LOADER.resetRoot === "function") {
        window.CDN_LOADER.resetRoot(rootId);
      } else {
        rootEl.removeAttribute("data-cdn-mounted");
        rootEl.innerHTML = "";
      }
    } catch (e) {}

    // Monta via loader
    if (!window.CDN_LOADER || typeof window.CDN_LOADER.mountOne !== "function") {
      return showErr("Loader não carregou (window.CDN_LOADER.mountOne indisponível). Confirme que /public/script.js carregou.");
    }

    // Mantém janela compatível com o padrão Bubble (visível para debug)
    window.CDN_WIDGETS = [widget];

    window.CDN_LOADER.mountOne(widget);

    previewInfo.textContent = `${folder}${version && version !== "(root)" ? "/" + version : ""} • widgetKey=${widgetKey} • rootId=${rootId}`;
    showOk(
      "Widget montado.\n\n" +
        "URLs locais:\n" +
        `- html: ${widget.htmlUrl}\n` +
        `- css : ${widget.cssUrl}\n` +
        `- js  : ${widget.jsUrl}\n`
    );
  }

  async function init() {
    try {
      // Loader (fixo nesta página)
      try {
        const origin = window.location.origin || "";
        if (urlLoaderEl) urlLoaderEl.textContent = `${origin}/public/script.js`;
      } catch (e) {}

      folderSel.innerHTML = `<option value="">Carregando...</option>`;
      const folders = await discoverWidgetFolders();
      folders.sort((a, b) => a.localeCompare(b));
      folderSel.innerHTML = `<option value="">Selecione...</option>` + folders.map((f) => `<option value="${f}">${f}</option>`).join("");
      // default: dashboard_tv se existir
      if (folders.includes("dashboard_tv")) folderSel.value = "dashboard_tv";
      const versions = await discoverWidgetVersions(folderSel.value || folders[0] || "");
      versionSel.innerHTML = versions.map((v) => `<option value="${v}">${v}</option>`).join("");
      await updateAutoWidgetKey();
      previewInfo.textContent = "Pronto.";
    } catch (e) {
      showErr(e.message || e);
    }
  }

  folderSel.addEventListener("change", async () => {
    try {
      const folder = folderSel.value;
      const versions = await discoverWidgetVersions(folder);
      versionSel.innerHTML = versions.map((v) => `<option value="${v}">${v}</option>`).join("");
      await updateAutoWidgetKey();
    } catch (e) {
      showErr(e.message || e);
    }
  });

  versionSel.addEventListener("change", async () => {
    try { await updateAutoWidgetKey(); } catch (e) {}
  });

  btnMount.addEventListener("click", () => { void mountSelected(); });
  btnClear.addEventListener("click", () => {
    try {
      const rootId = String(rootIdEl.value || "").trim();
      const el = rootId ? document.getElementById(rootId) : null;
      if (el) {
        el.removeAttribute("data-cdn-mounted");
        el.innerHTML = "";
      }
      previewInfo.textContent = "Limpo.";
      try {
        if (urlHtmlEl) urlHtmlEl.textContent = "—";
        if (urlCssEl) urlCssEl.textContent = "—";
        if (urlJsEl) urlJsEl.textContent = "—";
      } catch (e) {}
      showOk("Preview limpo.");
    } catch (e) {}
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

