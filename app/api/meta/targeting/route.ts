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
    const type = searchParams.get('type') // 'interest' or 'behavior'

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
    }

    if (!type || !['interest', 'behavior'].includes(type)) {
      return NextResponse.json({ error: 'Type must be "interest" or "behavior"' }, { status: 400 })
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

    // Map our type to Meta's search type
    const metaType = type === 'interest' ? 'adinterest' : 'adinterestsuggestion'

    // For behaviors, use adTargetingCategory with class=behaviors
    let searchUrl: string
    if (type === 'behavior') {
      // Search behaviors using targeting search
      searchUrl = `https://graph.facebook.com/v18.0/search?type=adTargetingCategory&class=behaviors&q=${encodeURIComponent(query)}&limit=15&access_token=${accessToken}`
    } else {
      // Search interests
      searchUrl = `https://graph.facebook.com/v18.0/search?type=adinterest&q=${encodeURIComponent(query)}&limit=15&access_token=${accessToken}`
    }

    const response = await fetch(searchUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta targeting search error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to search targeting options'
      }, { status: 400 })
    }

    // Return targeting options
    const options = result.data || []

    return NextResponse.json({
      success: true,
      options: options.map((opt: {
        id: string
        name: string
        audience_size_lower_bound?: number
        audience_size_upper_bound?: number
        path?: string[]
        description?: string
      }) => ({
        id: opt.id,
        name: opt.name,
        type,
        audienceSizeLower: opt.audience_size_lower_bound,
        audienceSizeUpper: opt.audience_size_upper_bound,
        path: opt.path,
        description: opt.description
      }))
    })

  } catch (err) {
    console.error('Search targeting error:', err)
    return NextResponse.json({ error: 'Failed to search targeting options' }, { status: 500 })
  }
}
