import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fetch active pixel events for an ad account
// This returns both standard events (Purchase, Lead, etc.) and custom events
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const accessToken = connection.access_token
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Step 1: Get pixels for this ad account
    const pixelsUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
    const pixelsRes = await fetch(pixelsUrl)
    const pixelsData = await pixelsRes.json()

    if (pixelsData.error) {
      console.error('Pixels fetch error:', pixelsData.error)
      return NextResponse.json({ error: 'Failed to fetch pixels' }, { status: 400 })
    }

    if (!pixelsData.data || pixelsData.data.length === 0) {
      return NextResponse.json({
        events: [],
        message: 'No pixel found for this ad account'
      })
    }

    const pixelId = pixelsData.data[0].id

    // Step 2: Get stats for this pixel to see which events have activity
    // This shows us what events are actually firing
    const statsUrl = `https://graph.facebook.com/v18.0/${pixelId}/stats?aggregation=event&access_token=${accessToken}`
    const statsRes = await fetch(statsUrl)
    const statsData = await statsRes.json()

    // Build list of active events from stats
    const activeEvents: { value: string; label: string; count?: number }[] = []

    if (statsData.data && Array.isArray(statsData.data)) {
      // Stats data contains events that have actually fired
      statsData.data.forEach((stat: { event: string; count?: number }) => {
        if (stat.event) {
          // Convert event name to a readable label
          const label = stat.event
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase())

          activeEvents.push({
            value: stat.event,
            label: label,
            count: stat.count
          })
        }
      })
    }

    // Also include standard events that Meta supports, even if not active yet
    // These are the custom_event_type values Meta accepts
    const standardEvents = [
      { value: 'PURCHASE', label: 'Purchase' },
      { value: 'LEAD', label: 'Lead' },
      { value: 'COMPLETE_REGISTRATION', label: 'Complete Registration' },
      { value: 'ADD_TO_CART', label: 'Add to Cart' },
      { value: 'INITIATE_CHECKOUT', label: 'Initiate Checkout' },
      { value: 'ADD_PAYMENT_INFO', label: 'Add Payment Info' },
      { value: 'SUBSCRIBE', label: 'Subscribe' },
      { value: 'CONTACT', label: 'Contact' },
      { value: 'SUBMIT_APPLICATION', label: 'Submit Application' },
      { value: 'START_TRIAL', label: 'Start Trial' },
      { value: 'SCHEDULE', label: 'Schedule' },
      { value: 'SEARCH', label: 'Search' },
      { value: 'VIEW_CONTENT', label: 'View Content' },
      { value: 'CONTENT_VIEW', label: 'Content View' },
      { value: 'OTHER', label: 'Other' },
    ]

    // Return active pixel events and standard events separately
    return NextResponse.json({
      pixelId,
      pixelName: pixelsData.data[0].name,
      activeEvents,      // Events actually firing on the pixel
      standardEvents     // Standard Meta events
    })

  } catch (err) {
    console.error('Pixel events error:', err)
    return NextResponse.json({ error: 'Failed to fetch pixel events' }, { status: 500 })
  }
}
