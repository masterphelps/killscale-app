import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing ad ID' }, { status: 400 })
    }

    const apiKey = process.env.SCRAPECREATORS_API_KEY
    if (!apiKey) {
      console.error('[Competitor Ad] API key not configured')
      return NextResponse.json({ error: 'API not configured' }, { status: 500 })
    }

    console.log('[Competitor Ad] Fetching ad:', id)

    const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${encodeURIComponent(id)}&trim=true`

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Competitor Ad] API error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to fetch ad' }, { status: 500 })
    }

    const data = await response.json()
    const ad = data.data || data

    // Transform to our format
    const startDate = ad.startDate || ad.ad_delivery_start_time || new Date().toISOString()
    const endDate = ad.endDate || ad.ad_delivery_stop_time || null

    const hasVideo = ad.videos && ad.videos.length > 0
    const hasCarousel = ad.cards && ad.cards.length > 1
    const hasImage = ad.images && ad.images.length > 0

    const mediaType = hasVideo ? 'video' : hasCarousel ? 'carousel' : hasImage ? 'image' : 'text'

    const transformedAd = {
      id: ad.id || ad.adArchiveID || id,
      pageId: ad.pageId || ad.page_id || '',
      pageName: ad.pageName || ad.page_name || '',
      startDate,
      endDate,
      isActive: ad.isActive !== undefined ? ad.isActive : (endDate === null),
      platforms: ad.publisherPlatforms || ad.publisher_platforms || ['facebook'],
      body: ad.body || ad.ad_creative_bodies?.[0] || ad.bodyText || null,
      headline: ad.headline || ad.title || ad.ad_creative_link_titles?.[0] || ad.linkTitle || null,
      linkUrl: ad.linkUrl || ad.link_url || ad.linkDestination || null,
      ctaText: ad.ctaText || ad.cta_text || ad.callToAction || null,
      mediaType,
      imageUrl: ad.images?.[0]?.url || ad.image_url || ad.imageUrl || null,
      videoUrl: ad.videos?.[0]?.video_hd_url || ad.videos?.[0]?.video_sd_url || ad.video_url || ad.videoUrl || null,
      videoThumbnail: ad.videos?.[0]?.video_preview_image_url || ad.video_thumbnail || ad.videoThumbnail || ad.images?.[0]?.url || null,
      carouselCards: ad.cards ? ad.cards.map((card: any) => ({
        imageUrl: card.image_url || card.imageUrl || null,
        headline: card.headline || card.title || null,
        body: card.body || null,
        linkUrl: card.link_url || card.linkUrl || null,
      })) : null,
      daysActive: calculateDaysActive(startDate, endDate),
      collationCount: ad.collationCount || ad.collation_count || 1,
    }

    // Include targeting if available
    const targeting = ad.targeting || ad.demographicDistribution || null

    return NextResponse.json({ ad: transformedAd, targeting })
  } catch (err) {
    console.error('[Competitor Ad] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch ad' }, { status: 500 })
  }
}

function calculateDaysActive(startDate: string, endDate: string | null): number {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date()
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}
