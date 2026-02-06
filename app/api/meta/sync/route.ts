/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  FRAGILE CODE - DO NOT MODIFY WITHOUT APPROVAL  ⚠️                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This file contains carefully tuned logic for Meta API rate limiting.     ║
 * ║  Changes here have caused production issues in the past.                  ║
 * ║                                                                           ║
 * ║  CRITICAL SECTIONS:                                                       ║
 * ║  - Lines 413-542: Meta Batch API (combines 3 calls into 1 HTTP request)  ║
 * ║  - Lines 358-401: Insights pagination (1s delay between pages)           ║
 * ║  - Delay constants: 3s before batch, 1.5s between entity pages           ║
 * ║                                                                           ║
 * ║  Before modifying:                                                        ║
 * ║  1. Read the "FRAGILE CODE" section in CLAUDE.md                         ║
 * ║  2. Get explicit user approval                                           ║
 * ║  3. Test with a large account (100+ ads)                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Initial sync lookback window (days). Controls how far back the first sync fetches.
// "maximum" was too slow — 120 days covers ~4 months of history which is enough for
// Creative Studio fatigue analysis and dashboard date ranges up to "Last 90 Days".
// TODO: Make configurable in global settings
const INITIAL_SYNC_LOOKBACK_DAYS = 120

// Result type for fetch operations - tracks success/failure
type FetchResult<T> = {
  data: T[]
  success: boolean
  error?: string
}

// Meta rate limit error codes:
// - HTTP 429: Too Many Requests
// - Error code 4: API Too Many Calls
// - Error code 17: User request limit reached
// - Error code 32: Page request limit reached
function isRateLimitError(status: number, errorCode?: number): boolean {
  return status === 429 || errorCode === 4 || errorCode === 17 || errorCode === 32
}

// Helper function to fetch all pages from Meta API with timeout, retry, and rate limit handling
async function fetchAllPages<T>(initialUrl: string, maxPages = 25, retries = 2): Promise<FetchResult<T>> {
  const allData: T[] = []
  let nextUrl: string | null = initialUrl
  let pageCount = 0
  const timeoutMs = 20000 // 20 second timeout per request
  let lastError: string | undefined
  const maxRateLimitRetries = 3 // More retries for rate limits since we wait longer

  while (nextUrl && pageCount < maxPages) {
    let success = false
    let attempts = 0
    let rateLimitAttempts = 0
    const currentUrl = nextUrl // Capture current URL for this iteration

    while (!success && (attempts <= retries || rateLimitAttempts < maxRateLimitRetries)) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        const res: Response = await fetch(currentUrl, { signal: controller.signal })
        clearTimeout(timeoutId)

        const result: { data?: T[], error?: { message?: string; code?: number }, paging?: { next?: string } } = await res.json()

        // Check for rate limiting first
        if (isRateLimitError(res.status, result.error?.code)) {
          rateLimitAttempts++
          // Parse Retry-After header (seconds) or use exponential backoff
          const retryAfterHeader = res.headers.get('Retry-After')
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : (30 * rateLimitAttempts) // 30s, 60s, 90s
          console.log(`[Sync] Rate limited (code: ${result.error?.code || res.status}) - waiting ${retryAfterSeconds}s before retry (attempt ${rateLimitAttempts}/${maxRateLimitRetries})`)

          if (rateLimitAttempts < maxRateLimitRetries) {
            await new Promise(r => setTimeout(r, retryAfterSeconds * 1000))
            continue
          } else {
            lastError = `Rate limit exceeded after ${maxRateLimitRetries} retries`
            console.error(lastError)
            return { data: allData, success: false, error: lastError }
          }
        }

        if (result.error) {
          lastError = result.error.message || 'Meta API error'
          console.error('Meta API pagination error:', result.error)
          attempts++
          if (attempts <= retries) {
            console.log(`Retrying... (attempt ${attempts + 1})`)
            await new Promise(r => setTimeout(r, 1000)) // Wait 1s before retry
          }
          continue
        }

        if (result.data && Array.isArray(result.data)) {
          allData.push(...result.data)
        }

        nextUrl = result.paging?.next || null
        pageCount++
        success = true

        // Delay between pages to avoid rate limits
        if (nextUrl) {
          await new Promise(r => setTimeout(r, 1000)) // 1s between pages
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = `Request timed out after ${timeoutMs}ms`
          console.error(lastError)
        } else {
          lastError = err instanceof Error ? err.message : 'Unknown fetch error'
          console.error('Fetch error:', err)
        }
        attempts++
        if (attempts <= retries) {
          console.log(`Retrying... (attempt ${attempts + 1})`)
          await new Promise(r => setTimeout(r, 1000)) // Wait 1s before retry
        }
      }
    }

    // If we exhausted retries on this page, stop pagination
    if (!success) {
      console.error(`Failed to fetch page after ${retries + 1} attempts`)
      return { data: allData, success: false, error: lastError }
    }
  }

  return { data: allData, success: true }
}

type MetaInsight = {
  campaign_name: string
  campaign_id: string
  adset_name: string
  adset_id: string
  ad_name: string
  ad_id: string
  impressions: string
  clicks: string
  spend: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  date_start: string
  date_stop: string
  // Video metrics (returned as action arrays except where noted)
  video_thruplay_watched_actions?: { action_type: string; value: string }[]
  video_p25_watched_actions?: { action_type: string; value: string }[]
  video_p50_watched_actions?: { action_type: string; value: string }[]
  video_p75_watched_actions?: { action_type: string; value: string }[]
  video_p95_watched_actions?: { action_type: string; value: string }[]
  video_p100_watched_actions?: { action_type: string; value: string }[]
  video_avg_time_watched_actions?: { action_type: string; value: string }[]
  video_play_actions?: { action_type: string; value: string }[]
  cost_per_thruplay?: { action_type: string; value: string }[]
  outbound_clicks?: { action_type: string; value: string }[]
  inline_link_click_ctr?: string  // scalar string
  cost_per_inline_link_click?: string  // scalar string
}

