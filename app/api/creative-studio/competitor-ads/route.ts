import { NextRequest, NextResponse } from 'next/server'

export interface CompetitorAd {
  id: string
  pageId: string
  pageName: string
  startDate: string
  endDate: string | null
  isActive: boolean
  platforms: string[]
  body: string | null
  headline: string | null
  linkUrl: string | null
  ctaText: string | null
  mediaType: 'image' | 'video' | 'carousel' | 'text'
  imageUrl: string | null
  videoUrl: string | null
  videoThumbnail: string | null
  carouselCards: CompetitorCarouselCard[] | null
  daysActive: number
  collationCount: number
}

export interface CompetitorCarouselCard {
  imageUrl: string | null
  headline: string | null
  body: string | null
  linkUrl: string | null
  videoUrl?: string | null
}

export interface CompetitorStats {
  totalAds: number
  activeAds: number
  earliestAdDate: string | null
  mediaMix: { video: number; image: number; carousel: number; text: number }
  topLandingPages: Array<{ url: string; domain: string; count: number; percentage: number }>
}

function calculateDaysActive(startDate: string, endDate: string | null): number {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date()
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function extractDomain(url: string | null): string {
  if (!url) return 'unknown'
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace('www.', '')
  } catch {
    return 'unknown'
  }
}

