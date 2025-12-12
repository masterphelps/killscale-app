import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Standard Meta conversion events (custom_event_type values)
const STANDARD_EVENTS = [
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
  { value: 'OTHER', label: 'Other' },
]

// Fetch conversion events for an ad account
// Returns standard Meta events - the pixel stats endpoint doesn't reliably
// return custom events in a format we can use for campaign creation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    // Get user's Meta connection to verify they're connected
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

    // Return the standard events list
    // These are the custom_event_type values that work with Meta's API
    return NextResponse.json({
      events: STANDARD_EVENTS
    })

  } catch (err) {
    console.error('Pixel events error:', err)
    return NextResponse.json({ error: 'Failed to fetch pixel events' }, { status: 500 })
  }
}
