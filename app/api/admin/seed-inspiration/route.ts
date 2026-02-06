import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY!

// Brand configuration with their assigned formats
const BRANDS_BY_FORMAT: Record<string, { brands: string[]; industry: string }> = {
  ugc: { brands: ['Hexclad', 'Ridge Wallet', 'Liquid Death', 'Keeps', 'Theragun', 'Oura Ring'], industry: 'consumer' },
  product_hero: { brands: ['Apple', 'Dyson', 'Casper', 'Sony', 'Samsung', 'Bose'], industry: 'tech' },
  lifestyle: { brands: ['Allbirds', 'Outdoor Voices', 'Glossier', 'Lululemon', 'Alo Yoga', 'Gymshark'], industry: 'fashion' },
  bold: { brands: ['Athletic Greens', 'Huel', 'MANSCAPED', 'Dollar Shave Club', 'Olipop', 'Liquid IV'], industry: 'supplements' },
  testimonial: { brands: ['Noom', 'BetterHelp', 'HelloFresh', 'Calm', 'Headspace', 'Weight Watchers'], industry: 'health' },
  before_after: { brands: ['Curology', 'Smile Direct Club', 'Nurtec', 'Keeps', 'Hims', 'Ro'], industry: 'health' },
}

// Search for a company and get their page ID
async function searchCompany(name: string): Promise<{ pageId: string; pageName: string } | null> {
  try {
    const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=${encodeURIComponent(name)}`
    console.log(`[Seed] Search URL: ${url}`)

    const res = await fetch(url, {
      headers: {
        'x-api-key': SCRAPECREATORS_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Seed] Search failed for ${name}:`, res.status, errorText)
      return null
    }

    const data = await res.json()
    const results = data.searchResults || data.data || []

    if (results.length === 0) {
      console.log(`[Seed] No results for ${name}`)
      return null
    }

    // Return first match
    const first = results[0]
    return {
      pageId: first.page_id || first.pageId || first.id || '',
      pageName: first.name || first.pageName || name,
    }
  } catch (err) {
    console.error(`[Seed] Error searching ${name}:`, err)
    return null
  }
}

// Fetch ads for a company
async function fetchAds(pageId: string, pageName: string): Promise<any[]> {
  try {
    const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?companyName=${encodeURIComponent(pageName)}&country=US&trim=true`
    console.log(`[Seed] Fetching ads from: ${url}`)

    const res = await fetch(url, {
      headers: {
        'x-api-key': SCRAPECREATORS_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Seed] Fetch ads failed for ${pageName}:`, res.status, errorText)
      return []
    }

    const data = await res.json()
    const ads = data.results || data.data || data.ads || []
    console.log(`[Seed] Got ${ads.length} ads for ${pageName}`)
    return ads
  } catch (err) {
    console.error(`[Seed] Error fetching ads for ${pageName}:`, err)
    return []
  }
}

