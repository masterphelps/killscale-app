import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace_id')
    const userId = searchParams.get('userId')
    const days = parseInt(searchParams.get('days') || '7')

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'workspace_id and userId required' },
        { status: 400 }
      )
    }

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'days must be between 1 and 365' },
        { status: 400 }
      )
    }

    // Verify workspace access (user owns workspace OR is a member)
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, user_id')
      .eq('id', workspaceId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Check if user owns workspace
    const isOwner = workspace.user_id === userId

    // If not owner, check if user is a member
    if (!isOwner) {
      const { data: member, error: memberError } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .not('accepted_at', 'is', null)
        .single()

      if (memberError || !member) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // Query ALL merged_attribution data for this workspace (shows last sync results)
    const { data: breakdown, error: breakdownError } = await supabase
      .from('merged_attribution')
      .select(`
        date,
        verified_conversions,
        verified_revenue,
        ks_only_conversions,
        ks_only_revenue,
        meta_only_conversions,
        meta_only_revenue,
        manual_conversions,
        manual_revenue,
        total_conversions,
        total_revenue,
        computed_at
      `)
      .eq('workspace_id', workspaceId)
      .order('date', { ascending: true })

    if (breakdownError) {
      console.error('Failed to fetch attribution breakdown:', breakdownError)
      return NextResponse.json(
        { error: 'Failed to fetch attribution breakdown' },
        { status: 500 }
      )
    }

    // Aggregate the results
    const aggregated = {
      verified_conversions: 0,
      verified_revenue: 0,
      ks_only_conversions: 0,
      ks_only_revenue: 0,
      meta_only_conversions: 0,
      meta_only_revenue: 0,
      manual_conversions: 0,
      manual_revenue: 0,
      total_conversions: 0,
      total_revenue: 0,
      last_computed: null as string | null
    }

    if (breakdown && breakdown.length > 0) {
      breakdown.forEach(row => {
        aggregated.verified_conversions += row.verified_conversions || 0
        aggregated.verified_revenue += parseFloat(row.verified_revenue || '0')
        aggregated.ks_only_conversions += row.ks_only_conversions || 0
        aggregated.ks_only_revenue += parseFloat(row.ks_only_revenue || '0')
        aggregated.meta_only_conversions += row.meta_only_conversions || 0
        aggregated.meta_only_revenue += parseFloat(row.meta_only_revenue || '0')
        aggregated.manual_conversions += row.manual_conversions || 0
        aggregated.manual_revenue += parseFloat(row.manual_revenue || '0')
        aggregated.total_conversions += row.total_conversions || 0
        aggregated.total_revenue += parseFloat(row.total_revenue || '0')
      })

      // Get the most recent computed_at timestamp
      const timestamps = breakdown
        .map(row => row.computed_at)
        .filter(Boolean)
        .sort()
        .reverse()

      aggregated.last_computed = timestamps[0] || null
    }

    // Get actual date range from data
    const dates = breakdown?.map(row => row.date).filter(Boolean).sort() || []
    const dateStart = dates[0] || null
    const dateEnd = dates[dates.length - 1] || null

    return NextResponse.json({
      success: true,
      data: {
        verified: {
          conversions: aggregated.verified_conversions,
          revenue: parseFloat(aggregated.verified_revenue.toFixed(2))
        },
        ks_only: {
          conversions: aggregated.ks_only_conversions,
          revenue: parseFloat(aggregated.ks_only_revenue.toFixed(2))
        },
        meta_only: {
          conversions: aggregated.meta_only_conversions,
          revenue: parseFloat(aggregated.meta_only_revenue.toFixed(2))
        },
        manual: {
          conversions: aggregated.manual_conversions,
          revenue: parseFloat(aggregated.manual_revenue.toFixed(2))
        },
        total: {
          conversions: aggregated.total_conversions,
          revenue: parseFloat(aggregated.total_revenue.toFixed(2))
        },
        date_start: dateStart,
        date_end: dateEnd,
        days_count: dates.length,
        last_computed: aggregated.last_computed
      }
    })

  } catch (err) {
    console.error('Attribution breakdown error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
