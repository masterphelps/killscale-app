import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Aggregate pixel events by ad_id (utm_content) for attribution
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pixelId = searchParams.get('pixelId')
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')

  if (!pixelId) {
    return NextResponse.json({ error: 'pixelId required' }, { status: 400 })
  }

  try {
    // Build query for conversion events (not pageviews)
    let query = supabase
      .from('pixel_events')
      .select('utm_content, event_type, event_value')
      .eq('pixel_id', pixelId)
      .not('utm_content', 'is', null)  // Only events with ad attribution
      .neq('event_type', 'pageview')   // Exclude pageviews

    // Apply date filters if provided
    if (dateStart) {
      query = query.gte('event_time', dateStart)
    }
    if (dateEnd) {
      // Add 1 day to include the end date fully
      const endDate = new Date(dateEnd)
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt('event_time', endDate.toISOString())
    }

    const { data: events, error } = await query

    if (error) {
      console.error('Failed to fetch pixel events for attribution:', error)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // Aggregate by ad_id (utm_content)
    const attribution: Record<string, {
      conversions: number
      revenue: number
      byType: Record<string, { count: number; value: number }>
    }> = {}

    events?.forEach(event => {
      const adId = event.utm_content
      if (!adId) return

      if (!attribution[adId]) {
        attribution[adId] = { conversions: 0, revenue: 0, byType: {} }
      }

      attribution[adId].conversions++
      attribution[adId].revenue += event.event_value || 0

      // Track by event type
      if (!attribution[adId].byType[event.event_type]) {
        attribution[adId].byType[event.event_type] = { count: 0, value: 0 }
      }
      attribution[adId].byType[event.event_type].count++
      attribution[adId].byType[event.event_type].value += event.event_value || 0
    })

    return NextResponse.json({
      attribution,
      totalEvents: events?.length || 0,
      uniqueAds: Object.keys(attribution).length
    })
  } catch (err) {
    console.error('Pixel attribution error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
