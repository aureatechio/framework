(function () {
  "use strict";

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  function init(root, params) {
    const el = root.querySelector('[data-cdn-widget="demo-banner"]') || root;
    const msg = el.querySelector('[data-role="msg"]');
    const select = el.querySelector('[data-role="select"]');
    const text = params && params.message ? String(params.message) : "Sem message";
    if (msg) msg.textContent = text;

    if (select) {
      // Permite default vindo do Bubble (arthur|cris|mauro)
      const def = params && params.default ? String(params.default).toLowerCase() : "";
      if (def) select.value = def;

      select.addEventListener("change", () => {
        const label = select.options[select.selectedIndex]?.textContent || select.value;
        if (msg) msg.textContent = `Selecionado: ${label}`;
      });
    }
  }

  window.CDN_WIDGET_REGISTRY["demo-banner"] = { init };
})();