// Map ScrapeCreators ad to our format
function mapAd(ad: any, format: string, industry: string) {
  const snapshot = ad.snapshot || {}

  // Handle timestamps (can be Unix timestamp or ISO string)
  let startDate: Date
  if (ad.start_date) {
    startDate = typeof ad.start_date === 'number'
      ? new Date(ad.start_date * 1000)
      : new Date(ad.start_date)
  } else {
    startDate = new Date()
  }
  const now = new Date()
  const daysActive = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  // Determine media type
  let mediaType: 'image' | 'video' | 'carousel' = 'image'
  if (snapshot.videos && snapshot.videos.length > 0) {
    mediaType = 'video'
  } else if (snapshot.cards && snapshot.cards.length > 1) {
    mediaType = 'carousel'
  }

  // Get image/video URLs - try multiple possible field names
  const imageUrl = snapshot.images?.[0]?.url ||
    snapshot.images?.[0]?.resized_image_url ||
    snapshot.images?.[0]?.original_image_url ||
    snapshot.cards?.[0]?.resized_image_url ||
    snapshot.cards?.[0]?.original_image_url ||
    null

  const videoUrl = snapshot.videos?.[0]?.video_hd_url ||
    snapshot.videos?.[0]?.video_sd_url ||
    null

  const videoThumbnail = snapshot.videos?.[0]?.video_preview_image_url ||
    snapshot.images?.[0]?.url ||
    null

  // Get copy - handle both string and object formats
  const body = typeof snapshot.body === 'string'
    ? snapshot.body
    : (snapshot.body?.text || snapshot.body?.markup?.__html || null)

  const headline = typeof snapshot.title === 'string'
    ? snapshot.title
    : (snapshot.title?.text || snapshot.link_title || null)

  // Build carousel cards if applicable
  let carouselCards = null
  if (mediaType === 'carousel' && snapshot.cards && snapshot.cards.length > 0) {
    carouselCards = snapshot.cards.map((card: any) => ({
      imageUrl: card.resized_image_url || card.original_image_url || card.image_url || null,
      headline: typeof card.title === 'string' ? card.title : (card.title?.text || null),
      body: typeof card.body === 'string' ? card.body : (card.body?.text || null),
      linkUrl: card.link_url || null,
    }))
  }

  // Strip HTML tags from body if present
  const cleanBody = body ? body.replace(/<[^>]*>/g, '').substring(0, 1000) : null

  return {
    ad_format: format,
    industry_category: industry,
    page_name: ad.page_name || snapshot.page_name || 'Unknown',
    page_id: ad.page_id || null,
    media_type: mediaType,
    body: cleanBody,
    headline,
    image_url: imageUrl,
    video_url: videoUrl,
    video_thumbnail: videoThumbnail,
    carousel_cards: carouselCards,
    days_active: Math.max(0, daysActive),
    is_active: ad.is_active !== false,
    description: null, // Will be filled manually later
    is_featured: false,
    display_order: 0,
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for admin auth (simple check - in production use proper auth)
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.ADMIN_SECRET && secret !== 'seed-inspiration-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: { brand: string; format: string; adsFound: number; inserted: number }[] = []
    let totalInserted = 0

    // Process each format
    for (const [format, config] of Object.entries(BRANDS_BY_FORMAT)) {
      console.log(`\n[Seed] Processing format: ${format}`)

      for (const brand of config.brands) {
        console.log(`[Seed] Searching for ${brand}...`)

        // Search for the company
        const company = await searchCompany(brand)
        if (!company) {
          results.push({ brand, format, adsFound: 0, inserted: 0 })
          continue
        }

        console.log(`[Seed] Found ${company.pageName} (${company.pageId})`)

        // Fetch their ads
        const ads = await fetchAds(company.pageId, company.pageName)
        console.log(`[Seed] Found ${ads.length} ads for ${brand}`)

        if (ads.length === 0) {
          results.push({ brand, format, adsFound: 0, inserted: 0 })
          continue
        }

        // Take up to 5 best ads (longest running, with some media)
        const sortedAds = ads
          .filter((ad: any) => {
            const snapshot = ad.snapshot || {}
            // Accept ads with images, videos, or carousel cards
            const hasImages = snapshot.images?.length > 0
            const hasVideos = snapshot.videos?.length > 0
            const hasCards = snapshot.cards?.length > 0
            return hasImages || hasVideos || hasCards
          })
          .sort((a: any, b: any) => {
            // Sort by total_active_time if available, otherwise by start_date
            const aTime = a.total_active_time || 0
            const bTime = b.total_active_time || 0
            if (aTime !== bTime) return bTime - aTime // Longest running first
            const aStart = a.start_date || 0
            const bStart = b.start_date || 0
            return aStart - bStart // Oldest first as fallback
          })
          .slice(0, 5)

        // Map and insert ads
        const mappedAds = sortedAds.map((ad: any) => mapAd(ad, format, config.industry))

        // Log what we're trying to insert
        console.log(`[Seed] Trying to insert ${mappedAds.length} ads for ${brand}`)
        if (mappedAds.length > 0) {
          console.log(`[Seed] Sample mapped ad:`, JSON.stringify(mappedAds[0], null, 2))
        }

        // Filter out ads without any image URL (required for display)
        const validAds = mappedAds.filter((ad: any) => ad.image_url || ad.video_thumbnail || ad.video_url)
        console.log(`[Seed] Valid ads after filtering: ${validAds.length}`)

        if (validAds.length === 0) {
          results.push({ brand, format, adsFound: ads.length, inserted: 0 })
          continue
        }

        const { data, error } = await supabase
          .from('inspiration_gallery')
          .insert(validAds)
          .select()

        if (error) {
          console.error(`[Seed] Insert error for ${brand}:`, error.message, error.details)
          results.push({ brand, format, adsFound: ads.length, inserted: 0 })
        } else {
          const insertedCount = data?.length || 0
          totalInserted += insertedCount
          results.push({ brand, format, adsFound: ads.length, inserted: insertedCount })
          console.log(`[Seed] Inserted ${insertedCount} ads for ${brand}`)
        }

        // Rate limit - wait between API calls
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return NextResponse.json({
      success: true,
      totalInserted,
      results,
    })
  } catch (error) {
    console.error('[Seed] Error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}

// GET to check current count
export async function GET() {
  const { count, error } = await supabase
    .from('inspiration_gallery')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get breakdown by format
  const { data: formatCounts } = await supabase
    .from('inspiration_gallery')
    .select('ad_format')

  const byFormat: Record<string, number> = {}
  for (const row of formatCounts || []) {
    byFormat[row.ad_format] = (byFormat[row.ad_format] || 0) + 1
  }

  return NextResponse.json({
    total: count || 0,
    byFormat,
  })
}
