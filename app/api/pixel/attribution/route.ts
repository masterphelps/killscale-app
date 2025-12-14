import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Aggregate pixel events by ad_id (utm_content) for attribution
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pixelId = searchParams.get('pixelId')
  const userId = searchParams.get('userId')
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')

  if (!pixelId || !userId) {
    return NextResponse.json({ error: 'pixelId and userId required' }, { status: 400 })
  }

  try {
    // Verify pixel ownership and get meta_account_id
    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .select('pixel_id, meta_account_id')
      .eq('pixel_id', pixelId)
      .eq('user_id', userId)
      .single()

    if (pixelError || !pixel) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load configured event values from rules
    const { data: rules } = await supabase
      .from('rules')
      .select('event_values')
      .eq('ad_account_id', pixel.meta_account_id)
      .eq('user_id', userId)
      .single()

    const eventValues: Record<string, number> = rules?.event_values || {}

    console.log('[Attribution] Loaded event values:', {
      metaAccountId: pixel.meta_account_id,
      hasRules: !!rules,
      eventValues
    })

    // Normalize event type for matching (CompleteRegistration -> complete_registration)
    const normalizeEventType = (type: string): string => {
      return type
        .replace(/([A-Z])/g, '_$1')  // Add underscore before capitals
        .toLowerCase()
        .replace(/^_/, '')            // Remove leading underscore
        .replace(/__+/g, '_')         // Replace double underscores
    }

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

      // Get value: use event's value if present, otherwise look up configured default
      const normalizedType = normalizeEventType(event.event_type)
      const configuredValue = eventValues[normalizedType] || eventValues[event.event_type] || 0
      const eventValue = event.event_value ?? configuredValue

      console.log('[Attribution] Processing event:', {
        eventType: event.event_type,
        normalizedType,
        eventValueFromDB: event.event_value,
        configuredValue,
        finalValue: eventValue
      })

      attribution[adId].conversions++
      attribution[adId].revenue += eventValue

      // Track by event type
      if (!attribution[adId].byType[event.event_type]) {
        attribution[adId].byType[event.event_type] = { count: 0, value: 0 }
      }
      attribution[adId].byType[event.event_type].count++
      attribution[adId].byType[event.event_type].value += eventValue
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
