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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  creative?: { id: string }
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
    const { userId, adAccountId, datePreset = 'last_30d', customStartDate, customEndDate, forceFullSync = false } = await request.json()

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

    // SMART DELTA SYNC: Only fetch what's needed
    // If we synced recently and user isn't expanding the date range, just fetch today
    const lastSyncAt = connection.last_sync_at ? new Date(connection.last_sync_at) : null
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const todayStr = formatDate(today)

    // Calculate requested date range
    const requestedRange = datePreset === 'custom' && customStartDate && customEndDate
      ? { since: customStartDate, until: customEndDate }
      : getDateRangeFromPreset(datePreset)

    // Determine if this is a delta sync (only today) or full sync
    let isDeltaSync = false
    let deltaStartDate = todayStr
    let deltaEndDate = todayStr

    if (!forceFullSync && lastSyncAt) {
      const lastSyncDate = formatDate(lastSyncAt)
      const hoursSinceSync = (today.getTime() - lastSyncAt.getTime()) / (1000 * 60 * 60)

      // Delta sync if: synced within last 24 hours and requesting same/smaller range
      if (hoursSinceSync < 24) {
        // Check if we need to expand the range (user wants older data than what we have)
        // For now, assume we always have last_30d - if user requests last_30d or smaller, delta sync
        const smallRanges = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d']
        if (datePreset !== 'custom' && smallRanges.includes(datePreset)) {
          isDeltaSync = true
          // Fetch today and yesterday to ensure we have complete data
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          deltaStartDate = formatDate(yesterday)
          deltaEndDate = todayStr
          console.log('[Sync] Delta sync - only fetching', deltaStartDate, 'to', deltaEndDate)
        }
      }
    }

    if (!isDeltaSync) {
      console.log('[Sync] Full sync - fetching', requestedRange.since, 'to', requestedRange.until)
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
    ].join(',')

    // Hierarchy cache will be built from entity endpoints (faster than date_preset=maximum discovery)
    const adHierarchyCache: Record<string, { campaign_name: string; campaign_id: string; adset_name: string; adset_id: string; ad_name: string }> = {}

    // Build URLs for all fetches
    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/insights`)
    insightsUrl.searchParams.set('access_token', accessToken)
    insightsUrl.searchParams.set('fields', fields)
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('limit', '1000')

    // For delta sync, only fetch today + yesterday; for full sync use requested range
    if (isDeltaSync) {
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since: deltaStartDate, until: deltaEndDate }))
    } else if (datePreset === 'custom' && customStartDate && customEndDate) {
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since: customStartDate, until: customEndDate }))
    } else {
      insightsUrl.searchParams.set('date_preset', VALID_META_PRESETS[datePreset] || 'last_30d')
    }
    // Use time_increment=1 to get daily data for proper client-side date filtering
    insightsUrl.searchParams.set('time_increment', '1')

    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('limit', '1000')

    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget')
    adsetsUrl.searchParams.set('limit', '1000')

    const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,name,adset_id,effective_status,creative{id}')
    adsUrl.searchParams.set('limit', '1000')

    // SEQUENTIAL FETCH with delays - avoid Meta API rate limits
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Always fetch insights (that's the data that changes)
    let insightsResult = await fetchAllPages<MetaInsight>(insightsUrl.toString())
    let allInsights = insightsResult.data

    // For delta sync, skip entity fetches - use existing data from Supabase
    // Entity data (status, budget) rarely changes and can be fetched separately if needed
    let allCampaigns: CampaignData[] = []
    let allAdsets: AdsetData[] = []
    let allAdsData: AdData[] = []
    let campaignsResult: FetchResult<CampaignData> = { data: [], success: true }
    let adsetsResult: FetchResult<AdsetData> = { data: [], success: true }
    let adsResult: FetchResult<AdData> = { data: [], success: true }

    if (isDeltaSync) {
      // Delta sync: Check if we have existing data, if not fall back to full sync
      console.log('[Sync] Delta sync - checking for existing data')
      const { data: existingData } = await supabase
        .from('ad_data')
        .select('id')
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)
        .limit(1)

      // If DB is empty, fall back to full sync and re-fetch insights with full date range
      if (!existingData || existingData.length === 0) {
        console.log('[Sync] Delta sync aborted - no existing data, falling back to full sync')
        isDeltaSync = false

        // Re-build insights URL with full date range (not delta)
        if (datePreset === 'custom' && customStartDate && customEndDate) {
          insightsUrl.searchParams.set('time_range', JSON.stringify({ since: customStartDate, until: customEndDate }))
        } else {
          insightsUrl.searchParams.delete('time_range')
          insightsUrl.searchParams.set('date_preset', VALID_META_PRESETS[datePreset] || 'last_30d')
        }

        // Re-fetch insights with correct date range
        console.log('[Sync] Re-fetching insights with full date range:', datePreset)
        insightsResult = await fetchAllPages<MetaInsight>(insightsUrl.toString())
        allInsights = insightsResult.data
        console.log('[Sync] Full sync insights count:', allInsights.length)
      } else {
        console.log('[Sync] Delta sync - existing data found, fetching entities from Meta')
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
    const batchUrl = `https://graph.facebook.com/v18.0/?batch=${encodeURIComponent(JSON.stringify([
      { method: 'GET', relative_url: `${adAccountId}/campaigns?fields=id,name,effective_status,daily_budget,lifetime_budget&limit=500` },
      { method: 'GET', relative_url: `${adAccountId}/adsets?fields=id,name,campaign_id,effective_status,daily_budget,lifetime_budget&limit=500` },
      { method: 'GET', relative_url: `${adAccountId}/ads?fields=id,name,adset_id,effective_status,creative{id}&limit=500` }
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
      syncType: isDeltaSync ? 'delta' : 'full',
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
    const adCreativeMap: Record<string, string | null> = {}  // ad_id -> creative_id

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
      adCreativeMap[ad.id] = ad.creative?.id || null
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

    // Filter out insights from deleted campaigns BEFORE any fallback processing
    // The campaigns endpoint only returns non-deleted campaigns, so if a campaign
    // isn't in our map, it was deleted. We don't want stale data from deleted campaigns.
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
        creative_id: adCreativeMap[insight.ad_id] || null,
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        results: resultCount,
        result_value: resultValue,
        result_type: resultType,
        synced_at: new Date().toISOString(),
      }
    })

    // Calculate date range for ads without insights
    const dateRange = (datePreset === 'custom' && customStartDate && customEndDate)
      ? { since: customStartDate, until: customEndDate }
      : getDateRangeFromPreset(datePreset)

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
          creative_id: adCreativeMap[adId] || null,
          impressions: 0,
          clicks: 0,
          spend: 0,
          purchases: 0,
          revenue: 0,
          results: 0,
          result_value: null,
          result_type: null,
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
    
    // Delete existing data only for the dates being synced (preserves historical data)
    // This allows ads from previous date ranges to remain in the DB for attribution matching
    const deleteStartDate = isDeltaSync ? deltaStartDate : requestedRange.since
    const deleteEndDate = isDeltaSync ? deltaEndDate : requestedRange.until

    console.log('[Sync] Deleting data for date range:', deleteStartDate, 'to', deleteEndDate, '(preserving historical data)')
    const { error: deleteError } = await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
      .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)
      .gte('date_start', deleteStartDate)
      .lte('date_start', deleteEndDate)

    if (deleteError) {
      console.error('Delete error:', deleteError)
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

        // Use the actual sync date range (matches dashboard selection)
        const mergeStart = isDeltaSync ? deltaStartDate : requestedRange.since
        const mergeEnd = isDeltaSync ? deltaEndDate : requestedRange.until

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
        console.log(`[Sync] Triggered attribution merge for ${workspaceAccounts.length} workspace(s), range: ${mergeStart} to ${mergeEnd}`)
      }
    } catch (mergeErr) {
      console.error('[Sync] Failed to trigger attribution merge:', mergeErr)
      // Don't fail the sync if merge fails
    }

    return NextResponse.json({
      message: isDeltaSync ? 'Delta sync complete (today + yesterday only)' : 'Full sync complete',
      count: allAdData.length,
      adsWithActivity: adData.length,
      adsWithoutActivity: adsWithoutInsights.length,
      filteredDeletedInsights: allInsights.length - activeInsights.length,
      syncType: isDeltaSync ? 'delta' : 'full',
      dateRange: isDeltaSync ? { since: deltaStartDate, until: deltaEndDate } : requestedRange
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
