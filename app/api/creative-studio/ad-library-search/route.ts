import { NextRequest, NextResponse } from 'next/server'

// Apify official Facebook Ads Scraper
const APIFY_ACTOR_ID = 'apify~facebook-ads-scraper'
const APIFY_API_URL = 'https://api.apify.com/v2'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
    }

    const apiToken = process.env.APIFY_API_TOKEN
    if (!apiToken) {
      return NextResponse.json({ error: 'Apify not configured' }, { status: 500 })
    }

    console.log('[Ad Library] Starting Apify scrape for:', query)

    // Construct Facebook page URL from brand name
    const pageUrl = `https://www.facebook.com/${query.toLowerCase().replace(/\s+/g, '')}`

    // Run the Apify actor synchronously (wait for results)
    const runUrl = `${APIFY_API_URL}/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${apiToken}`

    const response = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [{ url: pageUrl }],
        activeStatus: 'active',
        resultsLimit: 50,
        isDetailsPerAd: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Ad Library] Apify error:', response.status, errorText)
      return NextResponse.json({
        error: 'Scraper failed - check if the brand name is correct',
        details: errorText,
        ads: []
      }, { status: 500 })
    }

    const results = await response.json()
    console.log('[Ad Library] Apify returned', results.length, 'results')

    // Transform Apify results to our format
    const ads = results.flatMap((item: any) => {
      // Each item may have multiple ads in the ads array
      const adsArray = item.ads || [item]

      return adsArray.map((ad: any) => ({
        id: ad.adArchiveID || ad.id || Math.random().toString(36),
        page_name: item.pageName || ad.pageName || query,
        page_id: item.pageID || ad.pageID || '',
        ad_snapshot_url: ad.snapshot?.link || ad.adSnapshotUrl || '',
        ad_creative_bodies: ad.snapshot?.body_markup ? [ad.snapshot.body_markup] :
                          ad.bodyText ? [ad.bodyText] : [],
        ad_creative_link_titles: ad.snapshot?.title ? [ad.snapshot.title] :
                                ad.linkTitle ? [ad.linkTitle] : [],
        ad_creative_link_descriptions: ad.snapshot?.link_description ? [ad.snapshot.link_description] : [],
        ad_delivery_start_time: ad.startDate || item.startDate || new Date().toISOString(),
        publisher_platforms: ad.publisherPlatform || ['facebook', 'instagram'],
        // Media fields
        video_url: ad.snapshot?.videos?.[0]?.video_hd_url ||
                  ad.snapshot?.videos?.[0]?.video_sd_url ||
                  ad.videoHdUrl || ad.videoSdUrl || null,
        video_thumbnail: ad.snapshot?.videos?.[0]?.video_preview_image_url ||
                        ad.snapshot?.images?.[0]?.url || null,
        image_url: ad.snapshot?.images?.[0]?.url ||
                  ad.snapshot?.cards?.[0]?.image_url ||
                  ad.imageUrl || null,
        media_type: (ad.snapshot?.videos?.length > 0 || ad.videoHdUrl) ? 'video' : 'image',
      }))
    }).filter((ad: any) => ad.ad_creative_bodies?.length > 0 || ad.video_url || ad.image_url)

    console.log('[Ad Library] Processed', ads.length, 'ads with content')
    return NextResponse.json({ ads })

  } catch (err) {
    console.error('[Ad Library] Error:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Search failed',
      ads: []
    }, { status: 500 })
  }
}
