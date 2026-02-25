import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const genre = searchParams.get('genre') || ''
  const page = searchParams.get('page') || '1'

  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ tracks: [], total: 0 })
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q: q || genre || 'background music',
      page,
      per_page: '20',
    })

    const response = await fetch(`https://pixabay.com/api/?${params}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      return NextResponse.json({ tracks: [], total: 0 })
    }

    const data = await response.json()

    const tracks = (data.hits || []).map((hit: any) => ({
      id: String(hit.id),
      title: hit.tags?.split(',')[0]?.trim() || 'Untitled',
      artist: hit.user || 'Unknown',
      duration: hit.duration || 0,
      previewUrl: hit.previewURL || '',
      genre: genre || 'all',
      thumbnailUrl: hit.previewURL || '',
    }))

    return NextResponse.json({ tracks, total: data.totalHits || 0 })
  } catch (error) {
    console.error('Music search error:', error)
    return NextResponse.json({ tracks: [], total: 0 })
  }
}
