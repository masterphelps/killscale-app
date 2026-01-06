import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/shopify/attribution
 *
 * Aggregate Shopify orders by ad_id using the Northbeam/Triple Whale JOIN model:
 * - Shopify orders = revenue source of truth (from webhooks)
 * - Pixel events = attribution source of truth (from pixel fires)
 * - JOIN on order_id = attributed revenue
 *
 * Attribution logic:
 * - Both pixel + order: ATTRIBUTED (use pixel's utm_content as ad_id)
 * - Order only (no pixel): UNATTRIBUTED (revenue counts, no ad credit)
 * - Pixel only (no order): ORPHAN (ignored - no revenue to attribute)
 *
 * Query params:
 * - workspaceId: required
 * - dateStart: required (YYYY-MM-DD)
 * - dateEnd: required (YYYY-MM-DD)
 * - userId: required (for authorization)
 * - timezoneOffset: optional (minutes from UTC, e.g., 480 for PST which is UTC-8)
 *
 * Response:
 * {
 *   attribution: {
 *     [ad_id]: { revenue: number, orders: number }
 *   },
 *   totals: {
 *     total_revenue: number,
 *     total_orders: number,
 *     attributed_revenue: number,
 *     attributed_orders: number,
 *     unattributed_revenue: number,
 *     unattributed_orders: number,
 *     pixel_match_rate: number  // % of orders with pixel data (target: 85%+)
 *   }
 * }
 */

// Extract numeric order ID from Shopify GID format
// "gid://shopify/Order/12345" -> "12345"
function extractOrderId(gid: string): string {
  if (!gid) return ''
  return gid.replace('gid://shopify/Order/', '')
}
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const workspaceId = searchParams.get('workspaceId')
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')
  const userId = searchParams.get('userId')
  const timezoneOffset = parseInt(searchParams.get('timezoneOffset') || '0', 10)

  if (!workspaceId || !dateStart || !dateEnd || !userId) {
    return NextResponse.json(
      { error: 'workspaceId, dateStart, dateEnd, and userId are required' },
      { status: 400 }
    )
  }

  try {
    // Verify user has access to this workspace (owner or member)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    let hasAccess = !!workspace

    if (!hasAccess) {
      // Not the owner, check if they're a member
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      hasAccess = !!membership
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to workspace' }, { status: 403 })
    }

    // Convert local dates to UTC timestamps using timezone offset
    // timezoneOffset is in minutes (positive = west of UTC, e.g., 300 for EST which is UTC-5)
    //
    // Example for EST (offset=300):
    // - User selects 2026-01-01 (local date)
    // - Local midnight = 2026-01-01T00:00:00 EST = 2026-01-01T05:00:00 UTC
    // - So we parse as UTC (with Z), then ADD the offset to get correct UTC time
    const startUtc = new Date(`${dateStart}T00:00:00Z`)
    const endUtc = new Date(`${dateEnd}T23:59:59Z`)

    // Add offset to convert from "UTC midnight" to "local midnight in UTC"
    // If offset is 300 (EST = UTC-5), local midnight = UTC 5:00 AM
    startUtc.setMinutes(startUtc.getMinutes() + timezoneOffset)
    endUtc.setMinutes(endUtc.getMinutes() + timezoneOffset)

    const startIso = startUtc.toISOString()
    const endIso = endUtc.toISOString()

    console.log('[Shopify Attribution] Date range:', {
      dateStart,
      dateEnd,
      timezoneOffset,
      startIso,
      endIso,
    })

    // Get the pixel_id for this workspace (for JOIN with pixel_events)
    const { data: pixelData } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    const pixelId = pixelData?.pixel_id

    // Fetch all orders for this workspace within date range
    // Filter to paid orders only (PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED)
    const { data: orders, error } = await supabase
      .from('shopify_orders')
      .select('shopify_order_id, total_price, financial_status, last_utm_content')
      .eq('workspace_id', workspaceId)
      .gte('order_created_at', startIso)
      .lte('order_created_at', endIso)
      .in('financial_status', ['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'])

    if (error) {
      console.error('[Shopify Attribution] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        attribution: {},
        totals: {
          total_revenue: 0,
          total_orders: 0,
          attributed_revenue: 0,
          attributed_orders: 0,
          unattributed_revenue: 0,
          unattributed_orders: 0,
          pixel_match_rate: 0,
        },
      })
    }

    // If we have a pixel, fetch pixel events for these orders
    // Build a map of order_id -> pixel attribution data
    const pixelAttributionMap: Record<string, string> = {}  // order_id -> utm_content (ad_id)

    if (pixelId) {
      // Extract all order IDs to look up
      const orderIds = orders.map(o => extractOrderId(o.shopify_order_id)).filter(Boolean)

      if (orderIds.length > 0) {
        // Fetch pixel purchase events for these order IDs
        const { data: pixelEvents } = await supabase
          .from('pixel_events')
          .select('order_id, utm_content')
          .eq('pixel_id', pixelId)
          .eq('event_type', 'purchase')
          .in('order_id', orderIds)

        if (pixelEvents) {
          for (const event of pixelEvents) {
            if (event.order_id && event.utm_content) {
              pixelAttributionMap[event.order_id] = event.utm_content
            }
          }
        }
      }
    }

    // Aggregate using the JOIN model:
    // - Attribution comes from PIXEL events (if matched)
    // - Revenue comes from SHOPIFY orders (always)
    const attribution: Record<string, { revenue: number; orders: number }> = {}
    let totalRevenue = 0
    let totalOrders = 0
    let attributedRevenue = 0
    let attributedOrders = 0
    let unattributedRevenue = 0
    let unattributedOrders = 0
    let pixelMatchedOrders = 0

    for (const order of orders) {
      const revenue = order.total_price || 0
      const orderId = extractOrderId(order.shopify_order_id)
      totalRevenue += revenue
      totalOrders += 1

      // Check if we have pixel attribution for this order
      const pixelAdId = pixelAttributionMap[orderId]

      if (pixelAdId) {
        // Pixel matched - use pixel's utm_content for attribution
        pixelMatchedOrders += 1
        if (!attribution[pixelAdId]) {
          attribution[pixelAdId] = { revenue: 0, orders: 0 }
        }
        attribution[pixelAdId].revenue += revenue
        attribution[pixelAdId].orders += 1
        attributedRevenue += revenue
        attributedOrders += 1
      } else {
        // No pixel match - order is UNATTRIBUTED
        // (We don't fall back to Shopify's last_utm_content anymore)
        unattributedRevenue += revenue
        unattributedOrders += 1
      }
    }

    // Calculate pixel match rate (target: 85%+)
    const pixelMatchRate = totalOrders > 0 ? (pixelMatchedOrders / totalOrders) * 100 : 0

    console.log('[Shopify Attribution] Aggregated (JOIN model):', {
      workspaceId,
      dateStart,
      dateEnd,
      totalOrders,
      totalRevenue,
      pixelMatchedOrders,
      pixelMatchRate: `${pixelMatchRate.toFixed(1)}%`,
      attributedOrders,
      unattributedOrders,
      uniqueAds: Object.keys(attribution).length,
    })

    return NextResponse.json({
      attribution,
      totals: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        attributed_revenue: attributedRevenue,
        attributed_orders: attributedOrders,
        unattributed_revenue: unattributedRevenue,
        unattributed_orders: unattributedOrders,
        pixel_match_rate: pixelMatchRate,
      },
    })

  } catch (err) {
    console.error('[Shopify Attribution] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Attribution failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
