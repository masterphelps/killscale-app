import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface UpdateEventRequest {
  eventType?: string
  eventValue?: number
  adId?: string | null
  eventTime?: string
  notes?: string
}

// GET - Fetch a single event by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: event, error } = await supabase
      .from('pixel_events')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({ event })
  } catch (err) {
    console.error('Error fetching event:', err)
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 })
  }
}

// PUT - Update an event
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json() as UpdateEventRequest
    const { eventType, eventValue, adId, eventTime, notes } = body

    // First check if the event exists
    const { data: existingEvent, error: fetchError } = await supabase
      .from('pixel_events')
      .select('id, source')
      .eq('id', id)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Only allow editing manual events
    if (existingEvent.source !== 'manual') {
      return NextResponse.json(
        { error: 'Only manual events can be edited' },
        { status: 403 }
      )
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (eventType !== undefined) updateData.event_type = eventType
    if (eventValue !== undefined) updateData.event_value = eventValue
    if (adId !== undefined) updateData.utm_content = adId // null clears attribution
    if (eventTime !== undefined) updateData.event_time = eventTime
    if (notes !== undefined) {
      // Store notes in event_metadata JSON field
      updateData.event_metadata = { notes }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('pixel_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating event:', updateError)
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }

    return NextResponse.json({ success: true, event: updated })
  } catch (err) {
    console.error('Error updating event:', err)
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }
}

// DELETE - Remove an event
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // First check if the event exists and is manual
    const { data: existingEvent, error: fetchError } = await supabase
      .from('pixel_events')
      .select('id, source')
      .eq('id', id)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Only allow deleting manual events
    if (existingEvent.source !== 'manual') {
      return NextResponse.json(
        { error: 'Only manual events can be deleted' },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabase
      .from('pixel_events')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting event:', deleteError)
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting event:', err)
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }
}
