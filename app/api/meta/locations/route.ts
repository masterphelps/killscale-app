import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const query = searchParams.get('q')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Search for cities
    const locationsUrl = `https://graph.facebook.com/v18.0/search?type=adgeolocation&location_types=city&q=${encodeURIComponent(query)}&access_token=${accessToken}`

    const response = await fetch(locationsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to search locations'
      }, { status: 400 })
    }

    // Return locations list
    const locations = result.data || []

    return NextResponse.json({
      success: true,
      locations: locations.map((loc: {
        key: string
        name: string
        region: string
        country_name: string
        type: string
      }) => ({
        key: loc.key,
        name: loc.name,
        region: loc.region,
        countryName: loc.country_name,
        type: loc.type
      }))
    })

  } catch (err) {
    console.error('Search locations error:', err)
    return NextResponse.json({ error: 'Failed to search locations' }, { status: 500 })
  }
}
