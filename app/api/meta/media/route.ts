import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface MediaImage {
  id: string
  hash: string
  name: string
  url: string
  width: number
  height: number
  createdTime: string
  bytes: number
}

export interface MediaVideo {
  id: string
  title: string
  thumbnailUrl: string
  source: string
  length: number
  width: number
  height: number
  createdTime: string
}

// Fetch all images and videos from an ad account's media library
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const type = searchParams.get('type') || 'all' // 'all', 'images', 'videos'

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const accessToken = connection.access_token
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    const images: MediaImage[] = []
    const videos: MediaVideo[] = []

    // Fetch images
    if (type === 'all' || type === 'images') {
      const imagesUrl = `${META_GRAPH_URL}/act_${cleanAdAccountId}/adimages?fields=id,hash,name,url,url_128,width,height,created_time,bytes&limit=100&access_token=${accessToken}`

      const imagesRes = await fetch(imagesUrl)
      const imagesData = await imagesRes.json()

      if (imagesData.data && Array.isArray(imagesData.data)) {
        for (const img of imagesData.data) {
          // Skip images with no real name — these are tiny fragments, not real assets
          const imgName = (img.name || '').trim().toLowerCase()
          if (!imgName || imgName === 'untitled') continue
          images.push({
            id: img.id || img.hash,
            hash: img.hash,
            name: img.name || 'Untitled',
            url: img.url || img.url_128 || '',
            width: img.width || 0,
            height: img.height || 0,
            createdTime: img.created_time || new Date().toISOString(),
            bytes: img.bytes || 0
          })
        }
      }
    }

    // Fetch videos
    if (type === 'all' || type === 'videos') {
      const videosUrl = `${META_GRAPH_URL}/act_${cleanAdAccountId}/advideos?fields=id,title,thumbnails,source,length,created_time&limit=100&access_token=${accessToken}`

      const videosRes = await fetch(videosUrl)
      const videosData = await videosRes.json()

      if (videosData.data && Array.isArray(videosData.data)) {
        for (const vid of videosData.data) {
          // Skip videos with no real title — these are fragments, not real assets
          const vidTitle = (vid.title || '').trim().toLowerCase()
          if (!vidTitle || vidTitle === 'untitled' || vidTitle === 'untitled video') continue
          // Get the best thumbnail
          let thumbnailUrl = ''
          if (vid.thumbnails && vid.thumbnails.data && vid.thumbnails.data.length > 0) {
            // Prefer larger thumbnails
            const thumbs = vid.thumbnails.data.sort((a: { width: number }, b: { width: number }) =>
              (b.width || 0) - (a.width || 0)
            )
            thumbnailUrl = thumbs[0].uri || ''
          }

          videos.push({
            id: vid.id,
            title: vid.title || 'Untitled Video',
            thumbnailUrl,
            source: vid.source || '',
            length: vid.length || 0,
            width: 0, // Not always available
            height: 0,
            createdTime: vid.created_time || new Date().toISOString()
          })
        }
      }
    }

    // Sort by created time (newest first)
    images.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
    videos.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())

    return NextResponse.json({ images, videos })

  } catch (err) {
    console.error('Media fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch media library' }, { status: 500 })
  }
}
