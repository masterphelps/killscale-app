import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const adsetId = searchParams.get('adsetId')

    if (!userId || !adsetId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Fetch adset targeting from Meta
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${adsetId}?fields=targeting&access_token=${accessToken}`
    )
    const data = await res.json()

    if (data.error) {
      console.error('[get-adset-targeting] Meta API error:', data.error)
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    const targeting = data.targeting || {}

    // Transform Meta targeting to our format
    const result = {
      locationType: targeting.geo_locations?.cities?.length ? 'city' : 'country',
      locationKey: targeting.geo_locations?.cities?.[0]?.key || '',
      locationName: targeting.geo_locations?.cities?.[0]?.name || '',
      locationRadius: targeting.geo_locations?.cities?.[0]?.radius || 25,
      countries: targeting.geo_locations?.countries || ['US'],
      ageMin: targeting.age_min || 18,
      ageMax: targeting.age_max || 65,
      targetingMode: targeting.flexible_spec?.[0]?.interests?.length ? 'custom' : 'broad',
      interests: targeting.flexible_spec?.[0]?.interests?.map((i: { id: string; name: string }) => ({
        id: i.id,
        name: i.name,
        type: 'interest'
      })) || [],
      behaviors: targeting.flexible_spec?.[0]?.behaviors?.map((b: { id: string; name: string }) => ({
        id: b.id,
        name: b.name,
        type: 'behavior'
      })) || []
    }

    return NextResponse.json({ success: true, targeting: result })

  } catch (err) {
    console.error('Get adset targeting error:', err)
    return NextResponse.json({ error: 'Failed to fetch targeting' }, { status: 500 })
  }
}
