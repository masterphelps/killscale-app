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

    // Fetch ads with their creative data from Meta
    const adsRes = await fetch(
      `https://graph.facebook.com/v18.0/${adsetId}/ads?fields=id,name,creative{id,body,title,link_description,object_story_spec}&limit=50&access_token=${accessToken}`
    )
    const adsData = await adsRes.json()

    if (adsData.error) {
      console.error('[adset-ads] Failed to fetch ads:', adsData.error)
      return NextResponse.json({ error: adsData.error.message }, { status: 400 })
    }

    // Transform the data to a simpler format
    const ads = (adsData.data || []).map((ad: any) => {
      const creative = ad.creative || {}
      const objectStorySpec = creative.object_story_spec || {}
      const linkData = objectStorySpec.link_data || {}

      return {
        id: ad.id,
        name: ad.name,
        creativeId: creative.id,
        primaryText: creative.body || linkData.message || '',
        headline: creative.title || linkData.name || '',
        description: creative.link_description || linkData.description || ''
      }
    })

    return NextResponse.json({ ads })

  } catch (err) {
    console.error('Adset ads error:', err)
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 })
  }
}