function determineMediaType(snapshot: any): 'image' | 'video' | 'carousel' | 'text' {
  if (snapshot?.videos && snapshot.videos.length > 0) return 'video'
  if (snapshot?.cards && snapshot.cards.length > 1) return 'carousel'
  if (snapshot?.images && snapshot.images.length > 0) return 'image'
  return 'text'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const company = searchParams.get('company')
    const pageId = searchParams.get('pageId')
    const country = searchParams.get('country') || 'US'
    const cursor = searchParams.get('cursor')

    // Require either company name OR pageId
    if (!company && !pageId) {
      return NextResponse.json({ error: 'Missing company name or pageId' }, { status: 400 })
    }

    const apiKey = process.env.SCRAPECREATORS_API_KEY
    if (!apiKey) {
      console.error('[Competitor Ads] API key not configured')
      return NextResponse.json({ error: 'API not configured' }, { status: 500 })
    }

    // Prefer pageId if provided (more precise), otherwise use companyName
    const identifier = pageId ? `pageId=${encodeURIComponent(pageId)}` : `companyName=${encodeURIComponent(company!)}`
    console.log('[Competitor Ads] Fetching ads with:', identifier, 'country:', country)

    let url = `https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?${identifier}&country=${country}&trim=true`
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`
    }

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Competitor Ads] API error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to fetch ads', ads: [], stats: null }, { status: 500 })
    }

    const data = await response.json()
    console.log('[Competitor Ads] API response keys:', Object.keys(data))

    const rawAds = data.results || data.data || data.ads || []
    console.log('[Competitor Ads] Found', rawAds.length, 'ads')

    // Log a sample carousel ad to see card structure
    const sampleCarousel = rawAds.find((ad: any) => {
      const snapshot = ad.snapshot || {}
      return snapshot.cards && snapshot.cards.length > 1
    })
    if (sampleCarousel) {
      console.log('[Competitor Ads] Sample carousel snapshot keys:', Object.keys(sampleCarousel.snapshot || {}))
      console.log('[Competitor Ads] Sample card keys:', Object.keys(sampleCarousel.snapshot?.cards?.[0] || {}))
      console.log('[Competitor Ads] Sample card:', JSON.stringify(sampleCarousel.snapshot?.cards?.[0], null, 2))
    }

    // Transform ads to our format
    const ads: CompetitorAd[] = rawAds.map((ad: any) => {
      const snapshot = ad.snapshot || {}
      const mediaType = determineMediaType(snapshot)

      // Handle timestamps (can be Unix timestamp or ISO string)
      const startDate = ad.start_date
        ? (typeof ad.start_date === 'number' ? new Date(ad.start_date * 1000).toISOString() : ad.start_date)
        : new Date().toISOString()
      const endDate = ad.end_date
        ? (typeof ad.end_date === 'number' ? new Date(ad.end_date * 1000).toISOString() : ad.end_date)
        : null

      const isActive = ad.is_active !== undefined ? ad.is_active : true

      // Handle platforms - can be string or array
      const platforms = Array.isArray(ad.publisher_platform)
        ? ad.publisher_platform
        : ad.publisher_platform
          ? [ad.publisher_platform]
          : ['facebook']

      return {
        id: ad.ad_archive_id || ad.id || Math.random().toString(36).substring(7),
        pageId: ad.page_id || '',
        pageName: ad.page_name || snapshot.page_name || company,
        startDate,
        endDate,
        isActive,
        platforms,
        body: typeof snapshot.body === 'string' ? snapshot.body : (snapshot.body?.text || null),
        headline: typeof snapshot.title === 'string' ? snapshot.title : (snapshot.title?.text || null),
        linkUrl: snapshot.link_url || null,
        ctaText: snapshot.cta_text || null,
        mediaType,
        imageUrl: snapshot.images?.[0]?.url || snapshot.images?.[0]?.resized_image_url || snapshot.cards?.[0]?.resized_image_url || snapshot.cards?.[0]?.original_image_url || snapshot.cards?.[0]?.video_preview_image_url || snapshot.cards?.[0]?.image_url || null,
        videoUrl: snapshot.videos?.[0]?.video_hd_url || snapshot.videos?.[0]?.video_sd_url || null,
        videoThumbnail: snapshot.videos?.[0]?.video_preview_image_url || snapshot.images?.[0]?.url || null,
        carouselCards: snapshot.cards && snapshot.cards.length > 0 ? snapshot.cards.map((card: any) => ({
          imageUrl: card.resized_image_url || card.original_image_url || card.video_preview_image_url || card.image_url || card.imageUrl || card.image || card.thumbnail_url || card.picture || card.media_url || null,
          headline: typeof card.title === 'string' ? card.title : (card.title?.text || null),
          body: typeof card.body === 'string' ? card.body : (card.body?.text || null),
          linkUrl: card.link_url || card.link || card.url || null,
          videoUrl: card.video_hd_url || card.video_sd_url || null,
        })) : null,
        daysActive: ad.total_active_time || calculateDaysActive(startDate, endDate),
        collationCount: ad.collation_count || 1,
      }
    })

    // Compute stats
    const activeAds = ads.filter(ad => ad.isActive)
    const landingPageCounts: Record<string, { url: string; domain: string; count: number }> = {}

    let videoCount = 0
    let imageCount = 0
    let carouselCount = 0
    let textCount = 0
    let earliestDate: string | null = null

    for (const ad of ads) {
      // Media mix
      switch (ad.mediaType) {
        case 'video': videoCount++; break
        case 'image': imageCount++; break
        case 'carousel': carouselCount++; break
        case 'text': textCount++; break
      }

      // Earliest date
      if (!earliestDate || ad.startDate < earliestDate) {
        earliestDate = ad.startDate
      }

      // Landing pages
      if (ad.linkUrl) {
        const domain = extractDomain(ad.linkUrl)
        if (!landingPageCounts[domain]) {
          landingPageCounts[domain] = { url: ad.linkUrl, domain, count: 0 }
        }
        landingPageCounts[domain].count++
      }
    }

    const totalAds = ads.length
    const topLandingPages = Object.values(landingPageCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(lp => ({
        ...lp,
        percentage: totalAds > 0 ? Math.round((lp.count / totalAds) * 100) : 0,
      }))

    const stats: CompetitorStats = {
      totalAds,
      activeAds: activeAds.length,
      earliestAdDate: earliestDate,
      mediaMix: {
        video: totalAds > 0 ? Math.round((videoCount / totalAds) * 100) : 0,
        image: totalAds > 0 ? Math.round((imageCount / totalAds) * 100) : 0,
        carousel: totalAds > 0 ? Math.round((carouselCount / totalAds) * 100) : 0,
        text: totalAds > 0 ? Math.round((textCount / totalAds) * 100) : 0,
      },
      topLandingPages,
    }

    return NextResponse.json({
      ads,
      stats,
      nextCursor: data.cursor || data.nextCursor || data.next_cursor || null,
    })
  } catch (err) {
    console.error('[Competitor Ads] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch ads', ads: [], stats: null }, { status: 500 })
  }
}
