(function () {
  "use strict";

  const W = window;
  W.CDN_WIDGET_REGISTRY = W.CDN_WIDGET_REGISTRY || {};

  // Loader guarda params por rootId aqui
  W.__CDN_PARAMS__ = W.__CDN_PARAMS__ || {};

  function deepMerge(target, src) {
    if (!src || typeof src !== "object") return target;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        target[k] = deepMerge(target[k] && typeof target[k] === "object" ? target[k] : {}, v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  function safeStr(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return s.trim();
  }

  function isBubbleToken(v) {
    const s = safeStr(v);
    return !!s && /\{\{[^}]+\}\}/.test(s);
  }

  function parseBool(v) {
    if (typeof v === "boolean") return v;
    const s = safeStr(v).toLowerCase();
    if (!s || isBubbleToken(s)) return false;
    if (["true", "1", "sim", "yes", "y"].includes(s)) return true;
    if (["false", "0", "nao", "não", "no", "n"].includes(s)) return false;
    return false;
  }

  function onlyDigits(v) {
    return safeStr(v).replace(/\D/g, "");
  }

  function isValidEmail(v) {
    const s = safeStr(v);
    if (!s) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function callBubble(name, args) {
    try {
      if (!name) return;
      const fn = W[name];
      if (typeof fn === "function") fn.apply(null, args || []);
    } catch (_e) {}
  }

  function closePopup(leadIdOrEmpty) {
    const closeCandidates = [
      "bubble_fn_closeAddLeadPopup",
      "bubble_fn_close_add_lead_popup",
      "bubble_fn_closePopup",
      "bubble_fn_close_popup",
    ];
    for (let i = 0; i < closeCandidates.length; i++) {
      const fnName = closeCandidates[i];
      if (typeof W[fnName] === "function") {
        try {
          W[fnName](leadIdOrEmpty || "");
        } catch (_e) {}
        return true;
      }
    }
    return false;
  }

  // Para suportar múltiplas instâncias na mesma página, tornamos IDs únicos
  // e mantemos o "origId" pra consultas dentro do root.
  function uniquifyIds(root) {
    const prefix =
      (root && root.id ? root.id : "cdnroot") + "__" + Math.random().toString(36).slice(2, 8) + "__";
    const nodes = root.querySelectorAll("[id]");
    nodes.forEach((el) => {
      const old = el.getAttribute("id");
      if (!old) return;
      el.setAttribute("data-cdn-orig-id", old);
      el.setAttribute("id", prefix + old);
    });
    const labels = root.querySelectorAll("label[for]");
    labels.forEach((lab) => {
      const oldFor = lab.getAttribute("for");
      if (!oldFor) return;
      // aponta para o primeiro elemento com orig-id correspondente dentro do root
      const target = root.querySelector(`[data-cdn-orig-id=\"${oldFor}\"]`);
      if (target && target.id) lab.setAttribute("for", target.id);
    });
  }

  function byOrigId(root, origId) {
    return root.querySelector(`[data-cdn-orig-id=\"${origId}\"]`);
  }

  function init(rootEl, params) {
    if (!rootEl) return;

    // O HTML que injetamos tem um wrapper data-cdn-widget; usamos ele como root real do widget
    const widgetRoot = rootEl.querySelector('[data-cdn-widget="popup-criar-lead"]') || rootEl;

    // Garante que IDs dentro do widget não conflitam com outros widgets na mesma página
    uniquifyIds(widgetRoot);

    // Defaults (mantém os valores fixos do teste.html, mas permite override via params do Bubble)
    const DEFAULT_DATA = {
      supabaseUrl: "https://awqtzoefutnfmnbomujt.supabase.co",
      supabaseAnonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXR6b2VmdXRuZm1uYm9tdWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMTYyMTUsImV4cCI6MjA1NDc5MjIxNX0.JMdboXzu7NMTXH8NuKdxzNO3SYOOag4kuQL_SSO0PEY",
      vendedorResponsavelId: "",
      ambienteTeste: false,
      funilId: "d2bc9ef3-4db7-41aa-abf1-0b6cc69cf60a",
      etapaNovoLeadId: "a6709949-9857-4b25-965d-b4bf8270426b",
      prefill: { nome: "", telefone: "", email: "", empresa: "" },
      bubbleCallbacks: {
        onCreated: "bubble_fn_leadCreated",
        onError: "bubble_fn_leadCreateError",
      },
    };

    const BUBBLE_DATA = deepMerge(structuredClone ? structuredClone(DEFAULT_DATA) : JSON.parse(JSON.stringify(DEFAULT_DATA)), params || {});

    const root = widgetRoot;
    const $ = (sel) => {
      if (sel && sel.startsWith("#")) return byOrigId(root, sel.slice(1));
      return root.querySelector(sel);
    };

    function setStatus(kind, msg) {
      const el = $("#status");
      const msgEl = el ? el.querySelector(".msg") : null;
      if (!el || !msgEl) return;
      el.className = "status" + (kind ? " " + kind : "");
      msgEl.textContent = msg || "";
      el.hidden = !msg;
    }

    function applyPrefill() {
      if (BUBBLE_DATA && BUBBLE_DATA.prefill) {
        const inNome = $("#in-nome");
        const inTel = $("#in-telefone");
        const inEmail = $("#in-email");
        const inEmpresa = $("#in-empresa");

        if (inNome && safeStr(BUBBLE_DATA.prefill.nome) && !isBubbleToken(BUBBLE_DATA.prefill.nome))
          inNome.value = safeStr(BUBBLE_DATA.prefill.nome);
        if (
          inTel &&
          safeStr(BUBBLE_DATA.prefill.telefone) &&
          !isBubbleToken(BUBBLE_DATA.prefill.telefone)
        )
          inTel.value = safeStr(BUBBLE_DATA.prefill.telefone);
        if (inEmail && safeStr(BUBBLE_DATA.prefill.email) && !isBubbleToken(BUBBLE_DATA.prefill.email))
          inEmail.value = safeStr(BUBBLE_DATA.prefill.email);
        if (
          inEmpresa &&
          safeStr(BUBBLE_DATA.prefill.empresa) &&
          !isBubbleToken(BUBBLE_DATA.prefill.empresa)
        )
          inEmpresa.value = safeStr(BUBBLE_DATA.prefill.empresa);
      }
    }

    function paintConfig() {
      const pill = $("#pill");
      if (pill) pill.textContent = "etapa: Novo Lead";
    }

    function validate() {
      const inNome = $("#in-nome");
      const inTel = $("#in-telefone");
      const inEmail = $("#in-email");
      const nome = safeStr(inNome && inNome.value);
      const tel = onlyDigits(inTel && inTel.value);
      const emailOk = isValidEmail(inEmail && inEmail.value);
      const hasVend = safeStr(BUBBLE_DATA.vendedorResponsavelId);

      if (!hasVend) return { ok: false, msg: "Config incompleta: VENDEDOR_RESPONSAVEL_ID." };
      if (!nome) return { ok: false, msg: "Informe o nome." };
      if (!tel) return { ok: false, msg: "Informe o telefone (só números)." };
      if (!emailOk) return { ok: false, msg: "E-mail inválido." };

      return { ok: true, nome, tel };
    }

    function setBusy(isBusy) {
      const btnCriar = $("#btn-criar");
      const btnLimpar = $("#btn-limpar");
      if (btnCriar) {
        btnCriar.disabled = !!isBusy;
        btnCriar.textContent = isBusy ? "Criando..." : "Criar lead";
      }
      if (btnLimpar) btnLimpar.disabled = !!isBusy;
    }

    function buildFunctionUrl() {
      const base = safeStr(BUBBLE_DATA.supabaseUrl).replace(/\/+$/, "");
      return base + "/functions/v1/create-lead-popup";
    }

    function mapApiError(errCode, detail) {
      const d = safeStr(detail);
      const dc = d.toLowerCase();
      if (/invalid input syntax for type uuid/i.test(d)) {
        return "Configuração inválida. Atualize o popup e confirme vendedor/funil/etapa.";
      }
      if (dc.includes("permission denied") || dc.includes("row level security") || dc.includes("rls")) {
        return "Sem permissão para criar lead. Verifique as permissões/RLS do projeto.";
      }
      if (dc.includes("jwt") && (dc.includes("expired") || dc.includes("invalid") || dc.includes("malformed"))) {
        return "Chave Supabase inválida/expirada. Atualize a anon key no popup.";
      }
      if (dc.includes("duplicate key") || dc.includes("unique constraint")) {
        return "Já existe um lead com esses dados (duplicado).";
      }
      if (dc.includes("violates foreign key") || dc.includes("foreign key constraint")) {
        return "Referência inválida (vendedor/funil/etapa). Confirme os UUIDs.";
      }
      if (dc.includes("null value in column") || dc.includes("violates not-null constraint")) {
        return "Faltou um campo obrigatório. Confira nome e telefone.";
      }
      if (dc.includes("timeout") || dc.includes("timed out")) {
        return "A requisição demorou demais. Tente novamente.";
      }
      if (dc.includes("failed to fetch") || dc.includes("networkerror")) {
        return "Sem conexão no momento. Verifique a internet e tente novamente.";
      }

      switch (errCode) {
        case "invalid_vendedorResponsavelId":
          return "Vendedor responsável inválido. (UUID)";
        case "invalid_funilId":
          return "Funil inválido. (UUID)";
        case "invalid_etapaNovoLeadId":
          return "Etapa inválida. (UUID)";
        case "missing_nome":
          return "Informe o nome.";
        case "missing_telefone":
          return "Informe o telefone (só números).";
        case "insert_failed":
          return "Não foi possível criar o lead. Tente novamente.";
        case "etapa_lookup_failed":
          return "Não consegui localizar a etapa “Novo Lead”.";
        case "etapa_not_found":
          return "Etapa não encontrada para este funil.";
        case "missing_env":
          return "Função do servidor não configurada (env).";
        case "invalid_json":
          return "Erro interno ao montar requisição.";
        default:
          return d || "Erro ao criar lead.";
      }
    }

    async function createLead() {
      setStatus("", "");

      const inNome = $("#in-nome");
      const inTel = $("#in-telefone");
      const inEmail = $("#in-email");
      const inEmpresa = $("#in-empresa");
      const inCanal = $("#in-canal");
      const inAnot = $("#in-anotacoes");

      callBubble("bubble_fn_createLead_click", [
        JSON.stringify({
          nome: safeStr(inNome && inNome.value),
          telefone: onlyDigits(inTel && inTel.value),
          email: safeStr(inEmail && inEmail.value) || null,
          empresa: safeStr(inEmpresa && inEmpresa.value) || null,
          canal_contato: safeStr(inCanal && inCanal.value) || null,
          ambienteTeste: parseBool(BUBBLE_DATA.ambienteTeste),
        }),
      ]);

      const v = validate();
      if (!v.ok) {
        setStatus("err", v.msg);
        return;
      }

      setBusy(true);

      try {
        const url = buildFunctionUrl();
        const reqBody = {
          vendedorResponsavelId: safeStr(BUBBLE_DATA.vendedorResponsavelId),
          funilId: safeStr(BUBBLE_DATA.funilId) || null,
          etapaNovoLeadId: safeStr(BUBBLE_DATA.etapaNovoLeadId) || null,
          nome: safeStr(inNome && inNome.value),
          telefone: onlyDigits(inTel && inTel.value),
          email: safeStr(inEmail && inEmail.value) || null,
          empresa: safeStr(inEmpresa && inEmpresa.value) || null,
          canal_contato: safeStr(inCanal && inCanal.value) || null,
          anotacoes: safeStr(inAnot && inAnot.value) || null,
        };

        if (parseBool(BUBBLE_DATA.ambienteTeste)) reqBody.teste = true;

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + safeStr(BUBBLE_DATA.supabaseAnonKey),
            apikey: safeStr(BUBBLE_DATA.supabaseAnonKey),
          },
          body: JSON.stringify(reqBody),
        });

        const rawText = await resp.text().catch(() => "");
        let json = {};
        try {
          json = rawText ? JSON.parse(rawText) : {};
        } catch (_e) {
          json = {};
        }

        if (!resp.ok || !json || json.ok !== true) {
          console.error("[popup-criar-lead] create-lead-popup falhou", {
            status: resp.status,
            url,
            reqBody,
            responseText: rawText,
            responseJson: json,
          });
          const errMsg = mapApiError(json && json.error, json && (json.detail || json.message)) || `HTTP ${resp.status}`;
          throw new Error(errMsg);
        }

        setStatus("ok", "Lead criado com sucesso.");
        const createdLeadId = json && json.lead && json.lead.lead_id;
        callBubble(BUBBLE_DATA.bubbleCallbacks && BUBBLE_DATA.bubbleCallbacks.onCreated, [createdLeadId]);

        clearForm();
        closePopup(createdLeadId);
      } catch (e) {
        const msg = e && e.message ? e.message : "Erro ao criar lead.";
        setStatus("err", msg);
        callBubble(BUBBLE_DATA.bubbleCallbacks && BUBBLE_DATA.bubbleCallbacks.onError, [msg]);
      } finally {
        setBusy(false);
      }
    }

    function clearForm() {
      setStatus("", "");
      const inNome = $("#in-nome");
      const inTel = $("#in-telefone");
      const inEmail = $("#in-email");
      const inEmpresa = $("#in-empresa");
      const inCanal = $("#in-canal");
      const inAnot = $("#in-anotacoes");
      if (inNome) inNome.value = "";
      if (inTel) inTel.value = "";
      if (inEmail) inEmail.value = "";
      if (inEmpresa) inEmpresa.value = "";
      if (inCanal) inCanal.value = "";
      if (inAnot) inAnot.value = "";
      if (inNome) inNome.focus();
    }

    // binds
    const btnCriar = $("#btn-criar");
    const btnLimpar = $("#btn-limpar");
    const btnCancelar = $("#btn-cancelar");

    if (btnCriar) btnCriar.addEventListener("click", createLead);
    if (btnLimpar) btnLimpar.addEventListener("click", clearForm);
    if (btnCancelar) {
      btnCancelar.addEventListener("click", function () {
        clearForm();
        closePopup("");
      });
    }

    // enter para criar
    root.addEventListener("keydown", function (e) {
      if (
        e.key === "Enter" &&
        (e.target === $("#in-nome") || e.target === $("#in-telefone") || e.target === $("#in-email") || e.target === $("#in-empresa"))
      ) {
        e.preventDefault();
        createLead();
      }
    });

    // init
    applyPrefill();
    paintConfig();
  }

  W.CDN_WIDGET_REGISTRY["popup-criar-lead"] = { init };
})();


