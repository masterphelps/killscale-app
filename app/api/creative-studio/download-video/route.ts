import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  const filename = request.nextUrl.searchParams.get('filename') || 'video.mp4'

  if (!url) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // Only allow known storage domains
  const allowed = ['supabase.co', 'storage.googleapis.com']
  try {
    const parsed = new URL(url)
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return new Response('URL not allowed', { status: 403 })
    }
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }

  const res = await fetch(url)
  if (!res.ok) {
    return new Response(`Upstream error: ${res.status}`, { status: 502 })
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': res.headers.get('Content-Length') || '',
    },
  })
}
