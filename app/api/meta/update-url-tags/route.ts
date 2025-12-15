import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, adId, urlTags } = await request.json() as {
      userId: string
      adId: string
      urlTags: string  // e.g., "utm_source=facebook&utm_medium=paid&..."
    }

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

    // Update url_tags directly on the ad
    // Meta allows setting url_tags at the ad level which overrides creative-level tags
    const updateUrl = `https://graph.facebook.com/v18.0/${adId}`
    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url_tags: urlTags || '',
        access_token: accessToken
      })
    })

    const updateResult = await updateResponse.json()

    if (updateResult.error) {
      console.error('Meta API error updating ad url_tags:', updateResult.error)
      return NextResponse.json({
        error: updateResult.error.message || 'Failed to update URL tags'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'URL tags updated successfully',
      urlTags
    })

  } catch (err) {
    console.error('Update URL tags error:', err)
    return NextResponse.json({ error: 'Failed to update URL tags' }, { status: 500 })
  }
}
