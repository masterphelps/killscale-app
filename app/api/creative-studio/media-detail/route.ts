import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'
import type { DailyMetrics, AudiencePerformance, FatigueStatus } from '@/components/creative-studio/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function calculateFatigueStatus(
  daysActive: number,
  roasDecline: number,
  ctrDecline: number
): FatigueStatus {
  const declineScore = roasDecline * 0.6 + ctrDecline * 0.4
  if (daysActive < 3) return 'fresh'
  if (declineScore < 0.1 && daysActive < 14) return 'healthy'
  if (declineScore < 0.2 || daysActive < 21) return 'warning'
  if (declineScore < 0.35 || daysActive < 30) return 'fatiguing'
  return 'fatigued'
}

// GET - Unified media detail: asset metadata + hierarchy + performance detail
// Returns StudioAssetDetail (inventory + performance in one response)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const mediaHash = searchParams.get('mediaHash')

    if (!userId || !adAccountId || !mediaHash) {
      return NextResponse.json({ error: 'Missing required parameters: userId, adAccountId, mediaHash' }, { status: 400 })
    }

    const strippedAccountId = adAccountId.replace(/^act_/, '')

    // 1. Get media metadata from media_library
    const { data: mediaItem } = await supabase
      .from('media_library')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', strippedAccountId)
      .eq('media_hash', mediaHash)
      .single()

    // If not in media_library, try to build a stub from ad_data (Active Ads uses hashes not in media_library)
    let mediaStub: any = mediaItem
    if (!mediaItem) {
      // Try media_hash first, then video_id (mediaHash from frontend may be either)
      let adRow: any = null

      // Prefer rows with storage_url (actual Supabase video)
      const { data: hashRow } = await supabase
        .from('ad_data')
        .select('media_hash, media_type, ad_name, thumbnail_url, storage_url, video_id')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('media_hash', mediaHash)
        .order('storage_url', { ascending: false, nullsFirst: false })
        .limit(1)
        .single()
      adRow = hashRow

      if (!adRow) {
        // Try matching by video_id
        const { data: vidRow } = await supabase
          .from('ad_data')
          .select('media_hash, media_type, ad_name, thumbnail_url, storage_url, video_id')
          .eq('user_id', userId)
          .eq('ad_account_id', adAccountId)
          .eq('video_id', mediaHash)
          .order('storage_url', { ascending: false, nullsFirst: false })
          .limit(1)
          .single()
        adRow = vidRow
      }

      if (!adRow) {
        return NextResponse.json({ error: 'Media item not found' }, { status: 404 })
      }

      mediaStub = {
        media_hash: adRow.media_hash || mediaHash,
        media_type: adRow.media_type || 'video',
        name: adRow.ad_name || 'Untitled',
        storage_url: adRow.storage_url || null,
        video_thumbnail_url: adRow.storage_url || null,  // Use video URL — browser shows first frame
        video_id: adRow.video_id || null,
        url: null,
        width: null,
        height: null,
        created_at: null,
      }
    }

    // 2. Get all ad_data rows for this media (including derivatives across all campaigns)
    // Same approach as the media gallery endpoint: find ALL creative_ids that use this
    // media_hash or any derivative of it, then fetch all rows for those creatives.

    // Step A: Find all creative_ids that reference this media via media_hash or video_id
    const creativeIds = new Set<string>()

    // Direct media_hash match
    const { data: hashMatchRows } = await supabase
      .from('ad_data')
      .select('creative_id')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('media_hash', mediaHash)
      .not('creative_id', 'is', null)
      .limit(200)

    if (hashMatchRows) {
      for (const row of hashMatchRows) creativeIds.add(row.creative_id)
    }

    // video_id match (Meta stores video_id separately, may differ from media_hash)
    const { data: videoMatchRows } = await supabase
      .from('ad_data')
      .select('creative_id')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('video_id', mediaHash)
      .not('creative_id', 'is', null)
      .limit(200)

    if (videoMatchRows) {
      for (const row of videoMatchRows) creativeIds.add(row.creative_id)
    }

    // Step B: For those creative_ids, find ALL media_hashes (some may be derivatives)
    // Then find OTHER creative_ids that share those hashes — covers different ads
    // in different campaigns using the same underlying video
    if (creativeIds.size > 0) {
      const { data: siblingRows } = await supabase
        .from('ad_data')
        .select('creative_id, media_hash')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .in('creative_id', Array.from(creativeIds))
        .not('media_hash', 'is', null)
        .limit(500)

      if (siblingRows) {
        // Collect all hashes used by known creatives
        const allHashes = new Set<string>()
        for (const row of siblingRows) {
          allHashes.add(row.media_hash)
        }

        // Find any OTHER creative_ids that use those same hashes
        if (allHashes.size > 0) {
          const { data: crossRows } = await supabase
            .from('ad_data')
            .select('creative_id')
            .eq('user_id', userId)
            .eq('ad_account_id', adAccountId)
            .in('media_hash', Array.from(allHashes))
            .not('creative_id', 'is', null)
            .limit(500)

          if (crossRows) {
            for (const row of crossRows) creativeIds.add(row.creative_id)
          }
        }
      }
    }

    // Step C: Fetch ALL ad_data rows for all discovered creative_ids
    let allAdData: any[] = []

    if (creativeIds.size > 0) {
      const { data: creativeRows } = await supabase
        .from('ad_data')
        .select('*')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .in('creative_id', Array.from(creativeIds))
        .order('date_start', { ascending: true })

      if (creativeRows) {
        allAdData = creativeRows
      }
    }

    // Step D: Full gallery-style derivative resolution
    // When sync-media hasn't resolved derivatives, no ad_data row matches the
    // media_library hash. Replicate the gallery endpoint's full resolution:
    // aggregate spend per derivative hash, then match unmatched derivatives to
    // unmatched inventory videos using the same spend-ordered assignment.
    if (allAdData.length === 0 && mediaStub.media_type === 'video') {
      // Fetch all video ad_data for this account (same dataset the gallery uses)
      const { data: allVideoData } = await supabase
        .from('ad_data')
        .select('creative_id, media_hash, spend, ad_id, adset_id, campaign_id, video_views')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('media_type', 'video')
        .limit(50000)

      if (allVideoData && allVideoData.length > 0) {
        // Get inventory in same order as gallery (synced_at desc)
        const { data: inventoryItems } = await supabase
          .from('media_library')
          .select('media_hash')
          .eq('user_id', userId)
          .eq('ad_account_id', strippedAccountId)
          .eq('media_type', 'video')
          .order('synced_at', { ascending: false })

        const inventoryHashes = new Set(inventoryItems?.map(m => m.media_hash) || [])
        const inventoryOrder = inventoryItems?.map(m => m.media_hash) || []

        // Build creative_id → hashes + derivative→original via creative_id linkage
        const creativeHashMap = new Map<string, Set<string>>()
        for (const row of allVideoData) {
          if (!row.creative_id || !row.media_hash) continue
          if (!creativeHashMap.has(row.creative_id)) {
            creativeHashMap.set(row.creative_id, new Set())
          }
          creativeHashMap.get(row.creative_id)!.add(row.media_hash)
        }

        const derivToOriginal = new Map<string, string>()
        for (const [, hashes] of Array.from(creativeHashMap)) {
          const hashArray = Array.from(hashes)
          const origHash = hashArray.find(h => inventoryHashes.has(h))
          if (origHash) {
            for (const h of hashArray) {
              if (h !== origHash) derivToOriginal.set(h, origHash)
            }
          }
        }

        // Aggregate spend per resolved hash and track creative_ids
        const hashSpend = new Map<string, number>()
        const hashCreatives = new Map<string, Set<string>>()
        const hashHasVideo = new Map<string, boolean>()
        for (const row of allVideoData) {
          if (!row.media_hash) continue
          const resolved = derivToOriginal.get(row.media_hash) || row.media_hash
          hashSpend.set(resolved, (hashSpend.get(resolved) || 0) + (parseFloat(row.spend) || 0))
          if (row.creative_id) {
            if (!hashCreatives.has(resolved)) hashCreatives.set(resolved, new Set())
            hashCreatives.get(resolved)!.add(row.creative_id)
          }
          if (row.video_views) hashHasVideo.set(resolved, true)
        }

        // Check if creative_id linkage resolved derivatives to our hash
        if (hashSpend.has(mediaHash) && (hashSpend.get(mediaHash) || 0) > 0) {
          const cids = hashCreatives.get(mediaHash)
          if (cids) Array.from(cids).forEach(cid => creativeIds.add(cid))
        }

        // Last resort: match unmatched derivatives to unmatched inventory by spend order
        // (same heuristic as gallery endpoint lines 400-436)
        if (creativeIds.size === 0) {
          // Unmatched derivative hashes with video data
          const unmatchedDerivs = new Map<string, { spend: number; creatives: Set<string> }>()
          for (const [hash, spend] of Array.from(hashSpend)) {
            if (!inventoryHashes.has(hash) && hashHasVideo.get(hash)) {
              unmatchedDerivs.set(hash, {
                spend,
                creatives: hashCreatives.get(hash) || new Set(),
              })
            }
          }

          // Unmatched inventory videos (no perf data mapped to them)
          const matchedInventory = new Set<string>()
          for (const hash of Array.from(hashSpend.keys())) {
            if (inventoryHashes.has(hash)) matchedInventory.add(hash)
          }
          const unmatchedInventory = inventoryOrder.filter(h => !matchedInventory.has(h))

          if (unmatchedDerivs.size > 0 && unmatchedInventory.length > 0) {
            // Sort derivatives by spend descending (same as gallery)
            const derivEntries = Array.from(unmatchedDerivs.entries())
              .sort(([, a], [, b]) => b.spend - a.spend)
            const libraryVideos = [...unmatchedInventory]

            for (const [, derivData] of derivEntries) {
              if (libraryVideos.length === 0) break
              const targetHash = libraryVideos.shift()!
              // If this derivative maps to our mediaHash, use its creative_ids
              if (targetHash === mediaHash) {
                Array.from(derivData.creatives).forEach(cid => creativeIds.add(cid))
                break // Found our match
              }
            }
          }
        }

        // Fetch full ad_data for discovered creative_ids
        if (creativeIds.size > 0) {
          const { data: fallbackRows } = await supabase
            .from('ad_data')
            .select('*')
            .eq('user_id', userId)
            .eq('ad_account_id', adAccountId)
            .in('creative_id', Array.from(creativeIds))
            .order('date_start', { ascending: true })

          if (fallbackRows) {
            allAdData = fallbackRows
          }
        }
      }
    }

    // 3. Aggregate daily metrics (including video data)
    const dailyMap = new Map<string, DailyMetrics & { _videoViews: number; _videoThruplay: number; _videoP100: number }>()

    for (const row of allAdData) {
      const date = row.date_start
      const existing = dailyMap.get(date) || {
        date,
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpm: 0,
        thumbstopRate: null,
        holdRate: null,
        _videoViews: 0,
        _videoThruplay: 0,
        _videoP100: 0,
      }

      existing.spend += row.spend || 0
      existing.revenue += row.revenue || 0
      existing.impressions += row.impressions || 0
      existing.clicks += row.clicks || 0
      existing._videoViews += row.video_views || 0
      existing._videoThruplay += row.video_thruplay || 0
      existing._videoP100 += row.video_p100 || 0

      dailyMap.set(date, existing)
    }

    // Calculate derived metrics for daily data
    const dailyData: DailyMetrics[] = Array.from(dailyMap.values()).map(d => ({
      date: d.date,
      spend: d.spend,
      revenue: d.revenue,
      impressions: d.impressions,
      clicks: d.clicks,
      roas: d.spend > 0 ? d.revenue / d.spend : 0,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
      thumbstopRate: d._videoViews > 0 && d.impressions > 0
        ? Math.round((d._videoViews / d.impressions * 100) * 100) / 100
        : null,
      holdRate: d._videoViews > 0 && d._videoThruplay > 0
        ? Math.round((d._videoThruplay / d._videoViews * 100) * 100) / 100
        : null,
    })).sort((a, b) => a.date.localeCompare(b.date))

    // 4. Calculate early vs recent periods
    const midpoint = Math.floor(dailyData.length / 2)
    const earlyDays = dailyData.slice(0, midpoint)
    const recentDays = dailyData.slice(midpoint)

    const sumMetrics = (days: DailyMetrics[]) => {
      const totals = days.reduce(
        (acc, d) => ({
          spend: acc.spend + d.spend,
          revenue: acc.revenue + d.revenue,
          impressions: acc.impressions + d.impressions,
          clicks: acc.clicks + d.clicks,
          videoViews: acc.videoViews + (d.thumbstopRate !== null && d.thumbstopRate !== undefined && d.impressions > 0 ? d.thumbstopRate / 100 * d.impressions : 0),
          videoThruplay: acc.videoThruplay + (d.holdRate !== null && d.holdRate !== undefined && d.thumbstopRate !== null && d.thumbstopRate !== undefined && d.impressions > 0 ? d.holdRate / 100 * (d.thumbstopRate / 100 * d.impressions) : 0),
        }),
        { spend: 0, revenue: 0, impressions: 0, clicks: 0, videoViews: 0, videoThruplay: 0 }
      )

      const hasVideo = totals.videoViews > 0

      return {
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        ...(hasVideo ? {
          thumbstopRate: totals.impressions > 0 ? (totals.videoViews / totals.impressions) * 100 : 0,
          holdRate: totals.videoViews > 0 ? (totals.videoThruplay / totals.videoViews) * 100 : 0,
        } : {}),
      }
    }

    const earlyPeriod = earlyDays.length > 0 ? sumMetrics(earlyDays) : { roas: 0, ctr: 0, cpm: 0 }
    const recentPeriod = recentDays.length > 0 ? sumMetrics(recentDays) : { roas: 0, ctr: 0, cpm: 0 }

    // 5. Audience performance (by adset)
    const adsetMap = new Map<string, {
      adsetId: string
      adsetName: string
      spend: number
      revenue: number
      impressions: number
      clicks: number
      firstSeen: string
      lastSeen: string
    }>()

    for (const row of allAdData) {
      const adsetId = row.adset_id
      if (!adsetId) continue

      const existing = adsetMap.get(adsetId) || {
        adsetId,
        adsetName: row.adset_name || 'Unknown Ad Set',
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        firstSeen: row.date_start,
        lastSeen: row.date_start,
      }

      existing.spend += row.spend || 0
      existing.revenue += row.revenue || 0
      existing.impressions += row.impressions || 0
      existing.clicks += row.clicks || 0
      if (row.date_start < existing.firstSeen) existing.firstSeen = row.date_start
      if (row.date_start > existing.lastSeen) existing.lastSeen = row.date_start

      adsetMap.set(adsetId, existing)
    }

    const audiencePerformance: AudiencePerformance[] = Array.from(adsetMap.values()).map(a => {
      const roas = a.spend > 0 ? a.revenue / a.spend : 0
      const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0
      const daysActive = Math.ceil(
        (new Date(a.lastSeen).getTime() - new Date(a.firstSeen).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1

      const roasDecline = earlyPeriod.roas > 0 ? Math.max(0, (earlyPeriod.roas - roas) / earlyPeriod.roas) : 0
      const ctrDecline = earlyPeriod.ctr > 0 ? Math.max(0, (earlyPeriod.ctr - ctr) / earlyPeriod.ctr) : 0

      return {
        adsetId: a.adsetId,
        adsetName: a.adsetName,
        spend: a.spend,
        revenue: a.revenue,
        roas,
        fatigueStatus: calculateFatigueStatus(daysActive, roasDecline, ctrDecline),
      }
    }).sort((a, b) => b.spend - a.spend)

    // 6. (Removed — copy variations not applicable to media-level detail)

    // 7. Individual ads list
    const adsMap = new Map<string, {
      adId: string
      adName: string
      adsetName: string
      campaignName: string
      status: string
      spend: number
      revenue: number
    }>()

    for (const row of allAdData) {
      const adId = row.ad_id
      if (!adId) continue

      const existing = adsMap.get(adId) || {
        adId,
        adName: row.ad_name || 'Unknown Ad',
        adsetName: row.adset_name || 'Unknown Ad Set',
        campaignName: row.campaign_name || 'Unknown Campaign',
        status: row.status || 'UNKNOWN',
        spend: 0,
        revenue: 0,
      }

      existing.spend += row.spend || 0
      existing.revenue += row.revenue || 0

      adsMap.set(adId, existing)
    }

    const ads = Array.from(adsMap.values()).map(a => ({
      ...a,
      roas: a.spend > 0 ? a.revenue / a.spend : 0,
    })).sort((a, b) => b.spend - a.spend)

    // 8. Build hierarchy: Campaign → AdSet → Ad (from the ads we already have)
    const campaignHierarchyMap = new Map<string, {
      campaignId: string
      campaignName: string
      adsets: Map<string, {
        adsetId: string
        adsetName: string
        ads: Map<string, { adId: string; adName: string; status: string }>
      }>
    }>()

    for (const row of allAdData) {
      if (!row.campaign_id) continue

      if (!campaignHierarchyMap.has(row.campaign_id)) {
        campaignHierarchyMap.set(row.campaign_id, {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name || row.campaign_id,
          adsets: new Map()
        })
      }
      const campaign = campaignHierarchyMap.get(row.campaign_id)!

      if (row.adset_id && !campaign.adsets.has(row.adset_id)) {
        campaign.adsets.set(row.adset_id, {
          adsetId: row.adset_id,
          adsetName: row.adset_name || row.adset_id,
          ads: new Map()
        })
      }

      if (row.adset_id && row.ad_id) {
        const adset = campaign.adsets.get(row.adset_id)!
        if (!adset.ads.has(row.ad_id)) {
          adset.ads.set(row.ad_id, {
            adId: row.ad_id,
            adName: row.ad_name || row.ad_id,
            status: row.status || 'UNKNOWN'
          })
        }
      }
    }

    const hierarchy = Array.from(campaignHierarchyMap.values()).map(c => ({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      adsets: Array.from(c.adsets.values()).map(as => ({
        adsetId: as.adsetId,
        adsetName: as.adsetName,
        ads: Array.from(as.ads.values())
      }))
    }))

    // 9. Video source for playback
    let videoSource: string | null = null

    if (mediaStub.media_type === 'video') {
      // Prefer storage URL
      if (mediaStub.storage_url) {
        videoSource = mediaStub.storage_url
      } else {
        // Fallback: fetch from Meta API
        const videoRow = allAdData.find(row => row.video_id)
        if (videoRow?.video_id) {
          try {
            const { data: conn } = await supabase
              .from('meta_connections')
              .select('access_token, token_expires_at')
              .eq('user_id', userId)
              .single()

            if (conn && new Date(conn.token_expires_at) > new Date()) {
              const videoUrl = `${META_GRAPH_URL}/${videoRow.video_id}?fields=source&access_token=${conn.access_token}`
              const videoRes = await fetch(videoUrl)
              const videoData = await videoRes.json()
              if (videoData.source) {
                videoSource = videoData.source
              }
            }
          } catch (e) {
            console.error('[Media Detail] Error fetching video source:', e)
          }
        }
      }
    }

    // 10. Return unified StudioAssetDetail
    return NextResponse.json({
      media: {
        mediaHash: mediaStub.media_hash,
        mediaType: mediaStub.media_type,
        name: mediaStub.name,
        width: mediaStub.width,
        height: mediaStub.height,
        fileSize: mediaStub.file_size_bytes,
        storageUrl: mediaStub.storage_url,
        imageUrl: mediaStub.url,
        thumbnailUrl: mediaStub.video_thumbnail_url,
        syncedAt: mediaStub.synced_at,
      },
      dailyData,
      earlyPeriod,
      recentPeriod,
      audiencePerformance,
      copyVariations: [],
      ads,
      hierarchy,
      videoSource,
      totalAds: allAdData ? new Set(allAdData.map(r => r.ad_id).filter(Boolean)).size : 0,
      totalAdsets: adsetMap.size,
      totalCampaigns: campaignHierarchyMap.size,
    })

  } catch (err) {
    console.error('Creative Studio media-detail GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch media detail' }, { status: 500 })
  }
}
