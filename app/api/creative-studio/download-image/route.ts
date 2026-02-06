import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
    }

    console.log('[Download Image] Downloading:', url)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      console.error('[Download Image] Failed to download:', response.status)
      return NextResponse.json({ error: 'Failed to download image' }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    console.log('[Download Image] Downloaded successfully, size:', Math.round(base64.length / 1024), 'KB')

    return NextResponse.json({
      base64,
      mimeType: contentType.split(';')[0],
    })
  } catch (err) {
    console.error('[Download Image] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Download failed' },
      { status: 500 }
    )
  }
}
