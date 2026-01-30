import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch playable video source URL.
// First checks Supabase Storage (zero API calls), falls back to Meta API.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const videoId = searchParams.get('videoId')

    if (!userId || !videoId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Check Supabase Storage first — if we have the video stored, return immediately (zero Meta API calls)
    const { data: mediaRow } = await supabase
      .from('media_library')
      .select('storage_url')
      .eq('user_id', userId)
      .eq('media_hash', videoId)
      .eq('download_status', 'complete')
      .not('storage_url', 'is', null)
      .single()

    if (mediaRow?.storage_url) {
      return NextResponse.json({ source: mediaRow.storage_url })
    }

    // Fallback: fetch from Meta API
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (!connection || new Date(connection.token_expires_at) <= new Date()) {
      return NextResponse.json({ error: 'No valid Meta connection' }, { status: 401 })
    }

    const videoUrl = `https://graph.facebook.com/v21.0/${videoId}?fields=source&access_token=${connection.access_token}`
    const res = await fetch(videoUrl)
    const data = await res.json()

    if (data.error) {
      console.error('[VideoSource] Meta API error:', data.error)
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    return NextResponse.json({ source: data.source || null })
  } catch (err) {
    console.error('[VideoSource] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch video source' }, { status: 500 })
  }
}
