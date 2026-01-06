import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Normalize Shopify order ID to numeric only
// Handles: "gid://shopify/Order/12345", "#1001", "12345"
function normalizeOrderId(orderId: string): string {
  if (!orderId) return ''

  // Extract numeric ID from GraphQL GID format
  if (orderId.includes('gid://shopify/Order/')) {
    return orderId.replace('gid://shopify/Order/', '')
  }

  // Remove # prefix from order number
  if (orderId.startsWith('#')) {
    return orderId.slice(1)
  }

  // Return as-is if already numeric
  return orderId.replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      pixel_id,
      pixel_secret,
      order_id,
      order_total,
      // Attribution data
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,  // ad_id - THE KEY FIELD
      utm_term,
      fbclid,
      // Session data
      session_id,
      client_id,
      landing_page,
      referrer,
      page_views,
      time_on_site,
      // Timestamps
      click_time,
      event_time,
    } = body

    // Validate required fields
    if (!pixel_id || !pixel_secret || !order_id) {
      return NextResponse.json(
        { error: 'Missing required fields: pixel_id, pixel_secret, order_id' },
        { status: 400 }
      )
    }

    // Validate pixel_id and pixel_secret
    const { data: pixelData, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select('workspace_id, pixel_id')
      .eq('pixel_id', pixel_id)
      .eq('pixel_secret', pixel_secret)
      .single()

    if (pixelError || !pixelData) {
      console.error('[Pixel Purchase] Invalid pixel credentials:', { pixel_id, error: pixelError })
      return NextResponse.json(
        { error: 'Invalid pixel credentials' },
        { status: 401 }
      )
    }

    // Normalize order ID for consistent matching
    const normalizedOrderId = normalizeOrderId(order_id)

    if (!normalizedOrderId) {
      return NextResponse.json(
        { error: 'Invalid order_id format' },
        { status: 400 }
      )
    }

    // Check for duplicate (same order_id for this pixel)
    const { data: existingEvent } = await supabase
      .from('pixel_events')
      .select('id')
      .eq('pixel_id', pixel_id)
      .eq('order_id', normalizedOrderId)
      .eq('event_type', 'purchase')
      .single()

    if (existingEvent) {
      // Already have this purchase event - deduplicate
      console.log('[Pixel Purchase] Duplicate event, skipping:', { pixel_id, order_id: normalizedOrderId })
      return NextResponse.json({
        success: true,
        deduplicated: true,
        order_id: normalizedOrderId
      })
    }

    // Insert purchase event
    const { error: insertError } = await supabase
      .from('pixel_events')
      .insert({
        pixel_id,
        event_type: 'purchase',
        event_value: order_total || null,
        event_currency: 'USD',
        order_id: normalizedOrderId,
        order_total: order_total || null,
        // Attribution
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_content: utm_content || null,  // ad_id
        utm_term: utm_term || null,
        fbclid: fbclid || null,
        // Session
        session_id: session_id || null,
        client_id: client_id || null,
        page_url: landing_page || null,
        referrer: referrer || null,
        // Timestamps
        click_time: click_time ? new Date(click_time) : null,
        event_time: event_time ? new Date(event_time) : new Date(),
        // Metadata
        source: 'pixel',
        event_metadata: {
          page_views: page_views || null,
          time_on_site: time_on_site || null,
        }
      })

    if (insertError) {
      console.error('[Pixel Purchase] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to store purchase event' },
        { status: 500 }
      )
    }

    console.log('[Pixel Purchase] Stored:', {
      pixel_id,
      order_id: normalizedOrderId,
      utm_content,
      order_total
    })

    return NextResponse.json({
      success: true,
      order_id: normalizedOrderId,
      attributed: !!utm_content
    })

  } catch (error) {
    console.error('[Pixel Purchase] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'pixel/purchase',
    method: 'POST',
    description: 'Submit purchase events with order_id for attribution'
  })
}