// Extract integer value from Meta action array (first element)
function extractActionValue(actions?: { action_type: string; value: string }[]): number | null {
  if (!actions || !actions.length) return null
  const val = parseInt(actions[0].value)
  return isNaN(val) ? null : val
}

// Extract float value from Meta action array (first element)
function extractActionFloat(actions?: { action_type: string; value: string }[]): number | null {
  if (!actions || !actions.length) return null
  const val = parseFloat(actions[0].value)
  return isNaN(val) ? null : val
}

type CampaignData = {
  id: string
  name: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

type AdsetData = {
  id: string
  name: string
  campaign_id: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

type AdData = {
  id: string
  name: string
  adset_id: string
  effective_status: string
  creative?: { id: string; thumbnail_url?: string; image_url?: string; video_id?: string; image_hash?: string; object_story_spec?: { link_data?: { message?: string; name?: string; description?: string }; video_data?: { message?: string; title?: string; description?: string } } }
}

// Map our UI presets to valid Meta API date_preset values
const VALID_META_PRESETS: Record<string, string> = {
  'today': 'today',
  'yesterday': 'yesterday',
  'last_7d': 'last_7d',
  'last_14d': 'last_14d',
  'last_30d': 'last_30d',
  'last_90d': 'last_90d',
  'this_month': 'this_month',
  'last_month': 'last_month',
  'maximum': 'maximum',
}

// Helper to calculate date range from preset (for ads without insights)
function getDateRangeFromPreset(datePreset: string): { since: string; until: string } {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (datePreset) {
    case 'today':
      return { since: formatDate(today), until: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { since: formatDate(yesterday), until: formatDate(yesterday) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_14d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 13)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_90d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 89)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { since: formatDate(start), until: formatDate(end) }
    }
    default:
      // Default to last 30 days
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { since: formatDate(start), until: formatDate(today) }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, forceFullSync = false } = await request.json()

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Normalize ad_account_id to always use act_ prefix (handles legacy format mismatches)
    const cleanAccountId = adAccountId.replace(/^act_/, '')
    const normalizedAccountId = `act_${cleanAccountId}`

    // Get user's Meta connection (includes last_sync_at)
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // APPEND-ONLY SYNC: Store everything, sync only new data, filter on read
    // Two modes:
    //   INITIAL: First-time sync → date_preset=maximum (all history)
    //   APPEND:  Subsequent syncs → (last_sync_at - 2 days) to today
    const lastSyncAt = connection.last_sync_at ? new Date(connection.last_sync_at) : null
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const todayStr = formatDate(today)

    // Check workspace_accounts for initial_sync_complete flag
    const { data: wsAccount } = await supabase
      .from('workspace_accounts')
      .select('initial_sync_complete')
      .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)
      .limit(1)
      .single()

    // Determine sync mode
    let isInitialSync = forceFullSync || !wsAccount?.initial_sync_complete

    // Edge case: no workspace_accounts row → check if ad_data has any rows
    if (!wsAccount) {
      const { data: existingData } = await supabase
        .from('ad_data')
        .select('id')
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)
        .limit(1)
      isInitialSync = !existingData || existingData.length === 0
    }

    // Calculate append window: (last_sync_at - 2 days) to today
    // The -2 day buffer re-fetches before last sync for delayed Meta attribution
    // Meta can take up to 72 hours to finalize attribution
    let appendStartDate = todayStr
    let appendEndDate = todayStr

    if (!isInitialSync && lastSyncAt) {
      const bufferDate = new Date(lastSyncAt)
      bufferDate.setDate(bufferDate.getDate() - 2)
      appendStartDate = formatDate(bufferDate)
      appendEndDate = todayStr
      console.log(`[Sync] Append sync - fetching ${appendStartDate} to ${appendEndDate}`)
    } else if (!isInitialSync && !lastSyncAt) {
      // No last_sync_at but marked as complete — use 3-day default
      const threeDaysAgo = new Date(today)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 2)
      appendStartDate = formatDate(threeDaysAgo)
      appendEndDate = todayStr
      console.log(`[Sync] Append sync (no last_sync_at) - fetching ${appendStartDate} to ${appendEndDate}`)
    }

    if (isInitialSync) {
      console.log(`[Sync] Initial sync - fetching last ${INITIAL_SYNC_LOOKBACK_DAYS} days`)
    }

    // Fetch rules (including event_values) for this ad account
    const { data: rulesData } = await supabase
      .from('rules')
      .select('event_values')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .single()

    const eventValues: Record<string, number> = rulesData?.event_values || {}

    // Fields needed for insights
    const fields = [
      'campaign_name',
      'campaign_id',
      'adset_name',
      'adset_id',
      'ad_name',
      'ad_id',
      'impressions',
      'clicks',
      'spend',
      'actions',
      'action_values',
      // Video engagement metrics (zero extra API calls — included in same insights response)
      'video_thruplay_watched_actions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
      'video_avg_time_watched_actions',
      'video_play_actions',
      'cost_per_thruplay',
      'outbound_clicks',
      'inline_link_click_ctr',
      'cost_per_inline_link_click',
    ].join(',')

    // Hierarchy cache will be built from entity endpoints (faster than date_preset=maximum discovery)
    const adHierarchyCache: Record<string, { campaign_name: string; campaign_id: string; adset_name: string; adset_id: string; ad_name: string }> = {}

    // Build URLs for all fetches
    const insightsUrl = new URL(`${META_GRAPH_URL}/${adAccountId}/insights`)
    insightsUrl.searchParams.set('access_token', accessToken)
    insightsUrl.searchParams.set('fields', fields)
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('limit', '1000')

    // Initial sync uses a configurable lookback window (default 120 days).
    // This returns data for ALL ads that had activity in that window, including paused ads.
    // Paused ads appear in entity maps (via effective_status filter on entity endpoints)
    // so they won't be filtered out by the activeInsights campaign check.

    // Initial sync: fetch lookback window; Append sync: fetch dynamic window
    if (isInitialSync) {
      const initialStart = new Date(today)
      initialStart.setDate(initialStart.getDate() - INITIAL_SYNC_LOOKBACK_DAYS)
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since: formatDate(initialStart), until: todayStr }))
    } else {
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since: appendStartDate, until: appendEndDate }))
    }
    // Use time_increment=1 to get daily data for proper client-side date filtering
    insightsUrl.searchParams.set('time_increment', '1')

    // Include all non-deleted entity statuses so ads from the lookback window get creative data.
    // Meta defaults to ACTIVE only. CAMPAIGN_PAUSED/ADSET_PAUSED are ads that are active
    // themselves but paused at a parent level — missing these was causing null media_hash.
    const entityStatusFilter = JSON.stringify(['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'])

    const campaignsUrl = new URL(`${META_GRAPH_URL}/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('effective_status', entityStatusFilter)
    campaignsUrl.searchParams.set('limit', '1000')

    const adsetsUrl = new URL(`${META_GRAPH_URL}/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget')
    adsetsUrl.searchParams.set('effective_status', entityStatusFilter)
    adsetsUrl.searchParams.set('limit', '1000')

    const adsUrl = new URL(`${META_GRAPH_URL}/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,name,adset_id,effective_status,creative{id,thumbnail_url,image_url,video_id,image_hash,object_story_spec}')
    adsUrl.searchParams.set('effective_status', entityStatusFilter)
    adsUrl.searchParams.set('thumbnail_width', '1080')
    adsUrl.searchParams.set('thumbnail_height', '1080')
    adsUrl.searchParams.set('limit', '1000')

    // SEQUENTIAL FETCH with delays - avoid Meta API rate limits
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Always fetch insights (that's the data that changes)
    let insightsResult = await fetchAllPages<MetaInsight>(insightsUrl.toString())
    let allInsights = insightsResult.data

    let allCampaigns: CampaignData[] = []
    let allAdsets: AdsetData[] = []
    let allAdsData: AdData[] = []
    let campaignsResult: FetchResult<CampaignData> = { data: [], success: true }
    let adsetsResult: FetchResult<AdsetData> = { data: [], success: true }
    let adsResult: FetchResult<AdData> = { data: [], success: true }

    // Safety check: if append mode but DB is empty, fall back to initial sync
    if (!isInitialSync) {
      const { data: existingData } = await supabase
        .from('ad_data')
        .select('id')
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)
        .limit(1)

      if (!existingData || existingData.length === 0) {
        console.log('[Sync] Append mode aborted - no existing data, falling back to initial sync')
        isInitialSync = true

        // Re-build insights URL for initial sync (lookback window)
        const initialStart = new Date(today)
        initialStart.setDate(initialStart.getDate() - INITIAL_SYNC_LOOKBACK_DAYS)
        insightsUrl.searchParams.set('time_range', JSON.stringify({ since: formatDate(initialStart), until: todayStr }))

        insightsResult = await fetchAllPages<MetaInsight>(insightsUrl.toString())
        allInsights = insightsResult.data
        console.log('[Sync] Initial sync insights count:', allInsights.length)
      }
    }

    // Always fetch entities from Meta API (even for delta sync)
    // This ensures newly created campaigns/adsets/ads are picked up
    // The delta optimization only applies to insights data, not entity data

    // Add delay after insights fetch to avoid rate limits
    await delay(3000)

    // Use Meta's Batch API to combine all 3 entity requests into one HTTP call
    // This significantly reduces rate limit pressure vs 3 sequential calls with pagination
    // See: https://developers.facebook.com/docs/marketing-api/asyncrequests/
    // Batch API: include ACTIVE + PAUSED entities (Meta defaults to ACTIVE only)
    const batchUrl = `${META_GRAPH_URL}/?batch=${encodeURIComponent(JSON.stringify([
      { method: 'GET', relative_url: `${adAccountId}/campaigns?fields=id,name,effective_status,daily_budget,lifetime_budget&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&limit=500` },
      { method: 'GET', relative_url: `${adAccountId}/adsets?fields=id,name,campaign_id,effective_status,daily_budget,lifetime_budget&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&limit=500` },
      { method: 'GET', relative_url: `${adAccountId}/ads?fields=id,name,adset_id,effective_status,creative{id,thumbnail_url,image_url,video_id,image_hash,object_story_spec}&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&thumbnail_width=1080&thumbnail_height=1080&limit=500` }
    ]))}&access_token=${accessToken}&include_headers=false`

    try {
      // Batch API call with rate limit retry
      let batchResults: unknown = null
      let batchAttempts = 0
      const maxBatchRetries = 3

      while (!batchResults && batchAttempts < maxBatchRetries) {
        const batchResponse = await fetch(batchUrl, { method: 'POST' })
        const batchBody = await batchResponse.json()

        // Check for rate limiting on batch call
        if (isRateLimitError(batchResponse.status, batchBody.error?.code)) {
          batchAttempts++
          const retryAfterHeader = batchResponse.headers.get('Retry-After')
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : (30 * batchAttempts)
          console.log(`[Sync] Batch API rate limited - waiting ${retryAfterSeconds}s (attempt ${batchAttempts}/${maxBatchRetries})`)

          if (batchAttempts < maxBatchRetries) {
            await new Promise(r => setTimeout(r, retryAfterSeconds * 1000))
            continue
          }
        }

        batchResults = batchBody
      }

      // Check for batch-level errors (non-rate-limit)
      if (!batchResults || (batchResults as { error?: unknown }).error) {
        console.error('Batch API error:', (batchResults as { error?: unknown })?.error || 'No results')
        // Fall back to sequential fetches if batch fails
        console.log('[Sync] Batch API failed, falling back to sequential fetches')
        await delay(3000)
        campaignsResult = await fetchAllPages<CampaignData>(campaignsUrl.toString())
        await delay(3000)
        adsetsResult = await fetchAllPages<AdsetData>(adsetsUrl.toString())
        await delay(3000)
        adsResult = await fetchAllPages<AdData>(adsUrl.toString())
      } else if (Array.isArray(batchResults) && batchResults.length === 3) {
        // Parse each batch result
        for (let i = 0; i < 3; i++) {
          const result = batchResults[i]
          if (result.code !== 200) {
            console.error(`Batch request ${i} failed with code ${result.code}:`, result.body)
          }
        }

        // Parse campaigns from batch
        const campaignsBody = JSON.parse(batchResults[0].body || '{}')
        if (campaignsBody.data) {
          allCampaigns = campaignsBody.data
          campaignsResult = { data: allCampaigns, success: true }

          // Handle pagination for campaigns if needed
          if (campaignsBody.paging?.next) {
            await delay(1500)
            const morePages = await fetchAllPages<CampaignData>(campaignsBody.paging.next)
            allCampaigns = [...allCampaigns, ...morePages.data]
            campaignsResult = { data: allCampaigns, success: morePages.success }
          }
        } else if (campaignsBody.error) {
          campaignsResult = { data: [], success: false, error: campaignsBody.error.message }
        }

        // Parse adsets from batch
        const adsetsBody = JSON.parse(batchResults[1].body || '{}')
        if (adsetsBody.data) {
          allAdsets = adsetsBody.data
          adsetsResult = { data: allAdsets, success: true }

          // Handle pagination for adsets if needed
          if (adsetsBody.paging?.next) {
            await delay(1500)
            const morePages = await fetchAllPages<AdsetData>(adsetsBody.paging.next)
            allAdsets = [...allAdsets, ...morePages.data]
            adsetsResult = { data: allAdsets, success: morePages.success }
          }
        } else if (adsetsBody.error) {
          adsetsResult = { data: [], success: false, error: adsetsBody.error.message }
        }

        // Parse ads from batch
        const adsBody = JSON.parse(batchResults[2].body || '{}')
        if (adsBody.data) {
          allAdsData = adsBody.data
          adsResult = { data: allAdsData, success: true }

          // Handle pagination for ads if needed
          if (adsBody.paging?.next) {
            await delay(1500)
            const morePages = await fetchAllPages<AdData>(adsBody.paging.next)
            allAdsData = [...allAdsData, ...morePages.data]
            adsResult = { data: allAdsData, success: morePages.success }
          }
        } else if (adsBody.error) {
          adsResult = { data: [], success: false, error: adsBody.error.message }
        }
      } else {
        console.error('Unexpected batch response format:', batchResults)
        // Fall back to sequential fetches
        await delay(3000)
        campaignsResult = await fetchAllPages<CampaignData>(campaignsUrl.toString())
        await delay(3000)
        adsetsResult = await fetchAllPages<AdsetData>(adsetsUrl.toString())
        await delay(3000)
        adsResult = await fetchAllPages<AdData>(adsUrl.toString())

        allCampaigns = campaignsResult.data
        allAdsets = adsetsResult.data
        allAdsData = adsResult.data
      }
    } catch (batchErr) {
      console.error('Batch API exception:', batchErr)
      // Fall back to sequential fetches
      await delay(3000)
      campaignsResult = await fetchAllPages<CampaignData>(campaignsUrl.toString())
      await delay(3000)
      adsetsResult = await fetchAllPages<AdsetData>(adsetsUrl.toString())
      await delay(3000)
      adsResult = await fetchAllPages<AdData>(adsUrl.toString())

      allCampaigns = campaignsResult.data
      allAdsets = adsetsResult.data
      allAdsData = adsResult.data
    }

    // Log fetch results for debugging
    console.log('Meta sync fetch results:', {
      syncType: isInitialSync ? 'initial' : 'append',
      campaigns: { count: allCampaigns.length, success: campaignsResult.success, error: campaignsResult.error },
      adsets: { count: allAdsets.length, success: adsetsResult.success, error: adsetsResult.error },
      ads: { count: allAdsData.length, success: adsResult.success, error: adsResult.error },
      insights: { count: allInsights.length, success: insightsResult.success, error: insightsResult.error }
    })

    // Track if entity fetches failed (vs just returning empty)
    const adsetsFetchFailed = !adsetsResult.success
    const adsFetchFailed = !adsResult.success

    // CRITICAL: Detect when entity endpoints returned empty or failed but insights show entities exist
    // This happens on rapid successive syncs - Meta API returns empty arrays or rate limit errors
    // If we proceed, we'd lose all budget/status data. Better to error out.
    const insightAdsetIds = new Set(allInsights.map(i => i.adset_id).filter(Boolean))
    const insightAdIds = new Set(allInsights.map(i => i.ad_id).filter(Boolean))

    // Case 1: Successful but empty (Meta returned empty arrays without error)
    const adsetsReturnedEmpty = adsetsResult.success && allAdsets.length === 0 && insightAdsetIds.size > 0
    const adsReturnedEmpty = adsResult.success && allAdsData.length === 0 && insightAdIds.size > 0

    // Case 2: Failed fetch (rate limit, timeout, etc) when we have insights that need this data
    const adsetsFetchFailedWithData = adsetsFetchFailed && insightAdsetIds.size > 0
    const adsFetchFailedWithData = adsFetchFailed && insightAdIds.size > 0

    if (adsetsReturnedEmpty || adsReturnedEmpty) {
      console.error('Meta API returned empty entity data despite having insights - likely rapid sync issue:', {
        adsetsEmpty: adsetsReturnedEmpty,
        adsEmpty: adsReturnedEmpty,
        insightAdsetCount: insightAdsetIds.size,
        insightAdCount: insightAdIds.size
      })
      return NextResponse.json({
        error: 'Meta API returned incomplete data. Please wait a few seconds and try again.',
        retryable: true
      }, { status: 503 })
    }

    // If entity fetches failed (rate limit, etc), don't save partial data that would overwrite good data
    if (adsetsFetchFailedWithData || adsFetchFailedWithData) {
      console.error('Entity fetch failed - not saving partial data:', {
        adsetsFailed: adsetsFetchFailedWithData,
        adsFailed: adsFetchFailedWithData,
        adsetsError: adsetsResult.error,
        adsError: adsResult.error
      })
      return NextResponse.json({
        error: adsetsResult.error || adsResult.error || 'Meta API rate limit reached. Please wait a minute and try again.',
        retryable: true
      }, { status: 429 })
    }

    // Log if we have partial data (but don't block - let sync complete)
    if (allInsights.length > 0 && (allAdsets.length === 0 || allAdsData.length === 0)) {
      console.warn('Sync has partial data - some entities may show as UNKNOWN:', {
        campaigns: allCampaigns.length,
        adsets: allAdsets.length,
        ads: allAdsData.length,
        insights: allInsights.length,
        adsetsFetchFailed,
        adsFetchFailed
      })
    }

    // Build maps
    // IMPORTANT: Meta API returns budgets in cents, DB stores in dollars
    // We always fetch from Meta API now (batch or sequential), so always divide by 100
    const campaignMap: Record<string, { name: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adsetMap: Record<string, { name: string; campaign_id: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adStatusMap: Record<string, string> = {}
    const adCreativeMap: Record<string, { id: string; thumbnail_url?: string; image_url?: string; video_id?: string; image_hash?: string; object_story_spec?: { link_data?: { message?: string; name?: string; description?: string }; video_data?: { message?: string; title?: string; description?: string } } } | null> = {}  // ad_id -> creative object

    allCampaigns.forEach((c) => {
      campaignMap[c.id] = {
        name: c.name,
        status: c.effective_status,
        daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      }
    })

    allAdsets.forEach((a) => {
      adsetMap[a.id] = {
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      }
    })

    allAdsData.forEach((ad) => {
      adStatusMap[ad.id] = ad.effective_status
      adCreativeMap[ad.id] = ad.creative || null
      // Build hierarchy cache from entity data
      if (!adHierarchyCache[ad.id] && ad.adset_id) {
        const adset = adsetMap[ad.adset_id]
        const campaign = adset ? campaignMap[adset.campaign_id] : null
        if (adset && campaign) {
          adHierarchyCache[ad.id] = {
            campaign_name: campaign.name,
            campaign_id: adset.campaign_id,
            adset_name: adset.name,
            adset_id: ad.adset_id,
            ad_name: ad.name,
          }
        }
      }
    })

    // Filter out insights from deleted/archived campaigns BEFORE any fallback processing
    // Entity endpoints fetch ACTIVE + PAUSED campaigns, so if a campaign
    // isn't in our map, it was deleted or archived. We don't want stale data from those.
    const activeInsights = allInsights.filter((insight: MetaInsight) => {
      return campaignMap[insight.campaign_id] !== undefined
    })

    // Ensure all entities from insights exist in maps (fill gaps from entity fetches)
    // This handles cases where:
    // 1. Entity endpoints returned empty/failed
    // 2. Entity endpoints returned partial data (some adsets missing)
    // 3. New entities were created after entity fetch but before insights fetch
    const fallbackAdsetStatus = adsetsFetchFailed ? 'UNKNOWN' : 'ACTIVE'
    const fallbackAdStatus = adsFetchFailed ? 'UNKNOWN' : 'ACTIVE'

    activeInsights.forEach((insight: MetaInsight) => {
      // Ensure adset exists in map (use fallback if missing)
      if (insight.adset_id && !adsetMap[insight.adset_id]) {
        adsetMap[insight.adset_id] = {
          name: insight.adset_name,
          campaign_id: insight.campaign_id,
          status: fallbackAdsetStatus,
          daily_budget: null, // Can't get budget from insights
          lifetime_budget: null,
        }
      }
      // Ensure campaign exists in map (use fallback if missing)
      if (insight.campaign_id && !campaignMap[insight.campaign_id]) {
        campaignMap[insight.campaign_id] = {
          name: insight.campaign_name,
          status: 'ACTIVE',
          daily_budget: null,
          lifetime_budget: null,
        }
      }
      // Build hierarchy cache from insights
      if (!adHierarchyCache[insight.ad_id]) {
        adHierarchyCache[insight.ad_id] = {
          campaign_name: insight.campaign_name,
          campaign_id: insight.campaign_id,
          adset_name: insight.adset_name,
          adset_id: insight.adset_id,
          ad_name: insight.ad_name,
        }
      }
      // Set ad status if not already known
      if (!adStatusMap[insight.ad_id]) {
        adStatusMap[insight.ad_id] = fallbackAdStatus
      }
    })
    
    // Helper to extract media hash and type from creative object
    const extractMedia = (creative: { id: string; video_id?: string; image_hash?: string } | null): { mediaHash: string | null; mediaType: string | null } => {
      if (!creative) return { mediaHash: null, mediaType: null }
      if (creative.video_id) return { mediaHash: creative.video_id, mediaType: 'video' }
      if (creative.image_hash) return { mediaHash: creative.image_hash, mediaType: 'image' }
      return { mediaHash: null, mediaType: null }
    }

    // Track which ads have insights in the selected date range
    const adsWithInsights = new Set<string>()

    // Transform Meta data to our format (using activeInsights filtered above)
    const adData = activeInsights.map((insight: MetaInsight) => {
      adsWithInsights.add(insight.ad_id)

      // Find purchase actions (for revenue tracking)
      const purchases = insight.actions?.find(a =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      const purchaseValue = insight.action_values?.find(a =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )

      // Calculate results - look for the most relevant conversion action
      // Priority: purchases > leads > registrations > custom conversions
      const conversionActionTypes = [
        // Purchases (ecommerce)
        'purchase', 'omni_purchase',
        // Leads
        'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
        // Registrations
        'complete_registration', 'offsite_conversion.fb_pixel_complete_registration',
        // App installs
        'app_install', 'mobile_app_install',
        // Other valuable actions
        'contact', 'submit_application', 'subscribe', 'start_trial',
      ]

      // Find the first matching conversion action
      let resultAction = null
      let resultType: string | null = null

      // First check standard conversion types
      for (const actionType of conversionActionTypes) {
        const found = insight.actions?.find(a => a.action_type === actionType)
        if (found && parseInt(found.value) > 0) {
          resultAction = found
          // Simplify the type for display
          if (actionType.includes('purchase')) resultType = 'purchase'
          else if (actionType.includes('lead')) resultType = 'lead'
          else if (actionType.includes('registration')) resultType = 'registration'
          else if (actionType.includes('install')) resultType = 'install'
          else resultType = actionType.split('.').pop() || actionType
          break
        }
      }

      // If no standard conversion found, check for custom conversions only
      // Be specific - don't catch view_content, add_to_cart, etc.
      if (!resultAction) {
        const customConversion = insight.actions?.find(a =>
          a.action_type.startsWith('offsite_conversion.fb_pixel_custom.')
        )
        if (customConversion && parseInt(customConversion.value) > 0) {
          resultAction = customConversion
          // Extract the custom event name (last part after the dots)
          const parts = customConversion.action_type.split('.')
          resultType = parts[parts.length - 1] || 'conversion'
        }
      }

      const resultCount = resultAction ? parseInt(resultAction.value) : 0

      // Calculate result value
      // 1. If we have a purchase value from Meta, use it (ecommerce)
      // 2. If no purchase value but we have results and event_values, calculate it (lead-gen)
      let resultValue: number | null = null

      if (purchaseValue) {
        // Use purchase value from Meta (ecommerce campaigns)
        resultValue = parseFloat(purchaseValue.value)
      } else if (resultCount > 0 && resultType) {
        // Check if we have an event value configured for this result type
        // Normalize the result type to match our event_values keys
        const normalizedType = resultType.toLowerCase().replace(/-/g, '_')

        // Try various key formats to find a match
        const eventValue = eventValues[normalizedType]
          || eventValues[resultType]
          || eventValues[resultType.toLowerCase()]
          // Handle common variations
          || (normalizedType === 'registration' ? eventValues['complete_registration'] : null)
          || (normalizedType === 'complete_registration' ? eventValues['registration'] : null)
          || (normalizedType === 'omni_purchase' ? eventValues['purchase'] : null)
          || (normalizedType === 'app_install' ? eventValues['install'] : null)
          || (normalizedType === 'mobile_app_install' ? eventValues['install'] : null)

        if (eventValue && eventValue > 0) {
          resultValue = resultCount * eventValue
        }
      }

      // Parse video metrics from insight actions
      const videoViews = insight.actions?.find(a => a.action_type === 'video_view')
      const videoThruplay = extractActionValue(insight.video_thruplay_watched_actions)
      const videoP25 = extractActionValue(insight.video_p25_watched_actions)
      const videoP50 = extractActionValue(insight.video_p50_watched_actions)
      const videoP75 = extractActionValue(insight.video_p75_watched_actions)
      const videoP95 = extractActionValue(insight.video_p95_watched_actions)
      const videoP100 = extractActionValue(insight.video_p100_watched_actions)
      const videoAvgTimeWatched = extractActionFloat(insight.video_avg_time_watched_actions)
      const videoPlays = extractActionValue(insight.video_play_actions)
      const costPerThruplay = extractActionFloat(insight.cost_per_thruplay)
      const outboundClicks = extractActionValue(insight.outbound_clicks)
      const inlineLinkClickCtr = insight.inline_link_click_ctr ? parseFloat(insight.inline_link_click_ctr) : null
      const costPerInlineLinkClick = insight.cost_per_inline_link_click ? parseFloat(insight.cost_per_inline_link_click) : null

      // Get status at each level using the new maps
      const adStatus = adStatusMap[insight.ad_id] || 'UNKNOWN'
      const adset = adsetMap[insight.adset_id]
      const campaign = campaignMap[insight.campaign_id]

      return {
        user_id: userId,
        source: 'meta_api',
        ad_account_id: normalizedAccountId,
        date_start: insight.date_start,
        date_end: insight.date_stop,
        campaign_name: insight.campaign_name,
        campaign_id: insight.campaign_id,
        adset_name: insight.adset_name,
        adset_id: insight.adset_id,
        ad_name: insight.ad_name,
        ad_id: insight.ad_id,
        status: adStatus,
        adset_status: adset?.status || 'DELETED', // Not in /adsets = deleted
        campaign_status: campaign?.status || 'DELETED', // Not in /campaigns = deleted
        campaign_daily_budget: campaign?.daily_budget ?? null,
        campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
        adset_daily_budget: adset?.daily_budget ?? null,
        adset_lifetime_budget: adset?.lifetime_budget ?? null,
        creative_id: adCreativeMap[insight.ad_id]?.id || null,
        thumbnail_url: adCreativeMap[insight.ad_id]?.thumbnail_url || null,
        image_url: adCreativeMap[insight.ad_id]?.image_url || null,
        video_id: adCreativeMap[insight.ad_id]?.video_id || null,
        media_hash: extractMedia(adCreativeMap[insight.ad_id]).mediaHash,
        media_type: extractMedia(adCreativeMap[insight.ad_id]).mediaType,
        primary_text: (() => { const oss = adCreativeMap[insight.ad_id]?.object_story_spec; return oss?.link_data?.message || oss?.video_data?.message || null })(),
        headline: (() => { const oss = adCreativeMap[insight.ad_id]?.object_story_spec; return oss?.link_data?.name || oss?.video_data?.title || null })(),
        description: (() => { const oss = adCreativeMap[insight.ad_id]?.object_story_spec; return oss?.link_data?.description || oss?.video_data?.description || null })(),
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        results: resultCount,
        result_value: resultValue,
        result_type: resultType,
        // Video engagement metrics
        video_views: videoViews ? parseInt(videoViews.value) || null : null,
        video_thruplay: videoThruplay,
        video_p25: videoP25,
        video_p50: videoP50,
        video_p75: videoP75,
        video_p95: videoP95,
        video_p100: videoP100,
        video_avg_time_watched: videoAvgTimeWatched,
        video_plays: videoPlays,
        cost_per_thruplay: costPerThruplay,
        outbound_clicks: outboundClicks,
        inline_link_click_ctr: inlineLinkClickCtr,
        cost_per_inline_link_click: costPerInlineLinkClick,
        synced_at: new Date().toISOString(),
      }
    })

    // Calculate date range for ads without insights
    // Initial sync: use today as the date marker; Append: use the append window
    const dateRange = isInitialSync
      ? { since: todayStr, until: todayStr }
      : { since: appendStartDate, until: appendEndDate }

    // Add entries for ads without any insights (no activity during date range)
    // Use hierarchy cache built from /ads endpoint
    const adsWithoutInsights: typeof adData = []

    // Add ads from hierarchy cache that aren't in the selected date range insights
    Object.entries(adHierarchyCache).forEach(([adId, hierarchy]) => {
      if (!adsWithInsights.has(adId)) {
        // Get status and budget from entity maps if available
        const adStatus = adStatusMap[adId] || 'UNKNOWN'
        const adset = adsetMap[hierarchy.adset_id]
        const campaign = campaignMap[hierarchy.campaign_id]

        adsWithoutInsights.push({
          user_id: userId,
          source: 'meta_api',
          ad_account_id: normalizedAccountId,
          date_start: dateRange.since,
          date_end: dateRange.until,
          campaign_name: hierarchy.campaign_name,
          campaign_id: hierarchy.campaign_id,
          adset_name: hierarchy.adset_name,
          adset_id: hierarchy.adset_id,
          ad_name: hierarchy.ad_name,
          ad_id: adId,
          status: adStatus,
          adset_status: adset?.status || 'DELETED', // Not in /adsets = deleted
          campaign_status: campaign?.status || 'DELETED', // Not in /campaigns = deleted
          campaign_daily_budget: campaign?.daily_budget ?? null,
          campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
          adset_daily_budget: adset?.daily_budget ?? null,
          adset_lifetime_budget: adset?.lifetime_budget ?? null,
          creative_id: adCreativeMap[adId]?.id || null,
          thumbnail_url: adCreativeMap[adId]?.thumbnail_url || null,
          image_url: adCreativeMap[adId]?.image_url || null,
          video_id: adCreativeMap[adId]?.video_id || null,
          media_hash: extractMedia(adCreativeMap[adId]).mediaHash,
          media_type: extractMedia(adCreativeMap[adId]).mediaType,
          primary_text: (() => { const oss = adCreativeMap[adId]?.object_story_spec; return oss?.link_data?.message || oss?.video_data?.message || null })(),
          headline: (() => { const oss = adCreativeMap[adId]?.object_story_spec; return oss?.link_data?.name || oss?.video_data?.title || null })(),
          description: (() => { const oss = adCreativeMap[adId]?.object_story_spec; return oss?.link_data?.description || oss?.video_data?.description || null })(),
          impressions: 0,
          clicks: 0,
          spend: 0,
          purchases: 0,
          revenue: 0,
          results: 0,
          result_value: null,
          result_type: null,
          // Video metrics — null for ads without insights
          video_views: null,
          video_thruplay: null,
          video_p25: null,
          video_p50: null,
          video_p75: null,
          video_p95: null,
          video_p100: null,
          video_avg_time_watched: null,
          video_plays: null,
          cost_per_thruplay: null,
          outbound_clicks: null,
          inline_link_click_ctr: null,
          cost_per_inline_link_click: null,
          synced_at: new Date().toISOString(),
        })
      }
    })

    // Combine all ad data
    const allAdData = [...adData, ...adsWithoutInsights]

    if (allAdData.length === 0) {
      return NextResponse.json({
        message: 'No ads found in this account',
        count: 0
      })
    }
    
    // Delete existing data for the synced range before inserting fresh data
    // Initial sync: delete ALL data for this account (clean slate)
    // Append sync: delete only the append window (preserves historical data)
    if (isInitialSync) {
      console.log('[Sync] Initial sync - deleting ALL existing data for this account')
      const { error: deleteError } = await supabase
        .from('ad_data')
        .delete()
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)

      if (deleteError) {
        console.error('Delete error:', deleteError)
      }
    } else {
      console.log('[Sync] Append sync - deleting data for', appendStartDate, 'to', appendEndDate)
      const { error: deleteError } = await supabase
        .from('ad_data')
        .delete()
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)
        .gte('date_start', appendStartDate)
        .lte('date_start', appendEndDate)

      if (deleteError) {
        console.error('Delete error:', deleteError)
      }
    }

    // Insert new data in parallel batches for speed
    const BATCH_SIZE = 1000
    const batches: typeof allAdData[] = []
    for (let i = 0; i < allAdData.length; i += BATCH_SIZE) {
      batches.push(allAdData.slice(i, i + BATCH_SIZE))
    }

    const insertResults = await Promise.all(
      batches.map(batch => supabase.from('ad_data').insert(batch))
    )

    const insertError = insertResults.find(r => r.error)?.error
    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save ad data' }, { status: 500 })
    }
    
    // After initial sync, mark workspace_accounts as complete so future syncs use append mode
    // GUARD: Only set the flag if we actually got insights data — a broken sync with zero rows
    // must NOT poison the flag, otherwise all future syncs run as append-only with no historical data
    if (isInitialSync && allAdData.length > 0) {
      const { error: flagError } = await supabase
        .from('workspace_accounts')
        .update({ initial_sync_complete: true })
        .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)

      if (flagError) {
        console.error('[Sync] Failed to set initial_sync_complete:', flagError)
      } else {
        console.log('[Sync] Marked workspace_accounts as initial_sync_complete')
      }
    } else if (isInitialSync && allAdData.length === 0) {
      console.warn('[Sync] Initial sync returned 0 insights rows — NOT setting initial_sync_complete. Next sync will retry initial mode.')
    }

    // Update last sync time on connection
    await supabase
      .from('meta_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
    
    // Trigger alert generation in the background
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/alerts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(err => console.error('Alert generation failed:', err))
    } catch (alertErr) {
      console.error('Failed to trigger alerts:', alertErr)
      // Don't fail the sync if alert generation fails
    }

    // Fire-and-forget: sync media library for high-quality thumbnails
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/meta/sync-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adAccountId: normalizedAccountId })
      }).catch(err => console.error('[Sync] Media library sync failed:', err))
    } catch (mediaErr) {
      console.error('[Sync] Failed to trigger media sync:', mediaErr)
      // Don't fail the sync if media sync fails
    }

    // Trigger attribution merge for workspaces that include this ad account
    try {
      // Find workspace(s) containing this ad account
      // Try both with and without act_ prefix since storage format may vary
      const { data: workspaceAccounts, error: waError } = await supabase
        .from('workspace_accounts')
        .select('workspace_id')
        .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)
        .eq('platform', 'meta')

      console.log('[Sync] Merge lookup:', { normalizedAccountId, cleanAccountId, found: workspaceAccounts?.length || 0, error: waError?.message })

      if (workspaceAccounts && workspaceAccounts.length > 0) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

        // Use the actual sync date range
        const mergeStart = isInitialSync ? '2020-01-01' : appendStartDate
        const mergeEnd = todayStr

        // Trigger merge for each workspace (fire and forget)
        for (const wa of workspaceAccounts) {
          fetch(`${baseUrl}/api/attribution/merge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userId}`
            },
            body: JSON.stringify({
              workspace_id: wa.workspace_id,
              date_start: mergeStart,
              date_end: mergeEnd
            })
          }).catch(err => console.error('[Sync] Attribution merge failed:', err))
        }
        console.log(`[Sync] Triggered attribution merge for ${workspaceAccounts.length} workspace(s), range: ${mergeStart} to ${mergeEnd} (${isInitialSync ? 'initial' : 'append'})`)
      }
    } catch (mergeErr) {
      console.error('[Sync] Failed to trigger attribution merge:', mergeErr)
      // Don't fail the sync if merge fails
    }

    return NextResponse.json({
      message: isInitialSync ? 'Initial sync complete (full history)' : `Append sync complete (${appendStartDate} to ${appendEndDate})`,
      count: allAdData.length,
      adsWithActivity: adData.length,
      adsWithoutActivity: adsWithoutInsights.length,
      filteredDeletedInsights: allInsights.length - activeInsights.length,
      syncType: isInitialSync ? 'initial' : 'append',
      dateRange: isInitialSync ? { since: 'maximum', until: todayStr } : { since: appendStartDate, until: appendEndDate },
      // Return campaign IDs so dashboard can hydrate any missing campaigns (created outside KillScale)
      campaignIds: allCampaigns.map(c => c.id)
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
