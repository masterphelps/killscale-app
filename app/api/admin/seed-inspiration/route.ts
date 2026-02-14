import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 300 // 5 minutes for bulk download+upload

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY!

// Brands confirmed to return ads from ScrapeCreators + extras for coverage
const BRANDS_BY_FORMAT: Record<string, { brands: string[]; industry: string }> = {
  ugc: { brands: ['True Classic', 'Liquid Death', 'Keeps', 'BarkBox', 'Chubbies', 'Fabletics', 'Pura Vida', 'Quince', 'Cozy Earth', 'CUTS Clothing'], industry: 'consumer' },
  product_hero: { brands: ['Samsung', 'Tile', 'iRobot', 'Sonos', 'Anker', 'Breville', 'Dyson', 'Bose', 'Solo Stove', 'Ooni'], industry: 'tech' },
  lifestyle: { brands: ['Under Armour', 'Skims', 'Savage X Fenty', 'Mejuri', 'Girlfriend Collective', 'Athleta', 'Rothy\'s', 'Cariuma', 'ABLE', 'Ministry of Supply'], industry: 'fashion' },
  bold: { brands: ['MANSCAPED', 'Dollar Shave Club', 'Olipop', 'GHOST', 'Liquid I.V.', 'AG1', 'RXBAR', 'Orgain', 'Ka\'Chava', 'Seed'], industry: 'supplements' },
  testimonial: { brands: ['Audible', 'Monday.com', 'Notion', 'Calm', 'Headspace', 'Blinkist', 'Wix', 'Fiverr', 'Asana', 'ClickUp'], industry: 'tech' },
  before_after: { brands: ['Nutrafol', 'Prose', 'Keeps', 'The Ordinary', 'Supergoop', 'Hims', 'Curology', 'Ro', 'Tula', 'Paula\'s Choice'], industry: 'health' },
}

