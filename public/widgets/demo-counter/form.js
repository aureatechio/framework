(function () {
  "use strict";

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  function init(root, params) {
    const el = root.querySelector('[data-cdn-widget="demo-counter"]') || root;
    const valEl = el.querySelector('[data-role="val"]');
    const inc = el.querySelector('[data-role="inc"]');
    const dec = el.querySelector('[data-role="dec"]');

    let value = params && Number.isFinite(params.start) ? params.start : 0;
    const render = () => {
      if (valEl) valEl.textContent = String(value);
    };
    render();

    if (inc) inc.addEventListener("click", () => { value++; render(); });
    if (dec) dec.addEventListener("click", () => { value--; render(); });
  }

  window.CDN_WIDGET_REGISTRY["demo-counter"] = { init };
})();











