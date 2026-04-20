# Meta Integration - Maintenance & Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Manter a documentacao da integracao Meta atualizada e implementar melhorias de seguranca e resiliencia identificadas durante a analise.

**Architecture:** A integracao atual usa chamadas diretas do frontend (client-side) para a Meta Graph API, com merge de dados CRM do Supabase nos hooks React. As melhorias focam em mover o token para server-side, adicionar monitoramento de expiracao e melhorar a resiliencia.

**Tech Stack:** React, TypeScript, TanStack Query v5, Supabase (Edge Functions, Postgres, Realtime), Meta Graph API v20.0

---

## Task 1: Mover Token Meta para Server-Side (Supabase Edge Function)

**Prioridade:** ALTA (seguranca)
**Risco atual:** Token Meta exposto no bundle frontend (`VITE_META_ACCESS_TOKEN`)

**Files:**
- Create: `supabase/functions/meta-insights/index.ts`
- Modify: `src/lib/meta.ts`
- Modify: `.env.example`

**Step 1: Criar Edge Function no Supabase**

```typescript
// supabase/functions/meta-insights/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")
const META_AD_ACCOUNT_ID = Deno.env.get("META_AD_ACCOUNT_ID")

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const { action, campaignIds, since, until } = await req.json()

  // Validate inputs
  if (!action || !since || !until) {
    return new Response(JSON.stringify({ error: "Missing required params" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const accountId = META_AD_ACCOUNT_ID?.replace("act_", "")
  const baseUrl = `https://graph.facebook.com/v20.0/act_${accountId}`

  // Route to appropriate Meta API endpoint based on action
  let url: string
  switch (action) {
    case "campaign-insights":
      url = `${baseUrl}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,actions&time_increment=1&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${META_ACCESS_TOKEN}`
      if (campaignIds?.length) {
        url += `&filtering=[{"field":"campaign.id","operator":"IN","value":${JSON.stringify(campaignIds)}}]`
      }
      break
    case "campaigns":
      url = `${baseUrl}/campaigns?fields=id,name,effective_status&limit=500&access_token=${META_ACCESS_TOKEN}`
      break
    case "spend-and-results":
      url = `${baseUrl}/insights?level=campaign&fields=spend,clicks,actions&time_increment=1&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${META_ACCESS_TOKEN}`
      if (campaignIds?.length) {
        url += `&filtering=[{"field":"campaign.id","operator":"IN","value":${JSON.stringify(campaignIds)}}]`
      }
      break
    default:
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
  }

  const response = await fetch(url)
  const data = await response.json()

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
```

**Step 2: Atualizar meta.ts para usar Edge Function em vez de chamada direta**

Modificar cada funcao em `src/lib/meta.ts` para chamar a Edge Function:

```typescript
// Em vez de:
const url = `https://graph.facebook.com/v20.0/act_${accountId}/insights?...&access_token=${token}`

// Usar:
const { data, error } = await supabase.functions.invoke('meta-insights', {
  body: { action: 'campaign-insights', campaignIds, since, until }
})
```

**Step 3: Mover env vars do frontend para Supabase**

```bash
# .env (frontend) - REMOVER:
# VITE_META_ACCESS_TOKEN=xxx
# VITE_META_AD_ACCOUNT_ID=xxx

# Supabase secrets (server-side) - ADICIONAR:
supabase secrets set META_ACCESS_TOKEN=xxx
supabase secrets set META_AD_ACCOUNT_ID=xxx
```

**Step 4: Testar Edge Function localmente**

```bash
supabase functions serve meta-insights --env-file .env.local
```

**Step 5: Commit**

```bash
git add supabase/functions/meta-insights/ src/lib/meta.ts .env.example
git commit -m "security: move Meta token to server-side Edge Function"
```

---

## Task 2: Implementar Alerta de Expiracao de Token

**Prioridade:** MEDIA
**Risco atual:** Token expira silenciosamente (~60 dias), dashboard mostra R$ 0,00

**Files:**
- Create: `supabase/functions/meta-token-check/index.ts`
- Modify: `src/hooks/useAureaCloudMetrics.ts`

**Step 1: Criar Edge Function para verificar validade do token**

```typescript
// supabase/functions/meta-token-check/index.ts
// Chama /me?access_token=xxx e verifica data_access_expire_time
// Retorna { valid: boolean, expiresAt: string | null, daysRemaining: number | null }
```

**Step 2: Adicionar verificacao no hook principal**

Ao detectar erro 190 (token invalido) ou ao inicializar, verificar a validade do token e exibir warning no UI com dias restantes.

**Step 3: Commit**

```bash
git commit -m "feat: add Meta token expiration monitoring"
```

---

## Task 3: Adicionar Rate Limiting e Retry com Backoff

**Prioridade:** MEDIA
**Risco atual:** Sem tratamento explicito de rate limit da Meta API

**Files:**
- Modify: `src/lib/meta.ts`

**Step 1: Implementar retry com exponential backoff**

```typescript
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url)
    if (response.status === 429 || response.status >= 500) {
      const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }
    return response
  }
  throw new Error("Max retries exceeded")
}
```

**Step 2: Substituir `fetch` por `fetchWithRetry` nas funcoes de API**

**Step 3: Commit**

```bash
git commit -m "feat: add retry with exponential backoff for Meta API calls"
```

---

## Task 4: Manter Documentacao Atualizada

**Prioridade:** CONTINUA

**Files:**
- Modify: `docs/plans/2026-02-25-meta-integration-design.md`

**Quando atualizar:**
- Ao adicionar novas funcoes em `meta.ts`
- Ao criar novos hooks que consomem dados Meta
- Ao alterar a estrategia de cache/invalidacao
- Ao adicionar novas metricas/KPIs
- Ao mudar a versao da Graph API
- Ao modificar a estrutura de tabelas CRM

**Checklist de atualizacao:**
1. Atualizar a secao de Referencia de Arquivos (linhas, proposito)
2. Atualizar diagramas de fluxo se o data flow mudar
3. Adicionar novos KPIs na tabela de calculos
4. Atualizar secao de Troubleshooting com novos problemas encontrados
5. Atualizar Historico de Mudancas no final do documento

---

## Resumo de Prioridades

| # | Task | Prioridade | Esforco | Impacto |
|---|------|-----------|---------|---------|
| 1 | Token server-side | ALTA | ~2h | Seguranca |
| 2 | Alerta expiracao | MEDIA | ~1h | Operacional |
| 3 | Retry + backoff | MEDIA | ~30min | Resiliencia |
| 4 | Manter docs | CONTINUA | ~15min/change | Onboarding |
