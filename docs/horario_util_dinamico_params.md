## Horário útil dinâmico (params) — FRT + Follow-up — Guia para agentes/IA

Este documento explica como o widget **`dashboard_tela`** está aplicando **horário útil dinâmico** (janela diária) via **params no Header do Bubble**, e como isso impacta:
- **Follow-up** (horas úteis)
- **FRT** (minutos úteis), tanto **global** quanto **por vendedor (ranking)**

> Versão do widget com esta lógica: **`dashboard_tela v107`**.

---

### 1) Onde os “params” entram (Bubble → Header)

No seu framework, o Bubble monta widgets via `window.CDN_WIDGETS` no **Page → HTML Header**.

Você passa configurações dentro de:
- `window.CDN_WIDGETS[i].params`

O loader chama:
- `window.CDN_WIDGET_REGISTRY[widgetKey].init(root, params)`

E o widget `dashboard_tela` guarda esses params em:
- `window.__WISH_BOARD_PARAMS__`

**Ponto crítico:** no objeto do widget, mantenha **um único `params`**.
Se você declarar `params` duas vezes, **a última sobrescreve a primeira** (JavaScript), e parte da configuração “some”.

---

### 2) Contrato do parâmetro `businessHours`

Dentro de `params`, use:

```js
params: {
  businessHours: {
    start: "2026-01-15T09:00:00.000Z",
    end:   "2026-01-15T19:00:00.000Z",
    exclude_weekends: true
  }
}
```

#### Campos
- **`start`** *(string ISO UTC)*: horário de início (o widget extrai apenas HH:MM).
- **`end`** *(string ISO UTC)*: horário de fim (o widget extrai apenas HH:MM).
- **`exclude_weekends`** *(boolean, opcional)*:
  - `true` (padrão): conta apenas **seg–sex**
  - `false`: conta **seg–dom** (inclui sábado e domingo)

#### Observações importantes
- A **data** do ISO é irrelevante para a janela diária — o código usa somente `getUTCHours()`/`getUTCMinutes()`.
- A janela deve respeitar: `end > start` no mesmo dia (não suporta “virar o dia”, ex.: 22:00 → 02:00).

---

### 3) Fallback (quando não envia `businessHours`)

Se `params.businessHours` não vier ou vier inválido, o widget volta ao comportamento “antigo”:
- **Seg–sex**
- **09:00–19:00**
- Em modo **SP (UTC-3 fixo)**, para compatibilidade com browsers sem suporte completo a timezone.

---

### 4) Como isso é aplicado no Follow-up

**Onde:** `fetchSLAs()` → bloco “Follow-up”.

**O que muda:** somente o cálculo do delta em “tempo útil”.
- Antes: fixo 09–19 seg–sex (SP).
- Agora: usa `params.businessHours` para definir a janela diária e se inclui fim de semana.

**O filtro do header não muda:**
- O header continua definindo quais leads entram (1ª entrada em FLW1/2/3 dentro do período do header).
- O que muda é como o tempo entre timestamps é contabilizado (minutos úteis).

---

### 5) Como isso é aplicado no FRT (global + por vendedor)

**Onde:** `computeFRTEventsHardcut()`.

**O que muda:** o `diffMinutes` do evento passa a ser calculado como **minutos úteis** (janela diária), ao invés de “minutos corridos”.

Isso impacta automaticamente:
- **FRT global** (cards/SLA), porque `fetchSLAs()` usa `computeFRTEventsHardcut()`
- **FRT por vendedor** (ranking), porque `fetchRankingData()` também agrega os eventos retornados por `computeFRTEventsHardcut()`

**O que NÃO muda:**
- Hardcut do FRT continua existindo (não é substituído).
- Guardrails continuam valendo (ex.: `diffMin > 0`, `< 43200`).
- A atribuição de vendedor continua a mesma (prioridade: vendedor no EXIT, depois no ENTER, depois `leads.vendedorResponsavel`).

---

### 6) Exemplos práticos para testes

#### 6.1 Janela normal (09:00–19:00 UTC), excluindo fim de semana (padrão)

```js
params: {
  businessHours: {
    start: "2026-01-15T09:00:00.000Z",
    end:   "2026-01-15T19:00:00.000Z",
    exclude_weekends: true
  }
}
```

#### 6.2 Janela bem restrita (15 minutos) para “forçar” diferença no resultado

```js
params: {
  businessHours: {
    start: "2026-01-15T14:00:00.000Z",
    end:   "2026-01-15T14:15:00.000Z",
    exclude_weekends: true
  }
}
```

#### 6.3 Contar fim de semana (seg–dom)

```js
params: {
  businessHours: {
    start: "2026-01-15T09:00:00.000Z",
    end:   "2026-01-15T19:00:00.000Z",
    exclude_weekends: false
  }
}
```

---

### 7) Checklist de troubleshooting (rápido)

1) **Confirmar que o `businessHours` está dentro de `params`:**
   - Errado: `businessHours: {...}` fora de `params`
   - Errado: declarar `params` duas vezes (sobrescreve)
   - Certo: `params: { businessHours: {...}, ...outrosParams }`

2) **Validar no console do navegador:**
   - `window.__WISH_BOARD_PARAMS__` deve conter `businessHours`.

3) **Validação do formato:**
   - `start`/`end` precisam ser ISO parseável (ex.: `...Z`)
   - `end` precisa ser maior do que `start` (na hora/minuto)

---

### 8) Arquivos e pontos-chave no código

- Widget: `public/widgets/dashboard_tela/form.js`
  - Parse: `__parseBusinessHoursCfg(...)`
  - Função de minutos úteis: `__businessMinutesBetweenWeekdaysMs(...)`
  - Follow-up: `fetchSLAs()` (bloco follow-up chama `__businessMinutesBetweenWeekdaysMs`)
  - FRT: `computeFRTEventsHardcut()` (usa `__businessMinutesBetweenWeekdaysMs` para `diffMinutes`)

