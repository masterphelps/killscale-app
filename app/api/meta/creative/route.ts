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
    const creativeId = searchParams.get('creativeId')

    if (!userId || !creativeId) {
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

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Fetch creative details
    const creativeUrl = `https://graph.facebook.com/v18.0/${creativeId}?fields=id,name,thumbnail_url,image_url,image_hash,video_id,object_story_spec,asset_feed_spec,effective_object_story_id&access_token=${accessToken}`

    const response = await fetch(creativeUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch creative'
      }, { status: 400 })
    }

    // Extract preview URL from object_story_spec if available
    let previewUrl = result.thumbnail_url || result.image_url
    let mediaType: 'image' | 'video' | 'unknown' = 'unknown'

    let videoSource: string | undefined
    let videoId: string | undefined

    // Helper function to fetch video source and thumbnails
    const fetchVideoDetails = async (vId: string) => {
      try {
        // Include picture field as fallback for thumbnails
        const videoUrl = `https://graph.facebook.com/v18.0/${vId}?fields=source,thumbnails,picture&access_token=${accessToken}`
        console.log('[Creative] Fetching video details for:', vId)
        const videoResponse = await fetch(videoUrl)
        const videoData = await videoResponse.json()

        // Check for Meta API error
        if (videoData.error) {
          console.error('[Creative] Meta API error for video:', videoData.error)
          return { source: undefined, thumbnail: undefined }
        }

        console.log('[Creative] Video data received:', {
          hasSource: !!videoData.source,
          hasThumbnails: !!(videoData.thumbnails?.data?.length),
          hasPicture: !!videoData.picture
        })

        // Get source (playable video URL)
        const source = videoData.source || undefined

        // Get best thumbnail
        let thumbnail: string | undefined
        const thumbnails = videoData.thumbnails?.data || []
        if (thumbnails.length > 0) {
          const bestThumb = thumbnails.sort((a: { width?: number }, b: { width?: number }) =>
            (b.width || 0) - (a.width || 0)
          )[0]
          thumbnail = bestThumb?.uri
          console.log('[Creative] Best thumbnail:', { width: bestThumb?.width, hasUri: !!bestThumb?.uri })
        }

        // Fallback to picture field
        if (!thumbnail && videoData.picture) {
          thumbnail = videoData.picture
        }

        return { source, thumbnail }
      } catch (videoErr) {
        console.error('[Creative] Failed to fetch video details:', videoErr)
        return { source: undefined, thumbnail: undefined }
      }
    }

    if (result.video_id) {
      mediaType = 'video'
      videoId = result.video_id
      console.log('[Creative] Detected video_id from result:', result.video_id)

      const { source, thumbnail } = await fetchVideoDetails(result.video_id)
      if (source) {
        videoSource = source
      }
      if (thumbnail) {
        previewUrl = thumbnail
      }

      // Fallback to thumbnail_url if no high-quality thumbnail found
      if (!previewUrl && result.thumbnail_url) {
        previewUrl = result.thumbnail_url
      }
    } else if (result.image_url || result.image_hash) {
      mediaType = 'image'
      previewUrl = result.image_url
    }

    // Check object_story_spec for additional media info
    const storySpec = result.object_story_spec
    if (storySpec) {
      if (storySpec.video_data?.video_id) {
        mediaType = 'video'
        const storyVideoId = storySpec.video_data.video_id
        console.log('[Creative] Detected video_id from story spec:', storyVideoId)

        // Fetch video source and high-quality thumbnails if not already fetched
        if (!videoSource) {
          videoId = storyVideoId
          const { source, thumbnail } = await fetchVideoDetails(storyVideoId)
          if (source) {
            videoSource = source
          }
          if (thumbnail) {
            previewUrl = thumbnail
          }
        }

        // Fallback to story spec image_url if no high-quality thumbnail
        if (!previewUrl) {
          previewUrl = storySpec.video_data.image_url
        }
      } else if (storySpec.link_data?.image_hash || storySpec.link_data?.picture) {
        mediaType = 'image'
        previewUrl = storySpec.link_data.picture || previewUrl
      } else if (storySpec.photo_data?.image_hash) {
        mediaType = 'image'
      }
    }

    // Log final result for debugging
    console.log('[Creative] Final result:', {
      id: result.id,
      mediaType,
      hasVideoSource: !!videoSource,
      hasPreviewUrl: !!previewUrl,
      videoId: videoId || result.video_id
    })

    return NextResponse.json({
      success: true,
      creative: {
        id: result.id,
        name: result.name,
        thumbnailUrl: result.thumbnail_url,
        imageUrl: result.image_url,
        previewUrl,
        mediaType,
        videoId: videoId || result.video_id,
        videoSource,
        imageHash: result.image_hash
      }
    })

  } catch (err) {
    console.error('Fetch creative error:', err)
    return NextResponse.json({ error: 'Failed to fetch creative' }, { status: 500 })
  }
}
