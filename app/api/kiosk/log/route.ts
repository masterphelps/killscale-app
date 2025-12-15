import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface KioskLogRequest {
  eventValue: number
  adId?: string
  notes?: string
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-kiosk-session')

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token' },
        { status: 401 }
      )
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('kiosk_sessions')
      .select('workspace_id, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    const body = await request.json() as KioskLogRequest
    const { eventValue, adId, notes } = body

    if (!eventValue || eventValue <= 0) {
      return NextResponse.json(
        { error: 'Invalid event value' },
        { status: 400 }
      )
    }

    const workspaceId = session.workspace_id

    // Get workspace and pixel
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, user_id, name')
      .eq('id', workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    const { data: pixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    if (!pixel?.pixel_id) {
      return NextResponse.json(
        { error: 'No pixel configured' },
        { status: 400 }
      )
    }

    const timestamp = new Date()

    // If specific ad provided, create single event
    if (adId) {
      const { error: insertError } = await supabase
        .from('pixel_events')
        .insert({
          pixel_id: pixel.pixel_id,
          event_type: 'purchase',
          event_value: eventValue,
          event_currency: 'USD',
          utm_content: adId,
          source: 'kiosk',
          notes: notes || null,
          event_time: timestamp.toISOString(),
          client_id: `kiosk_${workspace.user_id}`,
          session_id: `kiosk_${Date.now()}`,
          page_url: 'kiosk://walk-in'
        })

      if (insertError) {
        console.error('Kiosk event insert error:', insertError)
        return NextResponse.json(
          { error: 'Failed to log event' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Walk-in logged',
        attribution: 'single',
        adId
      })
    }

    // No specific ad - split by spend
    const { data: accounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No ad accounts in workspace' },
        { status: 400 }
      )
    }

    const accountIds = accounts.map(a => a.ad_account_id)

    // Get ads with spend in last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: adsWithSpend } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, spend')
      .in('ad_account_id', accountIds)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .gt('spend', 0)

    if (!adsWithSpend || adsWithSpend.length === 0) {
      return NextResponse.json(
        { error: 'No active ads found' },
        { status: 400 }
      )
    }

    // Aggregate spend by ad_id
    const adSpendMap = new Map<string, { name: string; spend: number }>()
    for (const row of adsWithSpend) {
      const existing = adSpendMap.get(row.ad_id)
      if (existing) {
        existing.spend += parseFloat(row.spend) || 0
      } else {
        adSpendMap.set(row.ad_id, {
          name: row.ad_name,
          spend: parseFloat(row.spend) || 0
        })
      }
    }

    const totalSpend = Array.from(adSpendMap.values()).reduce((sum, ad) => sum + ad.spend, 0)

    if (totalSpend === 0) {
      return NextResponse.json(
        { error: 'No spend data for attribution' },
        { status: 400 }
      )
    }

    // Create split events
    const eventsToInsert = []
    const breakdown = []

    for (const [adIdKey, adData] of Array.from(adSpendMap.entries())) {
      const spendPct = adData.spend / totalSpend
      const attributedValue = Math.round(eventValue * spendPct * 100) / 100

      if (attributedValue > 0) {
        eventsToInsert.push({
          pixel_id: pixel.pixel_id,
          event_type: 'purchase',
          event_value: attributedValue,
          event_currency: 'USD',
          utm_content: adIdKey,
          source: 'kiosk_split',
          notes: notes ? `${notes} (${Math.round(spendPct * 100)}%)` : `Split: ${Math.round(spendPct * 100)}%`,
          event_time: timestamp.toISOString(),
          client_id: `kiosk_${workspace.user_id}`,
          session_id: `kiosk_${Date.now()}`,
          page_url: 'kiosk://walk-in-split'
        })

        breakdown.push({
          adId: adIdKey,
          adName: adData.name,
          percentage: Math.round(spendPct * 100),
          value: attributedValue
        })
      }
    }

    const { error: insertError } = await supabase
      .from('pixel_events')
      .insert(eventsToInsert)

    if (insertError) {
      console.error('Kiosk split events error:', insertError)
      return NextResponse.json(
        { error: 'Failed to log events' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Walk-in split across ${eventsToInsert.length} ads`,
      attribution: 'split',
      breakdown
    })

  } catch (err) {
    console.error('Kiosk log error:', err)
    return NextResponse.json(
      { error: 'Failed to log walk-in' },
      { status: 500 }
    )
  }
}
