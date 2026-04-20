;(function () {
  // Keep the current loader untouched. This file is a replacement candidate.
  if (window.__CDN_LOADER_INITED__) {
    console.log("[cdn] loader already initialized (skip)");
    return;
  }
  window.__CDN_LOADER_INITED__ = true;

  console.log("[cdn] loader v2 started");

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};
  window.__CDN_PARAMS__ = window.__CDN_PARAMS__ || {};

  window.__cdnLoadedCss = window.__cdnLoadedCss || {};
  window.__cdnScriptPromises = window.__cdnScriptPromises || {};
  window.__cdnKnownWidgets = window.__cdnKnownWidgets || Object.create(null);
  window.__cdnMountCheckQueued = window.__cdnMountCheckQueued || false;
  window.__cdnDomObserver = window.__cdnDomObserver || null;
  window.__cdnRouteHooksInstalled = window.__cdnRouteHooksInstalled || false;

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

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = jsUrl;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (error) => reject(error);
      document.head.appendChild(script);
    });

    window.__cdnScriptPromises[jsUrl] = promise;
    return promise;
  }

  async function __cdnFetchFragment(htmlUrl) {
    const res = await fetch(htmlUrl, { cache: "no-store" });
    const text = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const bodyHtml = doc && doc.body ? (doc.body.innerHTML || "").trim() : "";
    return bodyHtml && bodyHtml.length ? bodyHtml : text;
  }

  async function __cdnMountWidget(widget) {
    const { rootId, htmlUrl, cssUrl, jsUrl, widgetKey, params } = widget || {};
    if (!rootId) return false;

    const root = document.getElementById(rootId);
    if (!root) return false;

    const isMounted = root.getAttribute("data-cdn-mounted") === "1" && root.childNodes.length > 0;
    if (isMounted) return true;

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
          console.warn(`[cdn] widget '${widgetKey}' did not register init().`);
        }
      }

      root.setAttribute("data-cdn-mounted", "1");
      return true;
    } catch (error) {
      console.error("[cdn] failed to mount widget:", widgetKey || "", error);
      return false;
    }
  }

  function __cdnRegisterWidgets(widgets) {
    const arr = Array.isArray(widgets) ? widgets : (widgets ? [widgets] : []);
    let hasWidgets = false;

    for (const widget of arr) {
      if (!widget || !widget.rootId) continue;
      window.__cdnKnownWidgets[widget.rootId] = widget;
      hasWidgets = true;
    }

    return hasWidgets;
  }

  async function __cdnTryMountKnownWidgets() {
    const knownWidgets = window.__cdnKnownWidgets || {};
    for (const rootId of Object.keys(knownWidgets)) {
      // eslint-disable-next-line no-await-in-loop
      await __cdnMountWidget(knownWidgets[rootId]);
    }
  }

  function __cdnQueueMountCheck() {
    if (window.__cdnMountCheckQueued) return;
    window.__cdnMountCheckQueued = true;

    setTimeout(() => {
      window.__cdnMountCheckQueued = false;
      void __cdnTryMountKnownWidgets();
    }, 0);
  }

  function __cdnInstallWatchers() {
    if (!window.__cdnDomObserver && typeof MutationObserver !== "undefined") {
      const target = document.body || document.documentElement;
      if (target) {
        const observer = new MutationObserver(() => {
          __cdnQueueMountCheck();
        });
        observer.observe(target, { childList: true, subtree: true });
        window.__cdnDomObserver = observer;
      }
    }

    if (window.__cdnRouteHooksInstalled) return;
    window.__cdnRouteHooksInstalled = true;

    const recheck = () => {
      __cdnQueueMountCheck();
    };

    window.addEventListener("popstate", recheck);
    window.addEventListener("hashchange", recheck);
    window.addEventListener("pageshow", recheck);

    if (document && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) recheck();
      });
    }

    if (window.history) {
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;

      if (typeof originalPushState === "function") {
        window.history.pushState = function () {
          const result = originalPushState.apply(this, arguments);
          recheck();
          return result;
        };
      }

      if (typeof originalReplaceState === "function") {
        window.history.replaceState = function () {
          const result = originalReplaceState.apply(this, arguments);
          recheck();
          return result;
        };
      }
    }
  }

  function __cdnWaitAndMount(widgets) {
    if (!__cdnRegisterWidgets(widgets)) return;
    __cdnInstallWatchers();
    __cdnQueueMountCheck();
  }

  window.CDN_LOADER = window.CDN_LOADER || {};
  window.CDN_LOADER.version = "v2-route-recheck";
  window.CDN_LOADER.mount = (widgets) => {
    const arr = Array.isArray(widgets) ? widgets : (widgets ? [widgets] : []);
    if (!arr.length) return;
    __cdnWaitAndMount(arr);
  };
  window.CDN_LOADER.mountOne = (widget) => {
    if (!widget) return;
    __cdnWaitAndMount([widget]);
  };
  window.CDN_LOADER.resetRoot = (rootId) => {
    try {
      const el = rootId ? document.getElementById(rootId) : null;
      if (!el) return false;
      delete window.__cdnKnownWidgets[rootId];
      el.removeAttribute("data-cdn-mounted");
      el.innerHTML = "";
      return true;
    } catch (error) {
      return false;
    }
  };

  async function __cdnBoot() {
    if (Array.isArray(window.CDN_WIDGETS) && window.CDN_WIDGETS.length) {
      __cdnWaitAndMount(window.CDN_WIDGETS);
      return;
    }

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
