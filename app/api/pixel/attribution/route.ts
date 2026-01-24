import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  applyAttributionModel,
  aggregateAttributions,
  AttributionModel,
  Touchpoint,
  AttributedConversion
} from '@/lib/attribution-models'

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
  const workspaceId = searchParams.get('workspaceId')
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')

  if (!pixelId || !userId) {
    return NextResponse.json({ error: 'pixelId and userId required' }, { status: 400 })
  }

  try {
    let attributionModel: AttributionModel = 'last_touch'
    let isAuthorized = false

    // If workspaceId provided, verify ownership via workspace or membership
    if (workspaceId) {
      // Check if user is the workspace owner
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', userId)
        .single()

      // Or check if user is a member of this workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      if (workspace || membership) {
        // User has access, now get the pixel config
        const { data: wsPixel } = await supabase
          .from('workspace_pixels')
          .select('pixel_id, attribution_model')
          .eq('pixel_id', pixelId)
          .eq('workspace_id', workspaceId)
          .single()

        if (wsPixel) {
          attributionModel = (wsPixel.attribution_model as AttributionModel) || 'last_touch'
          isAuthorized = true
        }
      }
    }

    // Fall back to legacy pixels table if not authorized via workspace
    if (!isAuthorized) {
      const { data: pixel, error: pixelError } = await supabase
        .from('pixels')
        .select('pixel_id, meta_account_id')
        .eq('pixel_id', pixelId)
        .eq('user_id', userId)
        .single()

      if (pixelError || !pixel) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      isAuthorized = true
    }

    // Load configured event values from rules
    // For workspace-based queries, we skip rules since they're per-account
    // Event values will come from the events themselves
    const eventValues: Record<string, number> = {}

    // Normalize event type for matching (CompleteRegistration -> complete_registration)
    const normalizeEventType = (type: string): string => {
      return type
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '')
        .replace(/__+/g, '_')
    }

    // Build date filter
    let dateFilter = ''
    const dateParams: string[] = []
    if (dateStart) {
      dateFilter = `event_time >= '${dateStart}'`
    }
    if (dateEnd) {
      const endDate = new Date(dateEnd)
      endDate.setDate(endDate.getDate() + 1)
      const endClause = `event_time < '${endDate.toISOString()}'`
      dateFilter = dateFilter ? `${dateFilter} AND ${endClause}` : endClause
    }

    // For simple last_touch, use the existing simple aggregation
    if (attributionModel === 'last_touch') {
      // Only count actual conversion events, not page views
      // Filter out pageview and any *_page_view events (like purchase_page_view)
      let query = supabase
        .from('pixel_events')
        .select('utm_content, event_type, event_value')
        .eq('pixel_id', pixelId)
        .not('utm_content', 'is', null)
        .not('event_type', 'ilike', '%pageview%')
        .not('event_type', 'ilike', '%page_view%')

      if (dateStart) {
        query = query.gte('event_time', dateStart)
      }
      if (dateEnd) {
        const endDate = new Date(dateEnd)
        endDate.setDate(endDate.getDate() + 1)
        query = query.lt('event_time', endDate.toISOString())
      }

      const { data: events, error } = await query

      if (error) {
        console.error('Failed to fetch pixel events for attribution:', error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
      }

      // Simple last-touch aggregation (each event = 100% credit to its utm_content)
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

        const normalizedType = normalizeEventType(event.event_type)
        const configuredValue = eventValues[normalizedType] || eventValues[event.event_type] || 0
        const eventValue = event.event_value ?? configuredValue

        attribution[adId].conversions++
        attribution[adId].revenue += eventValue

        if (!attribution[adId].byType[event.event_type]) {
          attribution[adId].byType[event.event_type] = { count: 0, value: 0 }
        }
        attribution[adId].byType[event.event_type].count++
        attribution[adId].byType[event.event_type].value += eventValue
      })

      // For last_touch, both attribution types are identical
      return NextResponse.json({
        attribution,
        lastTouchAttribution: attribution,
        multiTouchAttribution: attribution,
        totalEvents: events?.length || 0,
        uniqueAds: Object.keys(attribution).length,
        model: attributionModel
      })
    }

    // Multi-touch attribution: need to process by client journey
    // Step 1: Get all conversion events (grouped by client_id)
    // Filter out pageview and any *_page_view events (like purchase_page_view)
    let conversionQuery = supabase
      .from('pixel_events')
      .select('id, client_id, utm_content, event_type, event_value, event_time')
      .eq('pixel_id', pixelId)
      .not('event_type', 'ilike', '%pageview%')
      .not('event_type', 'ilike', '%page_view%')

    if (dateStart) {
      conversionQuery = conversionQuery.gte('event_time', dateStart)
    }
    if (dateEnd) {
      const endDate = new Date(dateEnd)
      endDate.setDate(endDate.getDate() + 1)
      conversionQuery = conversionQuery.lt('event_time', endDate.toISOString())
    }

    const { data: conversions, error: convError } = await conversionQuery

    if (convError) {
      console.error('Failed to fetch conversions:', convError)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    if (!conversions || conversions.length === 0) {
      return NextResponse.json({
        attribution: {},
        lastTouchAttribution: {},
        multiTouchAttribution: {},
        totalEvents: 0,
        uniqueAds: 0,
        model: attributionModel
      })
    }

    // Group conversions by client_id
    const conversionsByClient = new Map<string, typeof conversions>()
    for (const conv of conversions) {
      if (!conv.client_id) continue
      const existing = conversionsByClient.get(conv.client_id) || []
      existing.push(conv)
      conversionsByClient.set(conv.client_id, existing)
    }

    // Step 2: For each client with conversions, get their touchpoint journey
    // Track BOTH last-touch (for campaigns/adsets) and multi-touch (for ads)
    const allAttributions: AttributedConversion[] = []
    const byTypeAccum: Record<string, Record<string, { count: number; value: number }>> = {}

    // Last-touch tracking: whole conversions go to the closing ad
    const lastTouchData: Record<string, { conversions: number; revenue: number }> = {}

    let totalConversions = 0

    for (const [clientId, clientConversions] of Array.from(conversionsByClient.entries())) {
      // Get all touchpoints (pageviews with utm_content) for this client
      const { data: touchpoints } = await supabase
        .from('pixel_events')
        .select('utm_content, event_time')
        .eq('pixel_id', pixelId)
        .eq('client_id', clientId)
        .not('utm_content', 'is', null)
        .order('event_time', { ascending: true })

      if (!touchpoints || touchpoints.length === 0) continue

      // Convert to Touchpoint format
      const journey: Touchpoint[] = touchpoints.map(tp => ({
        ad_id: tp.utm_content!,
        event_time: tp.event_time
      }))

      // For each conversion, apply attribution model
      for (const conversion of clientConversions) {
        const normalizedType = normalizeEventType(conversion.event_type)
        const configuredValue = eventValues[normalizedType] || eventValues[conversion.event_type] || 0
        const conversionValue = conversion.event_value ?? configuredValue

        // Filter journey to touchpoints before this conversion
        const relevantTouchpoints = journey.filter(
          tp => new Date(tp.event_time) <= new Date(conversion.event_time)
        )

        if (relevantTouchpoints.length === 0) continue

        // LAST-TOUCH: The last touchpoint gets the whole conversion (for campaign/adset level)
        const lastTouchpoint = relevantTouchpoints[relevantTouchpoints.length - 1]
        if (!lastTouchData[lastTouchpoint.ad_id]) {
          lastTouchData[lastTouchpoint.ad_id] = { conversions: 0, revenue: 0 }
        }
        lastTouchData[lastTouchpoint.ad_id].conversions += 1
        lastTouchData[lastTouchpoint.ad_id].revenue += conversionValue

        // Apply attribution model (first touch or last touch)
        const attributed = applyAttributionModel(
          relevantTouchpoints,
          conversionValue,
          attributionModel
        )

        allAttributions.push(...attributed)
        totalConversions++

        // Track by event type (for multi-touch)
        for (const attr of attributed) {
          if (!byTypeAccum[attr.ad_id]) {
            byTypeAccum[attr.ad_id] = {}
          }
          if (!byTypeAccum[attr.ad_id][conversion.event_type]) {
            byTypeAccum[attr.ad_id][conversion.event_type] = { count: 0, value: 0 }
          }
          byTypeAccum[attr.ad_id][conversion.event_type].count += attr.credit
          byTypeAccum[attr.ad_id][conversion.event_type].value += attr.value
        }
      }
    }

    // Aggregate multi-touch attributions
    const aggregated = aggregateAttributions(allAttributions)

    // Build multi-touch attribution object (fractional - for ad level)
    const multiTouchAttribution: Record<string, {
      conversions: number
      revenue: number
      byType: Record<string, { count: number; value: number }>
    }> = {}

    for (const [adId, data] of Array.from(aggregated.entries())) {
      multiTouchAttribution[adId] = {
        conversions: data.conversions,
        revenue: data.value,
        byType: byTypeAccum[adId] || {}
      }
    }

    // Build last-touch attribution object (whole numbers - for campaign/adset level)
    const lastTouchAttribution: Record<string, {
      conversions: number
      revenue: number
    }> = lastTouchData

    return NextResponse.json({
      // Legacy field for backwards compatibility
      attribution: multiTouchAttribution,
      // New hybrid fields
      lastTouchAttribution,
      multiTouchAttribution,
      totalEvents: totalConversions,
      uniqueAds: Object.keys(multiTouchAttribution).length,
      model: attributionModel
    })
  } catch (err) {
    console.error('Pixel attribution error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
