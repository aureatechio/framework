type MetaInsightsResult = {
  spend: number
  clicks: number
  results: number
}

function sanitizeEnvValue(v: unknown): string {
  let s = String(v ?? "").trim()
  // strip wrapping quotes
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1).trim()
  }
  // strip common accidental trailing semicolons
  if (s.endsWith(";")) s = s.slice(0, -1).trim()
  // strip common mistaken prefix
  if (s.toLowerCase().startsWith("bearer ")) s = s.slice("bearer ".length).trim()
  // remove all whitespace (newlines/spaces) inside token
  s = s.replace(/\s+/g, "")
  return s
}

function normalizeIds(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = String(raw ?? "").trim()
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function sumResultsFromActions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0
  // Meta returns result actions as: [{ action_type: 'complete_registration', value: '123' }, ...]
  let sum = 0
  for (const a of actions) {
    const actionType = (a as any)?.action_type
    const value = (a as any)?.value
    if (actionType === "complete_registration") sum += toNumber(value)
  }
  return sum
}

async function fetchAllPages(url: URL): Promise<any[]> {
  const rows: any[] = []
  let next: string | null = url.toString()

  while (next) {
    const res = await fetch(next)
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      throw new Error(`Meta insights HTTP ${res.status}: ${txt}`)
    }
    const json = (await res.json()) as any
    const data = Array.isArray(json?.data) ? json.data : []
    rows.push(...data)
    next = typeof json?.paging?.next === "string" ? json.paging.next : null
  }

  return rows
}

export async function fetchMetaSpendAndLandingPageViews(opts: {
  sinceYmd: string
  untilYmd: string
  campaignIds?: string[]
}): Promise<MetaInsightsResult> {
  const accessToken = sanitizeEnvValue(import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined)
  let adAccountId = sanitizeEnvValue(import.meta.env.VITE_META_AD_ACCOUNT_ID as string | undefined)

  if (!accessToken || !adAccountId) {
    // DEV guard: allow UI to render without Meta configured.
    return { spend: 0, clicks: 0, results: 0 }
  }

  // Allow passing just the numeric id in env.
  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`

  const ids = normalizeIds(opts.campaignIds ?? [])
  if (!ids.length) return { spend: 0, clicks: 0, results: 0 }

  const version = "v20.0"
  const url = new URL(`https://graph.facebook.com/${version}/${adAccountId}/insights`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("fields", "spend,clicks,actions")
  url.searchParams.set("time_increment", "1")
  // `until` is inclusive in Meta time_range.
  url.searchParams.set("time_range", JSON.stringify({ since: opts.sinceYmd, until: opts.untilYmd }))
  url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]))
  url.searchParams.set("limit", "500")

  const rows = await fetchAllPages(url)

  let spend = 0
  let clicks = 0
  let results = 0
  for (const r of rows) {
    spend += toNumber(r?.spend)
    clicks += toNumber(r?.clicks)
    results += sumResultsFromActions(r?.actions)
  }

  return { spend, clicks, results }
}

// ── Ad-set daily insights ─────────────────────────────────────────────

export type MetaAdSetDailyRow = {
  date: string            // YYYY-MM-DD
  adSetId: string
  adSetName: string
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  landingPageViews: number
  leads: number
}

function sumActionType(actions: unknown, type: string): number {
  if (!Array.isArray(actions)) return 0
  let sum = 0
  for (const a of actions) {
    if ((a as any)?.action_type === type) sum += toNumber((a as any)?.value)
  }
  return sum
}

/**
 * Busca insights da Meta em nível ad set com breakdown diário.
 * Retorna uma linha por (ad set, dia) com spend, impressions, clicks,
 * landing_page_view e lead extraídos de actions.
 */
