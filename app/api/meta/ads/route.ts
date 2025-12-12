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

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Fetch ads for the ad set
    const adsUrl = `https://graph.facebook.com/v18.0/${adsetId}/ads?fields=id,name,status,creative{id,name,thumbnail_url,image_url,object_story_spec}&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${accessToken}`

    const response = await fetch(adsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ads'
      }, { status: 400 })
    }

    const ads = result.data || []

    return NextResponse.json({
      success: true,
      ads: ads.map((ad: {
        id: string
        name: string
        status: string
        creative?: {
          id: string
          name?: string
          thumbnail_url?: string
          image_url?: string
          object_story_spec?: unknown
        }
      }) => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        creative: ad.creative ? {
          id: ad.creative.id,
          name: ad.creative.name,
          thumbnailUrl: ad.creative.thumbnail_url,
          imageUrl: ad.creative.image_url,
          hasCreative: true
        } : null
      }))
    })

  } catch (err) {
    console.error('Fetch ads error:', err)
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 })
  }
}
