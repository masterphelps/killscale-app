import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TargetingOption {
  id: string
  name: string
}

interface CustomTargeting {
  locationType: 'city' | 'country'
  locationKey?: string
  locationRadius?: number
  countries?: string[]
  ageMin: number
  ageMax: number
  targetingMode: 'broad' | 'custom'
  interests?: TargetingOption[]
  behaviors?: TargetingOption[]
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adsetId, targeting } = await request.json() as {
      userId: string
      adsetId: string
      targeting: CustomTargeting
    }

    if (!userId || !adsetId || !targeting) {
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

    // Build Meta targeting object
    const metaTargeting: Record<string, unknown> = {
      geo_locations: targeting.locationType === 'city' && targeting.locationKey
        ? {
            cities: [{
              key: targeting.locationKey,
              radius: targeting.locationRadius || 25,
              distance_unit: 'mile'
            }]
          }
        : {
            countries: targeting.countries || ['US']
          },
      age_min: targeting.ageMin || 18,
      age_max: targeting.ageMax || 65
    }

    // Add detailed targeting if custom mode
    if (targeting.targetingMode === 'custom') {
      const flexibleSpecEntry: Record<string, unknown> = {}

      if (targeting.interests && targeting.interests.length > 0) {
        flexibleSpecEntry.interests = targeting.interests.map(i => ({
          id: i.id,
          name: i.name
        }))
      }

      if (targeting.behaviors && targeting.behaviors.length > 0) {
        flexibleSpecEntry.behaviors = targeting.behaviors.map(b => ({
          id: b.id,
          name: b.name
        }))
      }

      if (Object.keys(flexibleSpecEntry).length > 0) {
        metaTargeting.flexible_spec = [flexibleSpecEntry]
      }
    }

    // Update the adset targeting via Meta API
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${adsetId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targeting: metaTargeting,
          access_token: accessToken
        })
      }
    )

    const data = await res.json()

    if (data.error) {
      console.error('[update-adset-targeting] Meta API error:', data.error)
      const errorMsg = data.error.error_user_msg || data.error.message || 'Failed to update targeting'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Update adset targeting error:', err)
    return NextResponse.json({ error: 'Failed to update targeting' }, { status: 500 })
  }
}
