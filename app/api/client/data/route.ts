import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Get client's workspace data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const workspaceId = searchParams.get('workspaceId')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      )
    }

    // Get workspaces where user is a member
    const { data: memberships, error: memberError } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        can_log_walkins,
        workspace:workspaces(
          id,
          name,
          client_show_spend,
          client_show_roas,
          client_show_revenue
        )
      `)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)

    if (memberError) {
      console.error('Fetch memberships error:', memberError)
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      )
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({
        workspaces: [],
        data: null
      })
    }

    // If no specific workspace requested, return list of workspaces
    if (!workspaceId) {
      return NextResponse.json({
        workspaces: memberships.map(m => {
          const ws = m.workspace as unknown as { id: string; name: string } | null
          return {
            id: ws?.id,
            name: ws?.name,
            role: m.role,
            canLogWalkins: m.can_log_walkins
          }
        })
      })
    }

    // Find the requested workspace membership
    const membership = memberships.find(m => {
      const ws = m.workspace as unknown as { id: string } | null
      return ws?.id === workspaceId
    })
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      )
    }

    const workspace = membership.workspace as unknown as {
      id: string
      name: string
      client_show_spend: boolean
      client_show_roas: boolean
      client_show_revenue: boolean
    }

    // Get workspace accounts
    const { data: accounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    const accountIds = accounts?.map(a => a.ad_account_id) || []

    // Get stats for last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    let totalSpend = 0
    let totalRevenue = 0
    let totalConversions = 0

    if (accountIds.length > 0) {
      const { data: adData } = await supabase
        .from('ad_data')
        .select('spend, revenue, purchases')
        .in('ad_account_id', accountIds)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])

      if (adData) {
        for (const row of adData) {
          totalSpend += parseFloat(row.spend) || 0
          totalRevenue += parseFloat(row.revenue) || 0
          totalConversions += parseInt(row.purchases) || 0
        }
      }
    }

    // Get pixel data for additional revenue
    const { data: pixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    let pixelRevenue = 0
    let recentWalkins: Array<{ value: number; notes: string | null; time: string }> = []

    if (pixel?.pixel_id) {
      const { data: events } = await supabase
        .from('pixel_events')
        .select('event_value, event_time, notes, source')
        .eq('pixel_id', pixel.pixel_id)
        .gte('event_time', sevenDaysAgo.toISOString())

      if (events) {
        pixelRevenue = events.reduce((sum, e) => sum + (parseFloat(e.event_value) || 0), 0)
      }

      // Get recent walk-ins if user can log them
      if (membership.can_log_walkins) {
        const { data: walkinEvents } = await supabase
          .from('pixel_events')
          .select('event_value, event_time, notes, source')
          .eq('pixel_id', pixel.pixel_id)
          .in('source', ['manual', 'kiosk', 'manual_split', 'kiosk_split'])
          .order('event_time', { ascending: false })
          .limit(10)

        if (walkinEvents) {
          const seenTimes = new Set<string>()
          recentWalkins = walkinEvents
            .filter(e => {
              const timeKey = e.event_time.substring(0, 19)
              if (seenTimes.has(timeKey)) return false
              seenTimes.add(timeKey)
              return true
            })
            .slice(0, 5)
            .map(e => ({
              value: parseFloat(e.event_value) || 0,
              notes: e.notes,
              time: e.event_time
            }))
        }
      }
    }

    // Use pixel revenue if higher than native
    const finalRevenue = Math.max(totalRevenue, pixelRevenue)
    const roas = totalSpend > 0 ? finalRevenue / totalSpend : 0

    // Get top performing ads
    let topAds: Array<{ adId: string; adName: string; roas: number; spend: number }> = []
    if (accountIds.length > 0) {
      const { data: adsData } = await supabase
        .from('ad_data')
        .select('ad_id, ad_name, spend, revenue')
        .in('ad_account_id', accountIds)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .gt('spend', 0)

      if (adsData) {
        const adMap = new Map<string, { name: string; spend: number; revenue: number }>()
        for (const row of adsData) {
          const existing = adMap.get(row.ad_id)
          if (existing) {
            existing.spend += parseFloat(row.spend) || 0
            existing.revenue += parseFloat(row.revenue) || 0
          } else {
            adMap.set(row.ad_id, {
              name: row.ad_name,
              spend: parseFloat(row.spend) || 0,
              revenue: parseFloat(row.revenue) || 0
            })
          }
        }

        topAds = Array.from(adMap.entries())
          .map(([adId, data]) => ({
            adId,
            adName: data.name,
            roas: data.spend > 0 ? data.revenue / data.spend : 0,
            spend: data.spend
          }))
          .sort((a, b) => b.roas - a.roas)
          .slice(0, 5)
      }
    }

    // Build response based on visibility settings
    const stats: Record<string, unknown> = {
      conversions: totalConversions
    }

    if (workspace.client_show_spend) {
      stats.spend = Math.round(totalSpend * 100) / 100
    }
    if (workspace.client_show_revenue) {
      stats.revenue = Math.round(finalRevenue * 100) / 100
    }
    if (workspace.client_show_roas) {
      stats.roas = Math.round(roas * 100) / 100
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name
      },
      role: membership.role,
      canLogWalkins: membership.can_log_walkins,
      stats,
      topAds: topAds.map(ad => ({
        adId: ad.adId,
        adName: ad.adName,
        roas: workspace.client_show_roas ? Math.round(ad.roas * 100) / 100 : undefined,
        spend: workspace.client_show_spend ? Math.round(ad.spend * 100) / 100 : undefined
      })),
      recentWalkins: membership.can_log_walkins ? recentWalkins : []
    })

  } catch (err) {
    console.error('Client data error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch client data' },
      { status: 500 }
    )
  }
}
