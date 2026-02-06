import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateFatigueScore, calculateCompositeScores, type FatigueStatus } from '@/lib/creative-scores'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Unified media endpoint: inventory from media_library + performance from ad_data
// Aggregates by media_hash (not creative_id) — one entity per visual asset
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const mediaTypeFilter = searchParams.get('mediaType')
    const fatigueStatusFilter = searchParams.get('fatigueStatus')
    const minSpend = parseFloat(searchParams.get('minSpend') || '0')
    const hasDataFilter = searchParams.get('hasData') // 'all' | 'with_spend' | 'unused'
    const sortBy = searchParams.get('sortBy') || 'spend'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters: userId and adAccountId' }, { status: 400 })
    }

    const strippedAccountId = adAccountId.replace(/^act_/, '')

    // 1. Query media_library — the inventory source of truth
    let mediaQuery = supabase
      .from('media_library')
      .select('id, media_hash, media_type, name, url, video_thumbnail_url, width, height, storage_url, storage_path, download_status, file_size_bytes, synced_at')
      .eq('user_id', userId)
      .eq('ad_account_id', strippedAccountId)
      .order('synced_at', { ascending: false })

    if (mediaTypeFilter && mediaTypeFilter !== 'all') {
      mediaQuery = mediaQuery.eq('media_type', mediaTypeFilter)
    }

    const { data: mediaItems, error: mediaError } = await mediaQuery

    if (mediaError) {
      console.error('Error fetching media_library:', mediaError)
      return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
    }

    if (!mediaItems || mediaItems.length === 0) {
      return NextResponse.json({ assets: [], videoCount: 0, imageCount: 0 })
    }

    // 2. Query ad_data for this account to aggregate performance by media_hash
    // With append-only sync (date_preset=maximum), ad_data can have tens of thousands of daily rows.
    // Supabase PostgREST defaults to 1000 rows — must override to get full dataset.
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let adQuery = supabase
      .from('ad_data')
      .select('media_hash, creative_id, ad_id, adset_id, campaign_id, spend, revenue, impressions, clicks, date_start, date_end, video_views, video_thruplay, video_p100, video_avg_time_watched, video_plays, outbound_clicks, video_id, thumbnail_url, media_type')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId) // ad_data uses act_ prefix
      .limit(50000)

    if (startDate) adQuery = adQuery.gte('date_start', startDate)
    if (endDate) adQuery = adQuery.lte('date_start', endDate)

    const { data: rawAdData, error: adError } = await adQuery

    if (adError) {
      console.error('Error fetching ad_data:', adError)
      // Continue without performance data — return inventory only
    }

    // 2b. Build creative_id → media_hash lookup from rows that have both fields.
    // Fallback for any rows where media_hash is missing but creative_id is present.
    const creativeToMediaHash = new Map<string, string>()
    if (rawAdData) {
      for (const row of rawAdData) {
        if (row.creative_id && row.media_hash && !creativeToMediaHash.has(row.creative_id)) {
          creativeToMediaHash.set(row.creative_id, row.media_hash)
        }
      }
    }

    // 3. Build a map of media_hash → original hashes from media_library
    const inventoryHashes = new Set(mediaItems.map(m => m.media_hash))

    // 4. Handle video derivatives: map derivative hashes to original via creative_id linkage
    // ad_data may have derivative hashes (Meta assigns per placement).
    // We need to map those back to the original media_hash in media_library.
    const derivativeToOriginal = new Map<string, string>()
    const creativeIdToHashes = new Map<string, Set<string>>()

    if (rawAdData) {
      // Collect creative_id → set of media_hashes
      for (const row of rawAdData) {
        if (!row.creative_id || !row.media_hash) continue
        if (!creativeIdToHashes.has(row.creative_id)) {
          creativeIdToHashes.set(row.creative_id, new Set())
        }
        creativeIdToHashes.get(row.creative_id)!.add(row.media_hash)
      }

      // For each creative_id, if any hash is in inventory, map all others to it
      const allHashSets = Array.from(creativeIdToHashes.values())
      for (const hashes of allHashSets) {
        const hashArray = Array.from(hashes)
        const originalHash = hashArray.find(h => inventoryHashes.has(h))
        if (originalHash) {
          for (const h of hashArray) {
            if (h !== originalHash) {
              derivativeToOriginal.set(h, originalHash)
            }
          }
        }
      }
    }

    // 5. Aggregate ad_data by resolved media_hash
    // NOTE: We aggregate ALL rows (not just inventory matches) so that video derivatives
    // with metrics are captured. We'll link them to media_library items in step 5b.
    interface HashAggregation {
      adIds: Set<string>
      adsetIds: Set<string>
      campaignIds: Set<string>
      spend: number
      revenue: number
      impressions: number
      clicks: number
      firstDate: string
      lastDate: string
      dailyData: Array<{ date: string; spend: number; revenue: number; impressions: number; clicks: number }>
      // Video accumulators
      videoViews: number
      videoThruplay: number
      videoP100: number
      videoPlays: number
      outboundClicks: number
      videoAvgTimeWeightedSum: number
      videoAvgTimeWeight: number
      hasVideoData: boolean
    }

    const perfMap = new Map<string, HashAggregation>()

    if (rawAdData) {
      for (const row of rawAdData) {
        // Resolve media_hash: direct value, or via creative_id fallback for historical rows
        const effectiveHash = row.media_hash || (row.creative_id ? creativeToMediaHash.get(row.creative_id) ?? null : null)
        if (!effectiveHash) continue

        // Resolve to original hash (if mapping found in step 4)
        const resolvedHash = derivativeToOriginal.get(effectiveHash) || effectiveHash

        if (!perfMap.has(resolvedHash)) {
          perfMap.set(resolvedHash, {
            adIds: new Set(),
            adsetIds: new Set(),
            campaignIds: new Set(),
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            firstDate: row.date_start,
            lastDate: row.date_end || row.date_start,
            dailyData: [],
            videoViews: 0,
            videoThruplay: 0,
            videoP100: 0,
            videoPlays: 0,
            outboundClicks: 0,
            videoAvgTimeWeightedSum: 0,
            videoAvgTimeWeight: 0,
            hasVideoData: false,
          })
        }

        const agg = perfMap.get(resolvedHash)!
        agg.spend += parseFloat(row.spend) || 0
        agg.revenue += parseFloat(row.revenue) || 0
        agg.impressions += row.impressions || 0
        agg.clicks += row.clicks || 0

        if (row.ad_id) agg.adIds.add(row.ad_id)
        if (row.adset_id) agg.adsetIds.add(row.adset_id)
        if (row.campaign_id) agg.campaignIds.add(row.campaign_id)

        // Video metrics
        if (row.video_views) { agg.videoViews += row.video_views; agg.hasVideoData = true }
        if (row.video_thruplay) agg.videoThruplay += row.video_thruplay
        if (row.video_p100) agg.videoP100 += row.video_p100
        if (row.video_plays) agg.videoPlays += row.video_plays
        if (row.outbound_clicks) agg.outboundClicks += row.outbound_clicks
        if (row.video_avg_time_watched && row.impressions) {
          agg.videoAvgTimeWeightedSum += parseFloat(row.video_avg_time_watched) * row.impressions
          agg.videoAvgTimeWeight += row.impressions
        }

        // Date range
        if (row.date_start < agg.firstDate) agg.firstDate = row.date_start
        if ((row.date_end || row.date_start) > agg.lastDate) agg.lastDate = row.date_end || row.date_start

        // Daily data for fatigue
        agg.dailyData.push({
          date: row.date_start,
          spend: parseFloat(row.spend) || 0,
          revenue: parseFloat(row.revenue) || 0,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
        })
      }
    }

    // 5b. Video derivative fallback: for media_library video items with no perfMap match,
    // find derivative hashes via creative_id linkage.
    // Meta assigns derivative video IDs per placement — the same creative can have rows
    // with hash=derivative (NOT in media_library) and hash=original (IN media_library).
    // If step 4's mapping missed these (e.g. all rows for a creative have the same derivative),
    // do a broader search: find all creative_ids whose rows have video hashes NOT in inventory,
    // then query ad_data for ALL hashes those creative_ids ever had across all rows.
    const unmatchedVideoHashes = new Set<string>()
    for (const [hash] of Array.from(perfMap.entries())) {
      if (!inventoryHashes.has(hash)) {
        unmatchedVideoHashes.add(hash)
      }
    }

    if (unmatchedVideoHashes.size > 0 && rawAdData) {
      // Collect creative_ids that produced unmatched hashes
      const creativesNeedingFallback = new Set<string>()
      for (const row of rawAdData) {
        if (row.creative_id && row.media_hash && unmatchedVideoHashes.has(row.media_hash)) {
          creativesNeedingFallback.add(row.creative_id)
        }
      }

      if (creativesNeedingFallback.size > 0) {
        // Query ad_data for ALL media_hash values these creative_ids have ever had
        // (across all dates — some rows may have the original hash from older syncs)
        const { data: fallbackRows } = await supabase
          .from('ad_data')
          .select('creative_id, media_hash')
          .eq('user_id', userId)
          .eq('ad_account_id', adAccountId)
          .in('creative_id', Array.from(creativesNeedingFallback))
          .not('media_hash', 'is', null)

        if (fallbackRows) {
          // Group all hashes by creative_id
          const creativeAllHashes = new Map<string, Set<string>>()
          for (const row of fallbackRows) {
            if (!row.creative_id || !row.media_hash) continue
            if (!creativeAllHashes.has(row.creative_id)) {
              creativeAllHashes.set(row.creative_id, new Set())
            }
            creativeAllHashes.get(row.creative_id)!.add(row.media_hash)
          }

          // For each creative, if any hash is in inventory, merge derivative perf into original
          for (const [, hashes] of Array.from(creativeAllHashes.entries())) {
            const hashArray = Array.from(hashes)
            const originalHash = hashArray.find(h => inventoryHashes.has(h))
            if (!originalHash) continue

            for (const derivHash of hashArray) {
              if (derivHash === originalHash) continue
              const derivPerf = perfMap.get(derivHash)
              if (!derivPerf) continue

              // Merge derivative's perf data into the original's entry
              if (!perfMap.has(originalHash)) {
                // Move the derivative entry to the original key
                perfMap.set(originalHash, derivPerf)
              } else {
                // Merge into existing original entry
                const orig = perfMap.get(originalHash)!
                orig.spend += derivPerf.spend
                orig.revenue += derivPerf.revenue
                orig.impressions += derivPerf.impressions
                orig.clicks += derivPerf.clicks
                derivPerf.adIds.forEach(id => orig.adIds.add(id))
                derivPerf.adsetIds.forEach(id => orig.adsetIds.add(id))
                derivPerf.campaignIds.forEach(id => orig.campaignIds.add(id))
                orig.videoViews += derivPerf.videoViews
                orig.videoThruplay += derivPerf.videoThruplay
                orig.videoP100 += derivPerf.videoP100
                orig.videoPlays += derivPerf.videoPlays
                orig.outboundClicks += derivPerf.outboundClicks
                orig.videoAvgTimeWeightedSum += derivPerf.videoAvgTimeWeightedSum
                orig.videoAvgTimeWeight += derivPerf.videoAvgTimeWeight
                if (derivPerf.hasVideoData) orig.hasVideoData = true
                if (derivPerf.firstDate < orig.firstDate) orig.firstDate = derivPerf.firstDate
                if (derivPerf.lastDate > orig.lastDate) orig.lastDate = derivPerf.lastDate
                orig.dailyData.push(...derivPerf.dailyData)
              }
              // Remove the derivative entry
              perfMap.delete(derivHash)
            }
          }
        }
      }

      // Last resort: if there are STILL unmatched video hashes with perf data and
      // media_library video items with NO perf data, match them 1-to-1 by media_type.
      // This handles the case where ALL rows for a creative have only the derivative hash
      // (no original hash exists in ad_data at all).
      const remainingUnmatched = new Map<string, HashAggregation>()
      for (const [hash, perf] of Array.from(perfMap.entries())) {
        if (!inventoryHashes.has(hash) && perf.hasVideoData) {
          remainingUnmatched.set(hash, perf)
        }
      }

      if (remainingUnmatched.size > 0) {
        // Find media_library video items with no perf data
        const unmatchedLibraryVideos = mediaItems.filter(
          m => m.media_type === 'video' && !perfMap.has(m.media_hash)
        )

        // If exactly 1 unmatched derivative group and 1 unmatched library video, match them
        if (remainingUnmatched.size === 1 && unmatchedLibraryVideos.length === 1) {
          const [derivHash, derivPerf] = Array.from(remainingUnmatched.entries())[0]
          const libraryItem = unmatchedLibraryVideos[0]
          perfMap.set(libraryItem.media_hash, derivPerf)
          perfMap.delete(derivHash)
        } else if (remainingUnmatched.size > 0 && unmatchedLibraryVideos.length > 0) {
          // Multiple unmatched — attach each derivative's perf to the closest library video
          // by total spend (best effort). This handles multi-video accounts.
          const derivEntries = Array.from(remainingUnmatched.entries())
            .sort(([, a], [, b]) => b.spend - a.spend)
          const libraryVideos = [...unmatchedLibraryVideos]

          for (const [derivHash, derivPerf] of derivEntries) {
            if (libraryVideos.length === 0) break
            // Assign to first available unmatched library video
            const target = libraryVideos.shift()!
            perfMap.set(target.media_hash, derivPerf)
            perfMap.delete(derivHash)
          }
        }
      }
    }

    // 5c. Query video_analysis for analysis status (for sparkle indicators)
    const videoMediaHashes = mediaItems
      .filter(m => m.media_type === 'video')
      .map(m => m.media_hash)

    const analysisStatusMap = new Map<string, string>()
    if (videoMediaHashes.length > 0) {
      const { data: analysisRows } = await supabase
        .from('video_analysis')
        .select('media_hash, status')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .in('media_hash', videoMediaHashes)

      if (analysisRows) {
        for (const row of analysisRows) {
          analysisStatusMap.set(row.media_hash, row.status)
        }
      }
    }

    // 6. Build unified StudioAsset[] response
    const assets = mediaItems.map(item => {
      const perf = perfMap.get(item.media_hash)
      const hasPerformanceData = !!perf && perf.spend > 0

      // Default values for assets without performance data
      let spend = 0, revenue = 0, roas = 0, ctr = 0, cpm = 0, cpc = 0
      let impressions = 0, clicks = 0
      let fatigueScore = 0, daysActive = 0
      let fatigueStatus: FatigueStatus = 'fresh'
      let firstSeen: string | null = null, lastSeen: string | null = null
      let adCount = 0, adsetCount = 0, campaignCount = 0

      // Video metrics
      let videoViews: number | null = null
      let videoThruplay: number | null = null
      let videoP100: number | null = null
      let avgWatchTime: number | null = null
      let videoPlays: number | null = null
      let outboundClicks: number | null = null
      let thumbstopRate: number | null = null
      let holdRate: number | null = null
      let completionRate: number | null = null

      if (perf) {
        spend = perf.spend
        revenue = perf.revenue
        impressions = perf.impressions
        clicks = perf.clicks
        adCount = perf.adIds.size
        adsetCount = perf.adsetIds.size
        campaignCount = perf.campaignIds.size
        firstSeen = perf.firstDate
        lastSeen = perf.lastDate

        // Derived metrics
        roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0
        ctr = impressions > 0 ? Math.round((clicks / impressions * 100) * 10000) / 10000 : 0
        cpm = impressions > 0 ? Math.round((spend / impressions * 1000) * 100) / 100 : 0
        cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0

        // Days active
        const firstDate = new Date(perf.firstDate)
        const lastDate = new Date(perf.lastDate)
        daysActive = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)))

        // Video derived metrics
        const isVideoCreative = perf.hasVideoData
        if (isVideoCreative) {
          videoViews = perf.videoViews
          videoThruplay = perf.videoThruplay
          videoP100 = perf.videoP100
          avgWatchTime = perf.videoAvgTimeWeight > 0
            ? Math.round((perf.videoAvgTimeWeightedSum / perf.videoAvgTimeWeight) * 100) / 100
            : null
          videoPlays = perf.videoPlays
          outboundClicks = perf.outboundClicks > 0 ? perf.outboundClicks : null

          thumbstopRate = impressions > 0
            ? Math.round((perf.videoViews / impressions * 100) * 100) / 100
            : null
          holdRate = perf.videoViews > 0
            ? Math.round((perf.videoThruplay / perf.videoViews * 100) * 100) / 100
            : null
          completionRate = impressions > 0
            ? Math.round((perf.videoP100 / impressions * 100) * 100) / 100
            : null
        }

        // Fatigue calculation
        const dailyRows = [...perf.dailyData].sort((a, b) => a.date.localeCompare(b.date))
        let earlyRoas = 0, recentRoas = 0
        let earlyCtr = 0, recentCtr = 0
        let earlyCpm = 0, recentCpm = 0

        if (dailyRows.length >= 7) {
          const earlyDays = dailyRows.slice(0, Math.min(7, Math.floor(dailyRows.length / 2)))
          const recentDays = dailyRows.slice(-7)

          const sumPeriod = (days: typeof dailyRows) => days.reduce((acc, d) => ({
            spend: acc.spend + d.spend,
            revenue: acc.revenue + d.revenue,
            impressions: acc.impressions + d.impressions,
            clicks: acc.clicks + d.clicks,
          }), { spend: 0, revenue: 0, impressions: 0, clicks: 0 })

          const earlyTotals = sumPeriod(earlyDays)
          const recentTotals = sumPeriod(recentDays)

          earlyRoas = earlyTotals.spend > 0 ? earlyTotals.revenue / earlyTotals.spend : 0
          recentRoas = recentTotals.spend > 0 ? recentTotals.revenue / recentTotals.spend : 0
          earlyCtr = earlyTotals.impressions > 0 ? (earlyTotals.clicks / earlyTotals.impressions) * 100 : 0
          recentCtr = recentTotals.impressions > 0 ? (recentTotals.clicks / recentTotals.impressions) * 100 : 0
          earlyCpm = earlyTotals.impressions > 0 ? (earlyTotals.spend / earlyTotals.impressions) * 1000 : 0
          recentCpm = recentTotals.impressions > 0 ? (recentTotals.spend / recentTotals.impressions) * 1000 : 0
        }

        const fatigue = calculateFatigueScore(earlyRoas, recentRoas, earlyCtr, recentCtr, earlyCpm, recentCpm, daysActive)
        fatigueScore = fatigue.score
        fatigueStatus = fatigue.status
      }

      // Composite scores
      const isVideo = item.media_type === 'video'
      const scores = calculateCompositeScores(spend, roas, ctr, cpc, impressions, isVideo, thumbstopRate, holdRate, completionRate)

      return {
        id: item.id,
        mediaHash: item.media_hash,
        mediaType: item.media_type as 'image' | 'video',
        name: item.name,
        imageUrl: item.media_type === 'image' ? item.url : null,
        thumbnailUrl: item.media_type === 'video' ? item.video_thumbnail_url : null,
        storageUrl: item.storage_url,
        width: item.width,
        height: item.height,
        fileSize: item.file_size_bytes,
        downloadStatus: item.download_status,
        syncedAt: item.synced_at,
        // Performance
        hasPerformanceData,
        spend,
        revenue,
        roas,
        ctr,
        cpm,
        cpc,
        impressions,
        clicks,
        // Video
        videoViews,
        videoThruplay,
        videoP100,
        avgWatchTime,
        videoPlays,
        outboundClicks,
        thumbstopRate,
        holdRate,
        completionRate,
        // Scores
        hookScore: scores.hookScore,
        holdScore: scores.holdScore,
        clickScore: scores.clickScore,
        convertScore: scores.convertScore,
        // Fatigue
        fatigueScore,
        fatigueStatus,
        daysActive,
        firstSeen,
        lastSeen,
        // Usage
        adCount,
        adsetCount,
        campaignCount,
        // AI Analysis status (videos only)
        analysisStatus: item.media_type === 'video'
          ? (analysisStatusMap.get(item.media_hash) || 'none')
          : undefined,
      }
    })

    // 7. Apply filters
    let filtered = assets

    if (minSpend > 0) {
      filtered = filtered.filter(a => a.spend >= minSpend)
    }

    if (fatigueStatusFilter && fatigueStatusFilter !== 'all') {
      filtered = filtered.filter(a => a.fatigueStatus === fatigueStatusFilter)
    }

    if (hasDataFilter === 'with_spend') {
      filtered = filtered.filter(a => a.hasPerformanceData)
    } else if (hasDataFilter === 'unused') {
      filtered = filtered.filter(a => !a.hasPerformanceData)
    }

    // 8. Sort
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'roas': comparison = a.roas - b.roas; break
        case 'spend': comparison = a.spend - b.spend; break
        case 'revenue': comparison = a.revenue - b.revenue; break
        case 'fatigue': comparison = a.fatigueScore - b.fatigueScore; break
        case 'adCount': comparison = a.adCount - b.adCount; break
        case 'thumbstopRate': comparison = (a.thumbstopRate ?? -1) - (b.thumbstopRate ?? -1); break
        case 'holdRate': comparison = (a.holdRate ?? -1) - (b.holdRate ?? -1); break
        case 'hookScore': comparison = (a.hookScore ?? -1) - (b.hookScore ?? -1); break
        case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
        case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
        default: comparison = a.spend - b.spend; break
      }
      return comparison * sortMultiplier
    })

    const imageCount = filtered.filter(a => a.mediaType === 'image').length
    const videoCount = filtered.filter(a => a.mediaType === 'video').length
    console.log(`[Creative Studio] Returning ${filtered.length} assets (${imageCount} images, ${videoCount} videos)`)

    return NextResponse.json({ assets: filtered, videoCount, imageCount })

  } catch (err) {
    console.error('Creative Studio media GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
  }
}
