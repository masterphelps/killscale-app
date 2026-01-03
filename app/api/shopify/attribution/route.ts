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
 * Aggregate Shopify orders by ad_id (last_utm_content) for revenue attribution.
 * Only counts PAID, PARTIALLY_PAID, and PARTIALLY_REFUNDED orders.
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
 *     unattributed_orders: number
 *   }
 * }
 */
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

    // Fetch all orders for this workspace within date range
    // Filter to paid orders only (PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED)
    const { data: orders, error } = await supabase
      .from('shopify_orders')
      .select('last_utm_content, total_price, financial_status')
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
        },
      })
    }

    // Aggregate by ad_id (last_utm_content)
    const attribution: Record<string, { revenue: number; orders: number }> = {}
    let totalRevenue = 0
    let totalOrders = 0
    let attributedRevenue = 0
    let attributedOrders = 0
    let unattributedRevenue = 0
    let unattributedOrders = 0

    for (const order of orders) {
      const revenue = order.total_price || 0
      totalRevenue += revenue
      totalOrders += 1

      const adId = order.last_utm_content

      if (adId) {
        // Has UTM attribution
        if (!attribution[adId]) {
          attribution[adId] = { revenue: 0, orders: 0 }
        }
        attribution[adId].revenue += revenue
        attribution[adId].orders += 1
        attributedRevenue += revenue
        attributedOrders += 1
      } else {
        // No UTM = organic/direct/email traffic
        unattributedRevenue += revenue
        unattributedOrders += 1
      }
    }

    console.log('[Shopify Attribution] Aggregated:', {
      workspaceId,
      dateStart,
      dateEnd,
      totalOrders,
      totalRevenue,
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
      },
    })

  } catch (err) {
    console.error('[Shopify Attribution] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Attribution failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
