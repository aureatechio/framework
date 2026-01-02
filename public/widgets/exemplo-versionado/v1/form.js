(function () {
  const WIDGET_KEY = "exemplo-versionado";
  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  function init(root, params) {
    const el = root.querySelector(`[data-cdn-widget="${WIDGET_KEY}"]`) || root;
    const btn = el.querySelector(".btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const detail = { widgetKey: WIDGET_KEY, versao: "v1", params: params || {}, ts: Date.now() };
      console.log("[exemplo-versionado@v1] click", detail);
      document.dispatchEvent(new CustomEvent("cdn:exemplo-versionado:click", { detail }));
    });
  }

  window.CDN_WIDGET_REGISTRY[WIDGET_KEY] = { init };
})();









