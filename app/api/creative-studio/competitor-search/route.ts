import { NextRequest, NextResponse } from 'next/server'

export interface CompetitorSearchResult {
  name: string
  pageId: string
  logoUrl: string | null
  adCount?: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 2) {
      return NextResponse.json({ companies: [] })
    }

    const apiKey = process.env.SCRAPECREATORS_API_KEY
    if (!apiKey) {
      console.error('[Competitor Search] API key not configured')
      return NextResponse.json({ error: 'API not configured', companies: [] }, { status: 500 })
    }

    console.log('[Competitor Search] Searching for:', query)

    const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Competitor Search] API error:', response.status, errorText)
      return NextResponse.json({ error: 'Search failed', companies: [] }, { status: 500 })
    }

    const data = await response.json()
    const results = data.searchResults || data.data || []
    console.log('[Competitor Search] Found', results.length, 'companies')

    // Log first result to see available fields
    if (results.length > 0) {
      console.log('[Competitor Search] Sample result keys:', Object.keys(results[0]))
    }

    // Transform to our format
    const companies: CompetitorSearchResult[] = results.map((company: any) => ({
      name: company.name || company.pageName || '',
      pageId: company.page_id || company.pageId || company.id || '',
      logoUrl: company.image_uri || company.logoUrl || company.logo_url || company.profilePicture || null,
      adCount: company.ad_count || company.adCount || company.ads_count || company.total_ads || undefined,
    }))

    return NextResponse.json({ companies })
  } catch (err) {
    console.error('[Competitor Search] Error:', err)
    return NextResponse.json({ error: 'Search failed', companies: [] }, { status: 500 })
  }
}
