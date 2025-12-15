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
    const adId = searchParams.get('adId')

    if (!userId || !adId) {
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

    // Fetch ad with creative details including url_tags
    const adUrl = `https://graph.facebook.com/v18.0/${adId}?fields=id,name,creative{id,name,url_tags,object_story_spec}&access_token=${accessToken}`

    const response = await fetch(adUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ad data'
      }, { status: 400 })
    }

    // Extract url_tags from creative
    const urlTags = result.creative?.url_tags || ''
    const creativeId = result.creative?.id || null

    return NextResponse.json({
      success: true,
      adId: result.id,
      adName: result.name,
      creativeId,
      urlTags,
      // Also return parsed UTM params for easier editing
      parsedUtm: parseUrlTags(urlTags)
    })

  } catch (err) {
    console.error('Get URL tags error:', err)
    return NextResponse.json({ error: 'Failed to fetch URL tags' }, { status: 500 })
  }
}

// Parse url_tags string into key-value pairs
function parseUrlTags(urlTags: string): Record<string, string> {
  if (!urlTags) return {}

  const params: Record<string, string> = {}
  const pairs = urlTags.split('&')

  for (const pair of pairs) {
    const [key, value] = pair.split('=')
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '')
    }
  }

  return params
}
