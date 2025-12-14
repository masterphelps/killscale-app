import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pixelId = searchParams.get('pixelId')
  const userId = searchParams.get('userId')
  const limit = parseInt(searchParams.get('limit') || '20')

  if (!pixelId || !userId) {
    return NextResponse.json({ error: 'pixelId and userId required' }, { status: 400 })
  }

  try {
    // Verify pixel ownership
    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .select('pixel_id')
      .eq('pixel_id', pixelId)
      .eq('user_id', userId)
      .single()

    if (pixelError || !pixel) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch recent events for this pixel
    const { data: events, error } = await supabase
      .from('pixel_events')
      .select(`
        id,
        event_type,
        event_value,
        event_currency,
        utm_source,
        utm_content,
        page_url,
        event_time
      `)
      .eq('pixel_id', pixelId)
      .order('event_time', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to fetch pixel events:', error)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // Get summary stats
    const { data: stats } = await supabase
      .from('pixel_events')
      .select('event_type')
      .eq('pixel_id', pixelId)

    // Count by event type
    const eventCounts: Record<string, number> = {}
    stats?.forEach(e => {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1
    })

    return NextResponse.json({
      events: events || [],
      total: stats?.length || 0,
      byType: eventCounts
    })
  } catch (err) {
    console.error('Pixel events error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