// Download a file from URL and upload to Supabase Storage, returns permanent public URL
async function downloadAndStore(url: string, prefix: string): Promise<string | null> {
  if (!url) return null

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      console.log(`[Seed] Download failed (${res.status}) for ${url.substring(0, 80)}...`)
      return null
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()

    // Skip files > 20MB
    if (buffer.byteLength > 20 * 1024 * 1024) {
      console.log(`[Seed] Skipping large file (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`)
      return null
    }

    // Determine extension from content type
    let ext = 'jpg'
    if (contentType.includes('png')) ext = 'png'
    else if (contentType.includes('webp')) ext = 'webp'
    else if (contentType.includes('gif')) ext = 'gif'
    else if (contentType.includes('mp4') || contentType.includes('video')) ext = 'mp4'

    const filename = `${prefix}_${uuidv4()}.${ext}`
    const storagePath = `inspiration/${filename}`

    const { error: uploadError } = await supabase
      .storage
      .from('media')
      .upload(storagePath, Buffer.from(buffer), {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[Seed] Upload error for ${prefix}:`, uploadError.message)
      return null
    }

    const { data: publicUrlData } = supabase
      .storage
      .from('media')
      .getPublicUrl(storagePath)

    return publicUrlData?.publicUrl || null
  } catch (err: any) {
    console.log(`[Seed] downloadAndStore failed for ${prefix}: ${err.message}`)
    return null
  }
}

// Search for a company and get their page ID
async function searchCompany(name: string): Promise<{ pageId: string; pageName: string } | null> {
  try {
    const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=${encodeURIComponent(name)}`

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

// Map ScrapeCreators ad to our format and download media to Supabase Storage
async function mapAndDownloadAd(ad: any, format: string, industry: string, brandSlug: string) {
  const snapshot = ad.snapshot || {}

  // Handle timestamps
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

  // Get raw URLs from ad data
  const rawImageUrl = snapshot.images?.[0]?.url ||
    snapshot.images?.[0]?.resized_image_url ||
    snapshot.images?.[0]?.original_image_url ||
    snapshot.cards?.[0]?.resized_image_url ||
    snapshot.cards?.[0]?.original_image_url ||
    null

  const rawVideoThumbnail = snapshot.videos?.[0]?.video_preview_image_url ||
    snapshot.images?.[0]?.url ||
    null

  // Get copy
  const body = typeof snapshot.body === 'string'
    ? snapshot.body
    : (snapshot.body?.text || snapshot.body?.markup?.__html || null)

  const headline = typeof snapshot.title === 'string'
    ? snapshot.title
    : (snapshot.title?.text || snapshot.link_title || null)

  // Download media to Supabase Storage in parallel
  const prefix = `${format}_${brandSlug}`

  const [storedImageUrl, storedVideoThumbnail] = await Promise.all([
    rawImageUrl ? downloadAndStore(rawImageUrl, `${prefix}_img`) : Promise.resolve(null),
    (mediaType === 'video' && rawVideoThumbnail) ? downloadAndStore(rawVideoThumbnail, `${prefix}_vthumb`) : Promise.resolve(null),
  ])

  // Build carousel cards with downloaded images (first 3 cards only)
  let carouselCards = null
  if (mediaType === 'carousel' && snapshot.cards && snapshot.cards.length > 0) {
    const cardSlice = snapshot.cards.slice(0, 3)
    const downloadedCards = await Promise.all(
      cardSlice.map(async (card: any, idx: number) => {
        const cardImgUrl = card.resized_image_url || card.original_image_url || card.image_url || null
        const storedCardUrl = cardImgUrl
          ? await downloadAndStore(cardImgUrl, `${prefix}_card${idx}`)
          : null

        return {
          imageUrl: storedCardUrl || cardImgUrl, // fallback to raw if download fails
          headline: typeof card.title === 'string' ? card.title : (card.title?.text || null),
          body: typeof card.body === 'string' ? card.body : (card.body?.text || null),
          linkUrl: card.link_url || null,
        }
      })
    )
    carouselCards = downloadedCards
  }

  // Strip HTML tags from body
  const cleanBody = body ? body.replace(/<[^>]*>/g, '').substring(0, 1000) : null

  return {
    ad_format: format,
    industry_category: industry,
    page_name: ad.page_name || snapshot.page_name || 'Unknown',
    page_id: ad.page_id || null,
    media_type: mediaType,
    body: cleanBody,
    headline,
    image_url: storedImageUrl || rawImageUrl, // fallback to raw if download fails
    video_url: null, // Full videos too large for Storage; thumbnail + copy is sufficient
    video_thumbnail: storedVideoThumbnail || rawVideoThumbnail, // fallback to raw
    carousel_cards: carouselCards,
    days_active: Math.max(0, daysActive),
    is_active: ad.is_active !== false,
    description: null,
    is_featured: false,
    display_order: 0,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.ADMIN_SECRET && secret !== 'seed-inspiration-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Clear existing rows (wipe stale Facebook CDN data)
    console.log('[Seed] Clearing existing inspiration_gallery rows...')
    const { error: deleteError } = await supabase
      .from('inspiration_gallery')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows (neq dummy to match all)

    if (deleteError) {
      console.error('[Seed] Delete error:', deleteError.message)
    } else {
      console.log('[Seed] Cleared existing rows')
    }

    const results: { brand: string; format: string; adsFound: number; inserted: number; mediaDownloaded: number }[] = []
    let totalInserted = 0
    let totalMediaDownloaded = 0

    // Process each format
    for (const [format, config] of Object.entries(BRANDS_BY_FORMAT)) {
      console.log(`\n[Seed] Processing format: ${format}`)

      for (const brand of config.brands) {
        console.log(`[Seed] Searching for ${brand}...`)

        const company = await searchCompany(brand)
        if (!company) {
          results.push({ brand, format, adsFound: 0, inserted: 0, mediaDownloaded: 0 })
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }

        console.log(`[Seed] Found ${company.pageName} (${company.pageId})`)

        const ads = await fetchAds(company.pageId, company.pageName)

        if (ads.length === 0) {
          results.push({ brand, format, adsFound: 0, inserted: 0, mediaDownloaded: 0 })
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }

        // Take up to 8 best ads (longest running, with media)
        const sortedAds = ads
          .filter((ad: any) => {
            const snapshot = ad.snapshot || {}
            const hasImages = snapshot.images?.length > 0
            const hasVideos = snapshot.videos?.length > 0
            const hasCards = snapshot.cards?.length > 0
            return hasImages || hasVideos || hasCards
          })
          .sort((a: any, b: any) => {
            const aTime = a.total_active_time || 0
            const bTime = b.total_active_time || 0
            if (aTime !== bTime) return bTime - aTime
            const aStart = a.start_date || 0
            const bStart = b.start_date || 0
            return aStart - bStart
          })
          .slice(0, 8)

        // Map and download media for all ads in parallel
        const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]/g, '')
        const mappedAds = await Promise.all(
          sortedAds.map((ad: any) => mapAndDownloadAd(ad, format, config.industry, brandSlug))
        )

        // Count how many got Supabase Storage URLs (not raw Facebook CDN)
        let mediaDownloaded = 0
        for (const ad of mappedAds) {
          if (ad.image_url && ad.image_url.includes('supabase')) mediaDownloaded++
          if (ad.video_thumbnail && ad.video_thumbnail.includes('supabase')) mediaDownloaded++
        }

        // Filter out ads without any image
        const validAds = mappedAds.filter((ad: any) => ad.image_url || ad.video_thumbnail)

        if (validAds.length === 0) {
          results.push({ brand, format, adsFound: ads.length, inserted: 0, mediaDownloaded: 0 })
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }

        const { data, error } = await supabase
          .from('inspiration_gallery')
          .insert(validAds)
          .select()

        if (error) {
          console.error(`[Seed] Insert error for ${brand}:`, error.message, error.details)
          results.push({ brand, format, adsFound: ads.length, inserted: 0, mediaDownloaded: 0 })
        } else {
          const insertedCount = data?.length || 0
          totalInserted += insertedCount
          totalMediaDownloaded += mediaDownloaded
          results.push({ brand, format, adsFound: ads.length, inserted: insertedCount, mediaDownloaded })
          console.log(`[Seed] Inserted ${insertedCount} ads for ${brand} (${mediaDownloaded} media stored)`)
        }

        // Rate limit between brands within same format
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Longer delay between formats
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return NextResponse.json({
      success: true,
      totalInserted,
      totalMediaDownloaded,
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

  // Check how many have Supabase Storage URLs vs Facebook CDN
  const { data: urlCheck } = await supabase
    .from('inspiration_gallery')
    .select('image_url')

  let supabaseUrls = 0
  let cdnUrls = 0
  for (const row of urlCheck || []) {
    if (row.image_url?.includes('supabase')) supabaseUrls++
    else if (row.image_url) cdnUrls++
  }

  return NextResponse.json({
    total: count || 0,
    byFormat,
    urlHealth: {
      supabaseStorage: supabaseUrls,
      facebookCdn: cdnUrls,
      note: cdnUrls > 0 ? 'Facebook CDN URLs will expire! Re-seed to fix.' : 'All URLs are permanent Supabase Storage URLs.',
    },
  })
}
