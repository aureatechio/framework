(function () {
  "use strict";

  window.CDN_WIDGET_REGISTRY = window.CDN_WIDGET_REGISTRY || {};

  function init(root, params) {
    const el = root.querySelector('[data-cdn-widget="elemento-novo"]') || root;
    const title = el.querySelector('[data-role="title"]');
    const desc = el.querySelector('[data-role="desc"]');
    const input = el.querySelector('[data-role="input"]');
    const btn = el.querySelector('[data-role="btn"]');

    const p = params || {};
    if (title && p.title != null) title.textContent = String(p.title);
    if (desc && p.desc != null) desc.textContent = String(p.desc);
    if (input && p.prefill != null) input.value = String(p.prefill);

    if (btn) {
      btn.addEventListener("click", () => {
        const value = input ? input.value : "";

        // Integração "Bubble friendly": dispara um evento global que o Bubble pode capturar via JS (se quiser).
        window.dispatchEvent(
          new CustomEvent("cdn:elemento-novo:submit", {
            detail: { rootId: root && root.id ? root.id : null, value, params: p },
          })
        );

        alert(`Elemento novo enviado: ${value || "(vazio)"}`);
      });
    }
  }

  window.CDN_WIDGET_REGISTRY["elemento-novo"] = { init };
})();


