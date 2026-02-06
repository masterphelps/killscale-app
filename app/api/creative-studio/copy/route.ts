import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateCompositeScores } from '@/lib/creative-scores'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    // Note: date params ignored — copy always shows all-time metrics

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Get ALL ad_data rows — we need to join copy (from some rows) with spend (from other rows)
    const { data: rawData, error } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, status, primary_text, headline, description, thumbnail_url, media_type, video_id, spend, revenue, impressions, clicks, video_views, video_thruplay, video_p100, video_plays, outbound_clicks')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .limit(100000)

    if (error) {
      console.error('Error fetching ad_data:', error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    if (!rawData || rawData.length === 0) {
      return NextResponse.json({ variations: [] })
    }

    // STEP 1: Aggregate by ad_id to get copy text + total metrics per ad
    // Copy text may only exist on some rows, spend on others
    interface AdAgg {
      ad_id: string
      ad_name: string | null
      status: string | null
      primaryText: string | null
      headline: string | null
      description: string | null
      thumbnail_url: string | null
      media_type: string | null
      video_id: string | null
      spend: number
      revenue: number
      impressions: number
      clicks: number
      videoViews: number
      videoThruplay: number
      videoP100: number
      videoPlays: number
      outboundClicks: number
    }

    const adMap = new Map<string, AdAgg>()

    for (const row of rawData) {
      if (!row.ad_id) continue

      if (!adMap.has(row.ad_id)) {
        adMap.set(row.ad_id, {
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          status: row.status,
          primaryText: null,
          headline: null,
          description: null,
          thumbnail_url: null,
          media_type: null,
          video_id: null,
          spend: 0,
          revenue: 0,
          impressions: 0,
          clicks: 0,
          videoViews: 0,
          videoThruplay: 0,
          videoP100: 0,
          videoPlays: 0,
          outboundClicks: 0,
        })
      }

      const ad = adMap.get(row.ad_id)!

      // Aggregate metrics (daily rows)
      ad.spend += parseFloat(row.spend) || 0
      ad.revenue += parseFloat(row.revenue) || 0
      ad.impressions += row.impressions || 0
      ad.clicks += row.clicks || 0
      ad.videoViews += row.video_views || 0
      ad.videoThruplay += row.video_thruplay || 0
      ad.videoP100 += row.video_p100 || 0
      ad.videoPlays += row.video_plays || 0
      ad.outboundClicks += row.outbound_clicks || 0

      // Copy text — take from any row that has it
      if (row.primary_text && !ad.primaryText) ad.primaryText = row.primary_text
      if (row.headline && !ad.headline) ad.headline = row.headline
      if (row.description && !ad.description) ad.description = row.description
      if (row.thumbnail_url && !ad.thumbnail_url) ad.thumbnail_url = row.thumbnail_url
      if (row.media_type && !ad.media_type) ad.media_type = row.media_type
      if (row.video_id && !ad.video_id) ad.video_id = row.video_id
      if (row.ad_name && !ad.ad_name) ad.ad_name = row.ad_name
      if (row.status) ad.status = row.status // Take latest status
    }

    // STEP 2: Group ads by copy (primary_text + headline)
    interface CopyAgg {
      primaryText: string | null
      headline: string | null
      description: string | null
      adIds: Set<string>
      adNames: string[]
      statuses: Set<string>
      representativeThumbnail: string | null
      mediaType: string | null
      spend: number
      revenue: number
      impressions: number
      clicks: number
      videoViews: number
      videoThruplay: number
      videoP100: number
      videoPlays: number
      outboundClicks: number
      hasVideoData: boolean
    }

    const copyMap = new Map<string, CopyAgg>()

    for (const ad of Array.from(adMap.values())) {
      // Skip ads with no copy
      if (!ad.primaryText && !ad.headline) continue

      const key = `${ad.primaryText || ''}|||${ad.headline || ''}`

      if (!copyMap.has(key)) {
        copyMap.set(key, {
          primaryText: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          adIds: new Set(),
          adNames: [],
          statuses: new Set(),
          representativeThumbnail: ad.thumbnail_url,
          mediaType: ad.media_type,
          spend: 0,
          revenue: 0,
          impressions: 0,
          clicks: 0,
          videoViews: 0,
          videoThruplay: 0,
          videoP100: 0,
          videoPlays: 0,
          outboundClicks: 0,
          hasVideoData: false,
        })
      }

      const copy = copyMap.get(key)!

      // Aggregate this ad's metrics into the copy group
      copy.spend += ad.spend
      copy.revenue += ad.revenue
      copy.impressions += ad.impressions
      copy.clicks += ad.clicks
      copy.videoViews += ad.videoViews
      copy.videoThruplay += ad.videoThruplay
      copy.videoP100 += ad.videoP100
      copy.videoPlays += ad.videoPlays
      copy.outboundClicks += ad.outboundClicks
      if (ad.videoViews > 0) copy.hasVideoData = true

      copy.adIds.add(ad.ad_id)
      if (ad.ad_name) copy.adNames.push(ad.ad_name)
      if (ad.status) copy.statuses.add(ad.status)
      if (ad.thumbnail_url && !copy.representativeThumbnail) copy.representativeThumbnail = ad.thumbnail_url
      if (ad.description && !copy.description) copy.description = ad.description
    }

    // STEP 3: Build final variations array
    const variations = Array.from(copyMap.entries())
      .map(([key, agg]) => {
        const spend = agg.spend
        const revenue = agg.revenue
        const impressions = agg.impressions
        const clicks = agg.clicks

        const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0
        const ctr = impressions > 0 ? Math.round((clicks / impressions * 100) * 10000) / 10000 : 0
        const cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0

        const isVideo = agg.hasVideoData || agg.mediaType === 'video'
        const thumbstopRate = isVideo && impressions > 0
          ? Math.round((agg.videoViews / impressions * 100) * 100) / 100
          : null
        const holdRate = isVideo && agg.videoViews > 0
          ? Math.round((agg.videoThruplay / agg.videoViews * 100) * 100) / 100
          : null
        const completionRate = isVideo && impressions > 0
          ? Math.round((agg.videoP100 / impressions * 100) * 100) / 100
          : null

        const scores = calculateCompositeScores(spend, roas, ctr, cpc, impressions, isVideo, thumbstopRate, holdRate, completionRate)

        const isActive = agg.statuses.has('ACTIVE')

        return {
          key,
          primaryText: agg.primaryText,
          headline: agg.headline,
          description: agg.description,
          adCount: agg.adIds.size,
          adNames: agg.adNames.slice(0, 5),
          isActive,
          representativeThumbnail: agg.representativeThumbnail,
          mediaType: agg.mediaType,
          spend,
          revenue,
          impressions,
          clicks,
          roas,
          ctr,
          cpc,
          hookScore: scores.hookScore,
          holdScore: scores.holdScore,
          clickScore: scores.clickScore,
          convertScore: scores.convertScore,
          savedCopyId: undefined as string | undefined,
          source: 'ad_data' as 'ad_data' | 'saved',
          angle: undefined as string | undefined,
        }
      })
      .sort((a, b) => {
        if (a.spend > 0 && b.spend === 0) return -1
        if (a.spend === 0 && b.spend > 0) return 1
        if (a.spend > 0 && b.spend > 0) return b.spend - a.spend
        return b.adCount - a.adCount
      })

    // STEP 4: Merge saved copies (from saved_copy table)
    const { data: savedCopies } = await supabase
      .from('saved_copy')
      .select('id, headline, primary_text, description, angle, source, session_id, created_at')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .order('created_at', { ascending: false })

    if (savedCopies && savedCopies.length > 0) {
      for (const sc of savedCopies) {
        const key = `${sc.primary_text || ''}|||${sc.headline || ''}`

        // Only add if not already present from ad_data
        if (!copyMap.has(key)) {
          variations.push({
            key,
            primaryText: sc.primary_text,
            headline: sc.headline,
            description: sc.description,
            adCount: 0,
            adNames: [],
            isActive: false,
            representativeThumbnail: null,
            mediaType: null,
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            roas: 0,
            ctr: 0,
            cpc: 0,
            hookScore: null,
            holdScore: null,
            clickScore: null,
            convertScore: null,
            savedCopyId: sc.id,
            source: 'saved' as const,
            angle: sc.angle,
          })
        }
      }
    }

    console.log(`[Copy API] ${rawData.length} raw rows -> ${adMap.size} ads -> ${copyMap.size} copy groups, ${savedCopies?.length || 0} saved copies, ${variations.filter(v => v.spend > 0).length} with spend, top spend: $${variations[0]?.spend.toFixed(2) || 0}`)

    return NextResponse.json({ variations })
  } catch (err) {
    console.error('Copy variations GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch copy variations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, headline, primaryText, description, angle, sessionId } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!headline && !primaryText) {
      return NextResponse.json({ error: 'At least headline or primary text is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('saved_copy')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        headline: headline || null,
        primary_text: primaryText || null,
        description: description || null,
        angle: angle || null,
        source: 'ai_studio',
        session_id: sessionId || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error saving copy:', error)
      return NextResponse.json({ error: 'Failed to save copy' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('Copy POST error:', err)
    return NextResponse.json({ error: 'Failed to save copy' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const userId = searchParams.get('userId')

    if (!id || !userId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const { error } = await supabase
      .from('saved_copy')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting saved copy:', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Copy DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete copy' }, { status: 500 })
  }
}
