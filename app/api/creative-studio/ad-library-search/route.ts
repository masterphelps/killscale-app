import { NextRequest, NextResponse } from 'next/server'

// Meta Ad Library API - Public API, no auth required
// Docs: https://www.facebook.com/ads/library/api/

const META_AD_LIBRARY_URL = 'https://graph.facebook.com/v21.0/ads_archive'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
    }

    // Meta Ad Library requires an access token (can be a page token or user token)
    const accessToken = process.env.META_AD_LIBRARY_TOKEN || process.env.META_APP_ACCESS_TOKEN

    if (!accessToken) {
      // Return mock data for development/demo
      return NextResponse.json({
        ads: getMockAds(query),
        note: 'Using mock data - configure META_AD_LIBRARY_TOKEN for real results'
      })
    }

    // Search by page name for better results
    const params = new URLSearchParams({
      access_token: accessToken,
      search_terms: query,
      search_page_ids: '', // Will be empty for text search
      ad_type: 'ALL',
      ad_reached_countries: "['US']",
      ad_active_status: 'ACTIVE', // Only active ads
      fields: 'id,page_name,page_id,ad_snapshot_url,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_delivery_start_time,ad_delivery_stop_time,currency,spend,impressions,publisher_platforms,byline,languages',
      limit: '100', // Get up to 100 results
    })

    const res = await fetch(`${META_AD_LIBRARY_URL}?${params}`)
    const data = await res.json()

    if (data.error) {
      console.error('Ad Library API error:', data.error)
      return NextResponse.json({ error: data.error.message || 'API error' }, { status: 500 })
    }

    return NextResponse.json({ ads: data.data || [] })

  } catch (err) {
    console.error('Ad Library search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

// Mock data for development/demo
function getMockAds(query: string) {
  const mockAds = [
    {
      id: 'mock_1',
      page_name: `${query} Brand`,
      page_id: '123456789',
      ad_snapshot_url: 'https://www.facebook.com/ads/library/',
      ad_creative_bodies: [
        `🔥 LAST CHANCE! Our bestselling ${query} product is flying off the shelves.\n\nOver 50,000 happy customers can't be wrong.\n\n✅ Premium quality\n✅ Fast shipping\n✅ 30-day guarantee\n\nTap "Shop Now" before we sell out again!`
      ],
      ad_creative_link_titles: [`Shop ${query} - Limited Time Offer`],
      ad_creative_link_descriptions: ['Free shipping on orders over $50'],
      ad_delivery_start_time: '2024-01-15',
      publisher_platforms: ['facebook', 'instagram'],
    },
    {
      id: 'mock_2',
      page_name: `${query} Official`,
      page_id: '987654321',
      ad_snapshot_url: 'https://www.facebook.com/ads/library/',
      ad_creative_bodies: [
        `I was skeptical at first, but ${query} completely changed my routine.\n\nAfter just 2 weeks, I noticed a huge difference. Now I can't imagine going back.\n\nThe best part? It takes less than 5 minutes a day.\n\nSee why 100,000+ people made the switch 👇`
      ],
      ad_creative_link_titles: ['The #1 Rated Solution'],
      ad_creative_link_descriptions: ['Join 100,000+ happy customers'],
      ad_delivery_start_time: '2024-02-01',
      publisher_platforms: ['facebook', 'instagram'],
    },
    {
      id: 'mock_3',
      page_name: `${query} Store`,
      page_id: '456789123',
      ad_snapshot_url: 'https://www.facebook.com/ads/library/',
      ad_creative_bodies: [
        `POV: You finally found a ${query} that actually works.\n\nNo gimmicks. No BS. Just results.\n\n🎁 Use code SAVE20 for 20% off your first order\n\n→ Shop now`
      ],
      ad_creative_link_titles: ['20% Off - Code: SAVE20'],
      ad_creative_link_descriptions: ['Premium quality, affordable prices'],
      ad_delivery_start_time: '2024-01-20',
      publisher_platforms: ['facebook', 'instagram'],
    },
  ]

  return mockAds
}
