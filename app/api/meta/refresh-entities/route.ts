import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isRateLimitError(status: number, errorCode?: number): boolean {
  return status === 429 || errorCode === 4 || errorCode === 17 || errorCode === 32
}

interface MetaCampaign {
  id: string
  name: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

interface MetaAdset {
  id: string
  name: string
  campaign_id: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

interface MetaAd {
  id: string
  name: string
  adset_id: string
  effective_status: string
  creative?: {
    id: string
    thumbnail_url?: string
    image_url?: string
    video_id?: string
    image_hash?: string
  }
}

interface BatchResult {
  code: number
  body: string
}

/**
 * Lightweight entity metadata refresh. Fetches ONLY names, statuses, budgets,
 * and creative data from Meta via a single Batch API call (3 sub-requests).
 * No insights/performance data is fetched.
 *
 * Called automatically on dashboard page load with a 60-second cooldown.
 * Cost: 1 HTTP call to Meta, ~2-3 seconds total.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId } = await request.json() as {
      userId: string
      adAccountId: string
    }

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token
    // Normalize ad_account_id to always use act_ prefix (matches sync/route.ts convention)
    const cleanAccountId = adAccountId.replace(/^act_/, '')
    const normalizedAccountId = `act_${cleanAccountId}`
    const metaAccountId = normalizedAccountId

    // --- Meta Batch API call (same pattern as sync/route.ts:498-502) ---
    const batchUrl = `${META_GRAPH_URL}/?batch=${encodeURIComponent(JSON.stringify([
      { method: 'GET', relative_url: `${metaAccountId}/campaigns?fields=id,name,effective_status,daily_budget,lifetime_budget&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&limit=500` },
      { method: 'GET', relative_url: `${metaAccountId}/adsets?fields=id,name,campaign_id,effective_status,daily_budget,lifetime_budget&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&limit=500` },
      { method: 'GET', relative_url: `${metaAccountId}/ads?fields=id,name,adset_id,effective_status,creative{id,thumbnail_url,image_url,video_id,image_hash}&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]&thumbnail_width=1080&thumbnail_height=1080&limit=500` }
    ]))}&access_token=${accessToken}&include_headers=false`

    // Rate-limit retry (same pattern as sync/route.ts:510-528)
    let batchResults: BatchResult[] | null = null
    let batchAttempts = 0
    const maxBatchRetries = 3

    while (!batchResults && batchAttempts < maxBatchRetries) {
      const batchResponse = await fetch(batchUrl, { method: 'POST' })
      const batchBody = await batchResponse.json()

      if (isRateLimitError(batchResponse.status, batchBody.error?.code)) {
        batchAttempts++
        const retryAfterHeader = batchResponse.headers.get('Retry-After')
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : (30 * batchAttempts)
        console.log(`[RefreshEntities] Rate limited - waiting ${retryAfterSeconds}s (attempt ${batchAttempts}/${maxBatchRetries})`)

        if (batchAttempts < maxBatchRetries) {
          await new Promise(r => setTimeout(r, retryAfterSeconds * 1000))
          continue
        }
        return NextResponse.json({ error: 'Rate limited by Meta API' }, { status: 429 })
      }

      if (!Array.isArray(batchBody) || batchBody.length !== 3) {
        console.error('[RefreshEntities] Unexpected batch response:', batchBody)
        return NextResponse.json({ error: 'Unexpected Meta API response' }, { status: 500 })
      }

      batchResults = batchBody
    }

    if (!batchResults) {
      return NextResponse.json({ error: 'Failed to fetch from Meta API' }, { status: 500 })
    }

    // --- Parse batch results ---
    const parseBatchBody = <T>(result: BatchResult): T[] => {
      if (result.code !== 200) {
        console.error(`[RefreshEntities] Batch sub-request failed with code ${result.code}`)
        return []
      }
      const parsed = JSON.parse(result.body || '{}')
      return parsed.data || []
    }

    const allCampaigns = parseBatchBody<MetaCampaign>(batchResults[0])
    const allAdsets = parseBatchBody<MetaAdset>(batchResults[1])
    const allAds = parseBatchBody<MetaAd>(batchResults[2])

    // Handle pagination for any entity type that returned 500 results
    const fetchRemainingPages = async <T>(result: BatchResult): Promise<T[]> => {
      const parsed = JSON.parse(result.body || '{}')
      if (!parsed.paging?.next) return []

      const extra: T[] = []
      let nextUrl: string | null = parsed.paging.next
      let pages = 0

      while (nextUrl && pages < 10) {
        await new Promise(r => setTimeout(r, 1500))
        const res = await fetch(nextUrl)
        const body = await res.json()
        if (body.data) extra.push(...body.data)
        nextUrl = body.paging?.next || null
        pages++
      }
      return extra
    }

    // Only paginate if we got exactly 500 (limit reached)
    if (allCampaigns.length === 500) {
      const more = await fetchRemainingPages<MetaCampaign>(batchResults[0])
      allCampaigns.push(...more)
    }
    if (allAdsets.length === 500) {
      const more = await fetchRemainingPages<MetaAdset>(batchResults[1])
      allAdsets.push(...more)
    }
    if (allAds.length === 500) {
      const more = await fetchRemainingPages<MetaAd>(batchResults[2])
      allAds.push(...more)
    }

    // --- Build lookup maps (same pattern as sync/route.ts:698-724) ---
    // IMPORTANT: Meta API returns budgets in cents, DB stores in dollars
    const campaignMap: Record<string, {
      name: string; status: string
      daily_budget: number | null; lifetime_budget: number | null
    }> = {}
    const adsetMap: Record<string, {
      name: string; campaign_id: string; status: string
      daily_budget: number | null; lifetime_budget: number | null
    }> = {}
    const adMap: Record<string, {
      name: string; adset_id: string; status: string
      creative: MetaAd['creative'] | null
    }> = {}

    allCampaigns.forEach(c => {
      campaignMap[c.id] = {
        name: c.name,
        status: c.effective_status,
        daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      }
    })

    allAdsets.forEach(a => {
      adsetMap[a.id] = {
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      }
    })

    allAds.forEach(ad => {
      adMap[ad.id] = {
        name: ad.name,
        adset_id: ad.adset_id,
        status: ad.effective_status,
        creative: ad.creative || null,
      }
    })

    // --- UPDATE existing ad_data rows ---
    const BATCH_SIZE = 15
    let updatedCampaigns = 0
    let updatedAdsets = 0
    let updatedAds = 0

    // Update campaigns (name, status, budget)
    const campaignIds = Object.keys(campaignMap)
    for (let i = 0; i < campaignIds.length; i += BATCH_SIZE) {
      const batch = campaignIds.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (campaignId) => {
        const c = campaignMap[campaignId]
        const { error } = await supabase
          .from('ad_data')
          .update({
            campaign_name: c.name,
            campaign_status: c.status,
            campaign_daily_budget: c.daily_budget,
            campaign_lifetime_budget: c.lifetime_budget,
          })
          .eq('user_id', userId)
          .eq('campaign_id', campaignId)
        if (error) console.error(`[RefreshEntities] Campaign update error for ${campaignId}:`, error.message)
        else updatedCampaigns++
      }))
    }

    // Update adsets (name, status, budget)
    const adsetIds = Object.keys(adsetMap)
    for (let i = 0; i < adsetIds.length; i += BATCH_SIZE) {
      const batch = adsetIds.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (adsetId) => {
        const a = adsetMap[adsetId]
        const { error } = await supabase
          .from('ad_data')
          .update({
            adset_name: a.name,
            adset_status: a.status,
            adset_daily_budget: a.daily_budget,
            adset_lifetime_budget: a.lifetime_budget,
          })
          .eq('user_id', userId)
          .eq('adset_id', adsetId)
        if (error) console.error(`[RefreshEntities] Adset update error for ${adsetId}:`, error.message)
        else updatedAdsets++
      }))
    }

    // Update ads (name, status, creative data)
    const adIds = Object.keys(adMap)
    for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
      const batch = adIds.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (adId) => {
        const ad = adMap[adId]
        const updateFields: Record<string, unknown> = {
          ad_name: ad.name,
          status: ad.status,
        }
        if (ad.creative) {
          updateFields.creative_id = ad.creative.id
          if (ad.creative.thumbnail_url) updateFields.thumbnail_url = ad.creative.thumbnail_url
          if (ad.creative.image_url) updateFields.image_url = ad.creative.image_url
          if (ad.creative.video_id) updateFields.video_id = ad.creative.video_id
          if (ad.creative.image_hash) {
            updateFields.media_hash = ad.creative.image_hash
            updateFields.media_type = ad.creative.video_id ? 'video' : 'image'
          }
        }
        const { error } = await supabase
          .from('ad_data')
          .update(updateFields)
          .eq('user_id', userId)
          .eq('ad_id', adId)
        if (error) console.error(`[RefreshEntities] Ad update error for ${adId}:`, error.message)
        else updatedAds++
      }))
    }

    // --- INSERT stub rows for NEW entities not yet in ad_data ---
    // Query both formats of ad_account_id (with and without act_ prefix) to handle legacy data
    const { data: existingRows } = await supabase
      .from('ad_data')
      .select('ad_id')
      .eq('user_id', userId)
      .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)

    const existingAdIds = new Set((existingRows || []).map(r => r.ad_id))
    const newAds = allAds.filter(ad => !existingAdIds.has(ad.id))
    let insertedCount = 0

    if (newAds.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0]

      const stubRows = newAds.map(ad => {
        const adset = adsetMap[ad.adset_id]
        const campaign = adset ? campaignMap[adset.campaign_id] : null

        return {
          user_id: userId,
          source: 'meta_api',
          ad_account_id: normalizedAccountId,
          date_start: todayStr,
          date_end: todayStr,
          campaign_name: campaign?.name || 'Unknown Campaign',
          campaign_id: adset?.campaign_id || '',
          adset_name: adset?.name || 'Unknown Ad Set',
          adset_id: ad.adset_id,
          ad_name: ad.name,
          ad_id: ad.id,
          status: ad.effective_status,
          adset_status: adset?.status || 'UNKNOWN',
          campaign_status: campaign?.status || 'UNKNOWN',
          campaign_daily_budget: campaign?.daily_budget ?? null,
          campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
          adset_daily_budget: adset?.daily_budget ?? null,
          adset_lifetime_budget: adset?.lifetime_budget ?? null,
          creative_id: ad.creative?.id || null,
          thumbnail_url: ad.creative?.thumbnail_url || null,
          image_url: ad.creative?.image_url || null,
          video_id: ad.creative?.video_id || null,
          media_hash: ad.creative?.image_hash || null,
          media_type: ad.creative ? (ad.creative.video_id ? 'video' : 'image') : null,
          impressions: 0,
          clicks: 0,
          spend: 0,
          purchases: 0,
          revenue: 0,
          results: 0,
          result_value: null,
          result_type: null,
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
        }
      })

      // Delete any existing stubs for these ads on today (idempotency)
      // Handle both ad_account_id formats (with and without act_ prefix)
      const newAdIds = newAds.map(a => a.id)
      await supabase
        .from('ad_data')
        .delete()
        .eq('user_id', userId)
        .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)
        .eq('date_start', todayStr)
        .in('ad_id', newAdIds)

      const { error: insertError } = await supabase
        .from('ad_data')
        .insert(stubRows)

      if (insertError) {
        console.error('[RefreshEntities] Insert error:', insertError.message)
      } else {
        insertedCount = stubRows.length
      }
    }

    const hasChanges = updatedCampaigns > 0 || updatedAdsets > 0 || updatedAds > 0 || insertedCount > 0

    console.log(`[RefreshEntities] Done - updated: ${updatedCampaigns} campaigns, ${updatedAdsets} adsets, ${updatedAds} ads. Inserted: ${insertedCount} new ads.`)

    return NextResponse.json({
      success: true,
      hasChanges,
      updated: {
        campaigns: updatedCampaigns,
        adsets: updatedAdsets,
        ads: updatedAds,
      },
      inserted: insertedCount,
    })

  } catch (err) {
    console.error('[RefreshEntities] Error:', err)
    return NextResponse.json({ error: 'Failed to refresh entities' }, { status: 500 })
  }
}
