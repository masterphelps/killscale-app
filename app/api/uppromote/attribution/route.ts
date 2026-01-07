import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/uppromote/attribution
 *
 * Aggregate affiliate commissions for a date range.
 * Used by dashboard to calculate True ROAS (revenue - affiliate commissions).
 *
 * Query params:
 * - workspaceId: required
 * - userId: required (for authorization)
 * - dateStart: required (YYYY-MM-DD)
 * - dateEnd: required (YYYY-MM-DD)
 * - timezoneOffset: optional (minutes from UTC, e.g., 300 for EST which is UTC-5)
 *
 * Response:
 * {
 *   totals: {
 *     total_commission: number,
 *     total_referrals: number,
 *     currency: string  // Most common currency in results
 *   },
 *   dateRange: {
 *     start: string,
 *     end: string
 *   }
 * }
 *
 * Note: Currently returns only totals. Future enhancement: per-ad breakdown.
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const workspaceId = searchParams.get('workspaceId')
  const userId = searchParams.get('userId')
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')
  const timezoneOffset = parseInt(searchParams.get('timezoneOffset') || '0', 10)

  // Validate required params
  if (!workspaceId || !userId || !dateStart || !dateEnd) {
    return NextResponse.json(
      { error: 'workspaceId, userId, dateStart, and dateEnd are required' },
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

    console.log('[UpPromote Attribution] Date range:', {
      dateStart,
      dateEnd,
      timezoneOffset,
      startIso,
      endIso,
    })

    // Query uppromote_referrals for approved/paid commissions in date range
    // Group by currency to get the most common one
    const { data: referralData, error } = await supabase
      .from('uppromote_referrals')
      .select('commission, currency')
      .eq('workspace_id', workspaceId)
      .gte('referral_created_at', startIso)
      .lte('referral_created_at', endIso)
      .in('status', ['approved', 'paid'])

    if (error) {
      console.error('[UpPromote Attribution] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch referrals' }, { status: 500 })
    }

    if (!referralData || referralData.length === 0) {
      console.log('[UpPromote Attribution] No referrals found for date range')
      return NextResponse.json({
        totals: {
          total_commission: 0,
          total_referrals: 0,
          currency: 'USD', // Default
        },
        dateRange: {
          start: dateStart,
          end: dateEnd,
        },
      })
    }

    console.log('[UpPromote Attribution] Found referrals:', referralData.length)

    // Calculate totals and find most common currency
    let totalCommission = 0
    const totalReferrals = referralData.length
    const currencyCounts: Record<string, number> = {}

    for (const referral of referralData) {
      totalCommission += referral.commission || 0

      const currency = referral.currency || 'USD'
      currencyCounts[currency] = (currencyCounts[currency] || 0) + 1
    }

    // Find most common currency
    let mostCommonCurrency = 'USD'
    let maxCount = 0
    for (const [currency, count] of Object.entries(currencyCounts)) {
      if (count > maxCount) {
        maxCount = count
        mostCommonCurrency = currency
      }
    }

    console.log('[UpPromote Attribution] Aggregated:', {
      workspaceId,
      dateStart,
      dateEnd,
      totalReferrals,
      totalCommission: totalCommission.toFixed(2),
      currency: mostCommonCurrency,
      currencyBreakdown: currencyCounts,
    })

    return NextResponse.json({
      totals: {
        total_commission: totalCommission,
        total_referrals: totalReferrals,
        currency: mostCommonCurrency,
      },
      dateRange: {
        start: dateStart,
        end: dateEnd,
      },
    })

  } catch (err) {
    console.error('[UpPromote Attribution] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Attribution failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
