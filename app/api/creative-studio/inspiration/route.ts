import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')
    const industry = searchParams.get('industry')
    const mediaType = searchParams.get('mediaType')

    // Build query
    let query = supabase
      .from('inspiration_gallery')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('days_active', { ascending: false })

    // Apply filters
    if (format && format !== 'all') {
      query = query.eq('ad_format', format)
    }
    if (industry) {
      query = query.eq('industry_category', industry)
    }
    if (mediaType) {
      query = query.eq('media_type', mediaType)
    }

    const { data: examples, error } = await query

    if (error) {
      console.error('Error fetching inspiration gallery:', error)
      return NextResponse.json({ error: 'Failed to fetch inspiration gallery' }, { status: 500 })
    }

    // Get stats for all formats
    const { data: allExamples } = await supabase
      .from('inspiration_gallery')
      .select('ad_format')

    const byFormat: Record<string, number> = {
      ugc: 0,
      product_hero: 0,
      lifestyle: 0,
      bold: 0,
      testimonial: 0,
      before_after: 0,
    }

    if (allExamples) {
      for (const ex of allExamples) {
        if (ex.ad_format in byFormat) {
          byFormat[ex.ad_format]++
        }
      }
    }

    // Map to frontend types
    const mappedExamples = (examples || []).map((ex) => ({
      id: ex.id,
      adFormat: ex.ad_format,
      industryCategory: ex.industry_category,
      pageName: ex.page_name,
      pageId: ex.page_id,
      mediaType: ex.media_type,
      body: ex.body,
      headline: ex.headline,
      imageUrl: ex.image_url,
      videoUrl: ex.video_url,
      videoThumbnail: ex.video_thumbnail,
      carouselCards: ex.carousel_cards,
      daysActive: ex.days_active || 0,
      isActive: ex.is_active ?? true,
      description: ex.description,
      isFeatured: ex.is_featured ?? false,
    }))

    return NextResponse.json({
      examples: mappedExamples,
      stats: {
        total: allExamples?.length || 0,
        byFormat,
      },
    })
  } catch (error) {
    console.error('Error in inspiration gallery route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
