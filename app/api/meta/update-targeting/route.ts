import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, adsetId, targeting } = await request.json() as {
      userId: string
      adsetId: string
      targeting: {
        geo_locations?: { countries?: string[], cities?: Array<{ key: string }> }
        age_min?: number
        age_max?: number
        genders?: number[]
      }
    }

    if (!userId || !adsetId || !targeting) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    const metaUrl = `https://graph.facebook.com/v18.0/${adsetId}`
    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targeting,
        access_token: connection.access_token
      })
    })

    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to update targeting'
      }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Targeting updated successfully' })

  } catch (err) {
    console.error('Update targeting error:', err)
    return NextResponse.json({ error: 'Failed to update targeting' }, { status: 500 })
  }
}