export async function fetchMetaAdSetInsights(opts: {
  sinceYmd: string
  untilYmd: string
  campaignIds?: string[]
}): Promise<MetaAdSetDailyRow[]> {
  const accessToken = sanitizeEnvValue(import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined)
  let adAccountId = sanitizeEnvValue(import.meta.env.VITE_META_AD_ACCOUNT_ID as string | undefined)

  if (!accessToken || !adAccountId) return []

  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`

  const ids = normalizeIds(opts.campaignIds ?? [])
  if (!ids.length) return []

  const version = "v20.0"
  const url = new URL(`https://graph.facebook.com/${version}/${adAccountId}/insights`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("level", "adset")
  url.searchParams.set("fields", "adset_id,adset_name,campaign_id,spend,impressions,clicks,actions")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set("time_range", JSON.stringify({ since: opts.sinceYmd, until: opts.untilYmd }))
  url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]))
  url.searchParams.set("limit", "500")

  const rows = await fetchAllPages(url)

  return rows.map((r: any) => ({
    date: String(r?.date_start ?? ""),
    adSetId: String(r?.adset_id ?? ""),
    adSetName: String(r?.adset_name ?? ""),
    campaignId: String(r?.campaign_id ?? ""),
    spend: toNumber(r?.spend),
    impressions: toNumber(r?.impressions),
    clicks: toNumber(r?.clicks),
    landingPageViews: sumActionType(r?.actions, "landing_page_view"),
    leads: sumActionType(r?.actions, "lead"),
  }))
}

// ── Campaign daily insights ───────────────────────────────────────────

export type MetaCampaignDailyRow = {
  date: string            // YYYY-MM-DD
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  landingPageViews: number
  leads: number
}

/**
 * Busca insights da Meta em nível campanha com breakdown diário.
 * Retorna uma linha por (campanha, dia) com spend, impressions, clicks,
 * landing_page_view e complete_registration extraídos de actions.
 */
export async function fetchMetaCampaignInsights(opts: {
  sinceYmd: string
  untilYmd: string
  campaignIds?: string[]
}): Promise<MetaCampaignDailyRow[]> {
  const accessToken = sanitizeEnvValue(import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined)
  let adAccountId = sanitizeEnvValue(import.meta.env.VITE_META_AD_ACCOUNT_ID as string | undefined)

  if (!accessToken || !adAccountId) return []

  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`

  const ids = normalizeIds(opts.campaignIds ?? [])
  if (!ids.length) return []

  const version = "v20.0"
  const url = new URL(`https://graph.facebook.com/${version}/${adAccountId}/insights`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,actions")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set("time_range", JSON.stringify({ since: opts.sinceYmd, until: opts.untilYmd }))
  url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]))
  url.searchParams.set("limit", "500")

  const rows = await fetchAllPages(url)

  return rows.map((r: any) => ({
    date: String(r?.date_start ?? ""),
    campaignId: String(r?.campaign_id ?? ""),
    campaignName: String(r?.campaign_name ?? ""),
    spend: toNumber(r?.spend),
    impressions: toNumber(r?.impressions),
    clicks: toNumber(r?.clicks),
    landingPageViews: sumActionType(r?.actions, "landing_page_view"),
    leads: sumActionType(r?.actions, "complete_registration"),
  }))
}

// ── Campaign metadata ─────────────────────────────────────────────────

export type MetaCampaign = {
  id: string
  name: string
  status: string
}

/**
 * Busca todas as campanhas do ad account via Meta Graph API.
 * Permite passar token/accountId para uso em scripts (fora do Vite).
 */
export async function fetchMetaCampaigns(opts?: {
  accessToken?: string
  adAccountId?: string
}): Promise<MetaCampaign[]> {
  const accessToken = opts?.accessToken ?? sanitizeEnvValue(import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined)
  let adAccountId = opts?.adAccountId ?? sanitizeEnvValue(import.meta.env.VITE_META_AD_ACCOUNT_ID as string | undefined)

  if (!accessToken || !adAccountId) {
    return []
  }

  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`

  const version = "v20.0"
  const url = new URL(`https://graph.facebook.com/${version}/${adAccountId}/campaigns`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("fields", "id,name,effective_status")
  url.searchParams.set("limit", "500")

  const rows = await fetchAllPages(url)

  return rows.map((r: any) => ({
    id: String(r?.id ?? ""),
    name: String(r?.name ?? ""),
    status: String(r?.effective_status ?? r?.status ?? "UNKNOWN"),
  }))
}

