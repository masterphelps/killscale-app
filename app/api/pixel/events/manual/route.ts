import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ManualEventRequest {
  workspaceId: string
  eventType: string
  eventValue: number
  adId?: string        // If provided, attribute to this ad. If not, event is unattributed.
  notes?: string
  eventTime?: string   // ISO string, defaults to now
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ManualEventRequest
    const { workspaceId, eventType, eventValue, adId, notes, eventTime } = body

    if (!workspaceId || !eventType || eventValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, eventType, eventValue' },
        { status: 400 }
      )
    }

    // Get workspace and verify it exists
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, user_id, name')
      .eq('id', workspaceId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Get workspace pixel
    const { data: pixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    if (!pixel?.pixel_id) {
      return NextResponse.json(
        { error: 'Workspace does not have a pixel configured' },
        { status: 400 }
      )
    }

    const timestamp = eventTime ? new Date(eventTime) : new Date()

    // Insert the event - results are always whole, attributed to one ad (or unattributed)
    const { error: insertError } = await supabase
      .from('pixel_events')
      .insert({
        pixel_id: pixel.pixel_id,
        event_type: eventType,
        event_value: eventValue,
        event_currency: 'USD',
        utm_content: adId || null,  // utm_content = ad_id for attribution, null if unattributed
        source: 'manual',
        notes: notes || null,
        event_time: timestamp.toISOString(),
        client_id: `manual_${workspace.user_id}`,
        session_id: `manual_${Date.now()}`,
        page_url: 'manual://event'
      })

    if (insertError) {
      console.error('Error inserting manual event:', insertError)
      return NextResponse.json({ error: 'Failed to log event' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Event logged successfully',
      adId: adId || null
    })

  } catch (err) {
    console.error('Manual event error:', err)
    return NextResponse.json({ error: 'Failed to log event' }, { status: 500 })
  }
}
