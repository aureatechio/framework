;(function () {
  // idempotência: o Bubble pode incluir o mesmo script mais de uma vez
  if (window.__CDN_LOADER_INITED__) {
    console.log("[cdn] loader já inicializado (skip)");
    return;
  }
  window.__CDN_LOADER_INITED__ = true;

  console.log("[cdn] loader iniciado");

  // Registry dos widgets: cada widget JS deve registrar `window.CDN_WIDGET_REGISTRY[widgetKey] = { init(root, params) }`
  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};
  window.__CDN_PARAMS__ = window.__CDN_PARAMS__ || {};

  // estados globais em window para sobreviver a re-includes
  window.__cdnLoadedCss = window.__cdnLoadedCss || {};
  window.__cdnScriptPromises = window.__cdnScriptPromises || {};

function __cdnEnsureCss(cssUrl) {
  if (!cssUrl) return;
  if (window.__cdnLoadedCss[cssUrl]) return;
  window.__cdnLoadedCss[cssUrl] = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl;
  document.head.appendChild(link);
}

function __cdnEnsureScript(jsUrl) {
  if (!jsUrl) return Promise.resolve();
  if (window.__cdnScriptPromises[jsUrl]) return window.__cdnScriptPromises[jsUrl];

  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = jsUrl;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });

  window.__cdnScriptPromises[jsUrl] = p;
  return p;
}

async function __cdnFetchFragment(htmlUrl) {
  const res = await fetch(htmlUrl, { cache: "no-store" });
  const text = await res.text();

  // Se vier um HTML completo, extraímos o <body> e usamos só ele.
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const bodyHtml = doc && doc.body ? (doc.body.innerHTML || "").trim() : "";
  return bodyHtml && bodyHtml.length ? bodyHtml : text;
}

async function __cdnMountWidget(widget) {
  const { rootId, htmlUrl, cssUrl, jsUrl, widgetKey, params } = widget || {};
  if (!rootId) return;

  const root = document.getElementById(rootId);
  if (!root) {
    return false;
  }

  // idempotência: evita montar 2x no mesmo container
  if (root.getAttribute("data-cdn-mounted") === "1") return true;

  if (params) window.__CDN_PARAMS__[rootId] = params;

  try {
    if (cssUrl) __cdnEnsureCss(cssUrl);
    if (htmlUrl) {
      const html = await __cdnFetchFragment(htmlUrl);
      root.innerHTML = html;
    }
    if (jsUrl) await __cdnEnsureScript(jsUrl);

    if (widgetKey) {
      const api = window.CDN_WIDGET_REGISTRY && window.CDN_WIDGET_REGISTRY[widgetKey];
      if (api && typeof api.init === "function") {
        api.init(root, params || {});
      } else {
        console.warn(`[cdn] widget '${widgetKey}' não registrou init().`);
      }
    }

    root.setAttribute("data-cdn-mounted", "1");
    return true;
  } catch (e) {
    console.error("[cdn] falha ao montar widget:", widgetKey || "", e);
    return false;
  }
}

function __cdnWaitAndMount(widgets) {
  const pending = new Map();
  for (const w of widgets) {
    if (w && w.rootId) pending.set(w.rootId, w);
  }

  const tryMountAll = async () => {
    for (const [rootId, w] of Array.from(pending.entries())) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await __cdnMountWidget(w);
      if (ok) pending.delete(rootId);
    }
    return pending.size === 0;
  };

  // tenta imediatamente
  void tryMountAll();

  // Bubble pode inserir elementos depois; observamos o DOM.
  const obs = new MutationObserver(() => {
    void tryMountAll().then((done) => {
      if (done) obs.disconnect();
    });
  });

  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // fallback: tenta por alguns segundos e para
  const start = Date.now();
  const timer = setInterval(() => {
    void tryMountAll().then((done) => {
      const elapsed = Date.now() - start;
      if (done || elapsed > 15000) {
        clearInterval(timer);
        obs.disconnect();
        if (!done && pending.size) {
          console.warn("[cdn] não consegui montar alguns widgets (containers não encontrados):", Array.from(pending.keys()));
        }
      }
    });
  }, 500);
}

async function __cdnBoot() {
  // Modo novo: múltiplos widgets
  if (Array.isArray(window.CDN_WIDGETS) && window.CDN_WIDGETS.length) {
    __cdnWaitAndMount(window.CDN_WIDGETS);
    return;
  }

  // Compatibilidade: modo antigo (um fragmento)
  const htmlUrl = window.CDN_HTML_URL;
  const rootId = window.CDN_ROOT_ID || "cdn-root";
  if (!htmlUrl) return;
  __cdnWaitAndMount([{ rootId, htmlUrl }]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", __cdnBoot);
} else {
  __cdnBoot();
}

})();

