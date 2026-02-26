import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const genre = searchParams.get('genre') || ''

  let query = supabase
    .from('music_tracks')
    .select('id, title, artist, duration_seconds, genre, tags, storage_url')
    .order('title')

  if (genre) {
    // Map UI genre filters to actual DB genres (case-insensitive partial match)
    query = query.ilike('genre', `%${genre}%`)
  }

  if (q) {
    // Search across title, artist, genre, and tags
    query = query.or(`title.ilike.%${q}%,artist.ilike.%${q}%,genre.ilike.%${q}%,tags.ilike.%${q}%`)
  }

  const { data, error } = await query.limit(100)

  if (error) {
    console.error('[Music Search] Error:', error)
    return NextResponse.json({ tracks: [], total: 0 })
  }

  const tracks = (data || []).map(t => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration_seconds,
    previewUrl: t.storage_url,
    genre: t.genre,
  }))

  return NextResponse.json({ tracks, total: tracks.length })
}
