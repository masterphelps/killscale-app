/**
 * FRAGILE CODE - See CLAUDE.md Section 8 before modifying
 *
 * This route handles video resolution for Active Ads. Common breakage points:
 *
 * 1. ACCOUNT ID FORMAT:
 *    - ad_data uses 'act_XXXXX' format
 *    - media_library uses 'XXXXX' (no prefix)
 *    - MUST use cleanAccountId for media_library queries
 *
 * 2. MEDIA_LIBRARY SCHEMA:
 *    - Does NOT have 'video_id' column
 *    - Adding video_id to SELECT will cause error 42703 and return 0 rows
 *    - Only select: media_hash, media_type, url, video_thumbnail_url, storage_url
 *
 * 3. STORAGE URL RESOLUTION ORDER:
 *    - media_library by media_hash
 *    - creative_id fallback
 *    - ad.storage_url from ad_data
 *    - video_id fallback from other ad_data rows
 *
 * If videos stop playing, check server logs for Supabase errors first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateCompositeScores, calculateFatigueScore } from '@/lib/creative-scores'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // media_library stores ad_account_id WITHOUT 'act_' prefix, ad_data uses WITH prefix
    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Fetch ad_data (NO date filter - we want ALL ads to determine current active status)
    // Performance metrics will be filtered by date range in aggregation
    const adQuery = supabase
      .from('ad_data')
      .select('ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, status, adset_status, campaign_status, creative_id, thumbnail_url, image_url, video_id, media_hash, media_type, storage_url, primary_text, headline, description, spend, revenue, purchases, impressions, clicks, video_views, video_thruplay, video_p100, video_plays, outbound_clicks, date_start, campaign_daily_budget, campaign_lifetime_budget, adset_daily_budget, adset_lifetime_budget')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .limit(50000)

    const [adResult, mediaResult] = await Promise.all([
      adQuery,
      // CRITICAL: media_library does NOT have video_id column - do NOT add it here
      // CRITICAL: must use cleanAccountId (no act_ prefix), not adAccountId
      supabase
        .from('media_library')
        .select('media_hash, media_type, url, video_thumbnail_url, storage_url')
        .eq('user_id', userId)
        .eq('ad_account_id', cleanAccountId),
    ])

    if (adResult.error) {
      console.error('Error fetching ad_data:', adResult.error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    const rawData = adResult.data
    if (!rawData || rawData.length === 0) {
      return NextResponse.json({ ads: [] })
    }

    // Build media_library lookup by media_hash
    type MediaEntry = { storage_url: string | null; url: string | null; video_thumbnail_url: string | null; media_type: string }
    const mediaLookup = new Map<string, MediaEntry>()
    if (mediaResult.data) {
      for (const m of mediaResult.data) {
        if (m.media_hash) {
          mediaLookup.set(m.media_hash, {
            storage_url: m.storage_url,
            url: m.url,
            video_thumbnail_url: m.video_thumbnail_url,
            media_type: m.media_type,
          })
        }
      }
    }

    // Build video_id → storage_url lookup from ad_data rows that have storage_url
    // This handles derivatives: if one row for a video_id has storage_url, use it for all
    const videoIdToStorageUrl = new Map<string, string>()
    for (const row of rawData) {
      if (row.video_id && row.storage_url && !videoIdToStorageUrl.has(row.video_id)) {
        videoIdToStorageUrl.set(row.video_id, row.storage_url)
      }
    }

    // Build creative_id → original media_hash lookup (same pattern as dashboard)
    // Handles derivative video IDs where Meta assigns different media_hash per placement
    const creativeToOriginalHash = new Map<string, string>()
    for (const row of rawData) {
      if (row.media_hash && row.creative_id && mediaLookup.has(row.media_hash)) {
        creativeToOriginalHash.set(row.creative_id, row.media_hash)
      }
    }

    interface AdAgg {
      ad_id: string
      ad_name: string
      adset_id: string
      adset_name: string
      campaign_id: string
      campaign_name: string
      status: string
      adset_status: string
      campaign_status: string
      latestDate: string
      creative_id: string | null
      thumbnail_url: string | null
      image_url: string | null
      video_id: string | null
      media_hash: string | null
      media_type: string | null
      storage_url: string | null
      primary_text: string | null
      headline: string | null
      description: string | null
      spend: number
      revenue: number
      purchases: number
      impressions: number
      clicks: number
      videoViews: number
      videoThruplay: number
      videoP100: number
      videoPlays: number
      outboundClicks: number
      campaign_daily_budget: number | null
      campaign_lifetime_budget: number | null
      adset_daily_budget: number | null
      adset_lifetime_budget: number | null
    }

    const adMap = new Map<string, AdAgg>()

    // Helper to check if row is in date range (for metrics only)
    const isInDateRange = (rowDate: string) => {
      if (!startDate && !endDate) return true
      if (startDate && rowDate < startDate) return false
      if (endDate && rowDate > endDate) return false
      return true
    }

    for (const row of rawData) {
      if (!row.ad_id) continue

      if (!adMap.has(row.ad_id)) {
        adMap.set(row.ad_id, {
          ad_id: row.ad_id,
          ad_name: row.ad_name || 'Untitled',
          adset_id: row.adset_id || '',
          adset_name: row.adset_name || '',
          campaign_id: row.campaign_id || '',
          campaign_name: row.campaign_name || '',
          status: row.status || 'UNKNOWN',
          adset_status: row.adset_status || 'UNKNOWN',
          campaign_status: row.campaign_status || 'UNKNOWN',
          latestDate: row.date_start || '',
          creative_id: row.creative_id,
          thumbnail_url: row.thumbnail_url,
          image_url: row.image_url,
          video_id: row.video_id,
          media_hash: row.media_hash,
          media_type: row.media_type,
          storage_url: row.storage_url,
          primary_text: row.primary_text,
          headline: row.headline,
          description: row.description,
          spend: 0,
          revenue: 0,
          purchases: 0,
          impressions: 0,
          clicks: 0,
          videoViews: 0,
          videoThruplay: 0,
          videoP100: 0,
          videoPlays: 0,
          outboundClicks: 0,
          campaign_daily_budget: null,
          campaign_lifetime_budget: null,
          adset_daily_budget: null,
          adset_lifetime_budget: null,
        })
      }

      const agg = adMap.get(row.ad_id)!
      const rowDate = row.date_start || ''

      // Only aggregate metrics if row is in date range
      if (isInDateRange(rowDate)) {
        agg.spend += parseFloat(row.spend) || 0
        agg.revenue += parseFloat(row.revenue) || 0
        agg.purchases += row.purchases || 0
        agg.impressions += row.impressions || 0
        agg.clicks += row.clicks || 0
        agg.videoViews += row.video_views || 0
        agg.videoThruplay += row.video_thruplay || 0
        agg.videoP100 += row.video_p100 || 0
        agg.videoPlays += row.video_plays || 0
        agg.outboundClicks += row.outbound_clicks || 0
      }

      // Status and budget fields: always use the most recent date row (regardless of date range)
      if (rowDate >= agg.latestDate) {
        agg.latestDate = rowDate
        if (row.status && row.status !== 'UNKNOWN') agg.status = row.status
        if (row.adset_status && row.adset_status !== 'UNKNOWN') agg.adset_status = row.adset_status
        if (row.campaign_status && row.campaign_status !== 'UNKNOWN') agg.campaign_status = row.campaign_status
        // Budget fields from latest row
        if (row.campaign_daily_budget != null) agg.campaign_daily_budget = row.campaign_daily_budget
        if (row.campaign_lifetime_budget != null) agg.campaign_lifetime_budget = row.campaign_lifetime_budget
        if (row.adset_daily_budget != null) agg.adset_daily_budget = row.adset_daily_budget
        if (row.adset_lifetime_budget != null) agg.adset_lifetime_budget = row.adset_lifetime_budget
      }

      // Creative fields are static — promote from ANY row that has them
      if (row.thumbnail_url) agg.thumbnail_url = row.thumbnail_url
      if (row.image_url) agg.image_url = row.image_url
      if (row.media_hash) agg.media_hash = row.media_hash
      if (row.media_type) agg.media_type = row.media_type
      if (row.storage_url) agg.storage_url = row.storage_url
      if (row.video_id) agg.video_id = row.video_id
      if (row.primary_text) agg.primary_text = row.primary_text
      if (row.headline) agg.headline = row.headline
      if (row.description) agg.description = row.description
    }

    // Build current campaign and adset status maps from the MOST RECENT data globally
    // This ensures we use the freshest status even if an ad's own latest row is old
    const campaignCurrentStatus = new Map<string, string>()
    const adsetCurrentStatus = new Map<string, string>()
    const campaignLatestDate = new Map<string, string>()
    const adsetLatestDate = new Map<string, string>()

    for (const row of rawData) {
      const rowDate = row.date_start || ''

      // Track campaign status from most recent row
      if (row.campaign_id && row.campaign_status) {
        const prevDate = campaignLatestDate.get(row.campaign_id) || ''
        if (rowDate >= prevDate) {
          campaignLatestDate.set(row.campaign_id, rowDate)
          campaignCurrentStatus.set(row.campaign_id, row.campaign_status)
        }
      }

      // Track adset status from most recent row
      if (row.adset_id && row.adset_status) {
        const prevDate = adsetLatestDate.get(row.adset_id) || ''
        if (rowDate >= prevDate) {
          adsetLatestDate.set(row.adset_id, rowDate)
          adsetCurrentStatus.set(row.adset_id, row.adset_status)
        }
      }
    }

    // Return ALL ads, not just active ones - frontend will filter by status
    // An ad is considered "effectively active" if ad + adset + campaign are all ACTIVE
    // An ad is considered "effectively paused" if any of those are PAUSED
    const allAdsRaw = Array.from(adMap.values()).map(ad => {
      const currentAdsetStatus = adsetCurrentStatus.get(ad.adset_id) || ad.adset_status
      const currentCampaignStatus = campaignCurrentStatus.get(ad.campaign_id) || ad.campaign_status

      // Determine effective status: ACTIVE only if all three levels are ACTIVE
      const isEffectivelyActive =
        ad.status === 'ACTIVE' &&
        currentAdsetStatus === 'ACTIVE' &&
        currentCampaignStatus === 'ACTIVE'

      return {
        ...ad,
        effectiveStatus: isEffectivelyActive ? 'ACTIVE' : 'PAUSED',
        adset_status: currentAdsetStatus,
        campaign_status: currentCampaignStatus,
      }
    })

    // For budget calculation, only consider effectively active ads
    const activeAdsRaw = allAdsRaw.filter(ad => ad.effectiveStatus === 'ACTIVE')

    // Calculate total daily budget (deduplicated by campaign for CBO, by adset for ABO)
    const cboCampaigns = new Map<string, number>() // campaign_id -> daily_budget
    const aboAdsets = new Map<string, number>() // adset_id -> daily_budget

    for (const ad of activeAdsRaw) {
      const hasCampaignBudget = ad.campaign_daily_budget || ad.campaign_lifetime_budget
      const hasAdsetBudget = ad.adset_daily_budget || ad.adset_lifetime_budget
      const isAbo = hasAdsetBudget && !hasCampaignBudget

      if (isAbo) {
        // ABO: budget at adset level
        if (ad.adset_daily_budget && !aboAdsets.has(ad.adset_id)) {
          aboAdsets.set(ad.adset_id, ad.adset_daily_budget)
        }
      } else if (hasCampaignBudget) {
        // CBO: budget at campaign level
        if (ad.campaign_daily_budget && !cboCampaigns.has(ad.campaign_id)) {
          cboCampaigns.set(ad.campaign_id, ad.campaign_daily_budget)
        }
      }
    }

    const totalDailyBudget =
      Array.from(cboCampaigns.values()).reduce((sum, b) => sum + b, 0) +
      Array.from(aboAdsets.values()).reduce((sum, b) => sum + b, 0)

    // Return ALL ads (not just active) so frontend can filter by status
    const ads = allAdsRaw.map(({ latestDate: _, adset_status: _as, campaign_status: _cs, effectiveStatus, ...ad }) => {
        const roas = ad.spend > 0 ? Math.round((ad.revenue / ad.spend) * 100) / 100 : 0
        const ctr = ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions * 100) * 10000) / 10000 : 0
        const cpc = ad.clicks > 0 ? Math.round((ad.spend / ad.clicks) * 100) / 100 : 0
        const cpm = ad.impressions > 0 ? Math.round((ad.spend / ad.impressions * 1000) * 100) / 100 : 0
        const cpa = ad.purchases > 0 ? Math.round((ad.spend / ad.purchases) * 100) / 100 : 0
        const aov = ad.purchases > 0 ? Math.round((ad.revenue / ad.purchases) * 100) / 100 : 0

        const isVideo = ad.media_type === 'video' || !!ad.video_id
        const thumbstopRate = isVideo && ad.impressions > 0
          ? Math.round((ad.videoViews / ad.impressions * 100) * 100) / 100
          : null
        const holdRate = isVideo && ad.videoViews > 0
          ? Math.round((ad.videoThruplay / ad.videoViews * 100) * 100) / 100
          : null
        const completionRate = isVideo && ad.impressions > 0
          ? Math.round((ad.videoP100 / ad.impressions * 100) * 100) / 100
          : null

        const scores = calculateCompositeScores(ad.spend, roas, ctr, cpc, ad.impressions, isVideo, thumbstopRate, holdRate, completionRate)

        // Resolve URLs — waterfall:
        // 1. Direct match by media_hash in media_library
        // 1.5. Try video_id as media_hash (original videos in media_library use video_id as media_hash,
        //       but derivative ads get a different media_hash per placement)
        // 2. Fallback via creative_id
        // 3. Use ad.storage_url from ad_data
        // 4. Fallback via video_id from other ad_data rows
        let media = ad.media_hash ? mediaLookup.get(ad.media_hash) : undefined
        if (!media && ad.video_id) {
          media = mediaLookup.get(ad.video_id)
        }
        if (!media && ad.creative_id) {
          const originalHash = creativeToOriginalHash.get(ad.creative_id)
          if (originalHash) media = mediaLookup.get(originalHash)
        }

        // Resolve storage URL with video_id fallback
        let resolvedStorageUrl = media?.storage_url || ad.storage_url || null
        if (!resolvedStorageUrl && ad.video_id) {
          resolvedStorageUrl = videoIdToStorageUrl.get(ad.video_id) || null
        }


        return {
          ...ad,
          // Override status with effective status (considers parent campaign/adset)
          status: effectiveStatus,
          roas,
          ctr,
          cpc,
          cpm,
          cpa,
          aov,
          // Same three fields the media API returns per asset
          // Falls back to ad_data columns, then video_id lookup for derivatives
          // For videos with storageUrl: omit low-res ad.thumbnail_url so MediaGalleryCard
          // uses <video src={storageUrl}#t=0.3> for a sharp poster frame
          storageUrl: resolvedStorageUrl,
          imageUrl: isVideo ? null : (media?.url || ad.image_url || null),
          // Videos with storageUrl: return null so MediaGalleryCard uses <video #t=0.3> for sharp frame
          // Videos without storageUrl: try media_library high-res thumbnail, then low-res ad.thumbnail_url
          thumbnailUrl: isVideo
            ? (resolvedStorageUrl ? null : (media?.video_thumbnail_url || ad.thumbnail_url || null))
            : (ad.thumbnail_url || ad.image_url || null),
          thumbstopRate,
          holdRate,
          completionRate,
          hookScore: scores.hookScore,
          holdScore: scores.holdScore,
          clickScore: scores.clickScore,
          convertScore: scores.convertScore,
        }
      })
      .sort((a, b) => b.spend - a.spend)

    return NextResponse.json({ ads, totalDailyBudget })
  } catch (err) {
    console.error('Active ads GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch active ads' }, { status: 500 })
  }
}
