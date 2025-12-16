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

    // Fetch ad with creative details - url_tags lives inside creative.object_story_spec.link_data
    const adUrl = `https://graph.facebook.com/v18.0/${adId}?fields=id,name,creative{id,name,object_story_spec}&access_token=${accessToken}`

    console.log('[get-url-tags] Fetching:', adUrl.replace(accessToken, '[REDACTED]'))

    const response = await fetch(adUrl)
    const result = await response.json()

    console.log('[get-url-tags] Response:', JSON.stringify(result, null, 2))

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ad data'
      }, { status: 400 })
    }

    // url_tags location varies by creative type:
    // - link_data: stored as url_tags field
    // - video_data: NOT a separate field - embedded in the CTA link URL as query params
    const objectStorySpec = result.creative?.object_story_spec
    const linkData = objectStorySpec?.link_data
    const videoData = objectStorySpec?.video_data
    const creativeId = result.creative?.id || null

    let urlTags = ''
    if (linkData?.url_tags) {
      // For image/link ads, url_tags is a direct field
      urlTags = linkData.url_tags
    } else if (videoData?.call_to_action?.value?.link) {
      // For video ads, extract UTM params from the CTA link URL
      try {
        const ctaUrl = new URL(videoData.call_to_action.value.link)
        // Extract only UTM params from the query string
        const utmParams: string[] = []
        ctaUrl.searchParams.forEach((value, key) => {
          if (key.startsWith('utm_')) {
            utmParams.push(`${key}=${value}`)
          }
        })
        urlTags = utmParams.join('&')
      } catch {
        // Invalid URL, leave urlTags empty
      }
    }

    console.log('[get-url-tags] Extracted url_tags:', urlTags)

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
