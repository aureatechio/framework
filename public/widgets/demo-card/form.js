(function () {
  "use strict";

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  function init(root, params) {
    const el = root.querySelector('[data-cdn-widget="demo-card"]') || root;
    const desc = el.querySelector('[data-role="desc"]');
    const btn = el.querySelector('[data-role="btn"]');

    const text = params && params.text ? String(params.text) : "Sem params";
    if (desc) desc.textContent = text;

    if (btn) {
      btn.addEventListener("click", () => {
        alert("Demo Card: " + text);
      });
    }
  }

  window.CDN_WIDGET_REGISTRY["demo-card"] = { init };
})();











