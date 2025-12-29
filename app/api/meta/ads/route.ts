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
    const adsetId = searchParams.get('adsetId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adsetId) {
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

    // Fetch ads for the ad set - include all non-deleted statuses
    // Statuses: ACTIVE, PAUSED, PENDING_REVIEW, IN_PROCESS, WITH_ISSUES, DISAPPROVED, PREAPPROVED, CAMPAIGN_PAUSED, ADSET_PAUSED
    const adsUrl = `https://graph.facebook.com/v18.0/${adsetId}/ads?fields=id,name,status,effective_status,creative{id,name,thumbnail_url,image_url,object_story_spec}&filtering=[{"field":"effective_status","operator":"NOT_IN","value":["DELETED","ARCHIVED"]}]&access_token=${accessToken}`

    const response = await fetch(adsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      // Fall back to database - get ads from ad_data
      let query = supabase
        .from('ad_data')
        .select('ad_id, ad_name, status')
        .eq('user_id', userId)
        .eq('adset_id', adsetId)

      if (adAccountId) {
        query = query.eq('ad_account_id', adAccountId)
      }

      const { data: dbAds } = await query

      if (dbAds && dbAds.length > 0) {
        // Get unique ads
        const uniqueAds = new Map<string, { id: string; name: string; status: string }>()
        for (const row of dbAds) {
          if (row.ad_id && !uniqueAds.has(row.ad_id)) {
            uniqueAds.set(row.ad_id, {
              id: row.ad_id,
              name: row.ad_name || 'Unknown',
              status: row.status || 'UNKNOWN'
            })
          }
        }
        return NextResponse.json({
          success: true,
          fromCache: true,
          ads: Array.from(uniqueAds.values()).map(ad => ({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            effectiveStatus: ad.status,
            creative: null
          }))
        })
      }

      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ads'
      }, { status: 400 })
    }

    const ads = result.data || []

    // Type for ad from Meta API
    type MetaAd = {
      id: string
      name: string
      status: string
      effective_status: string
      creative?: {
        id: string
        name?: string
        thumbnail_url?: string
        image_url?: string
        object_story_spec?: {
          video_data?: {
            video_id?: string
            image_url?: string
          }
          link_data?: {
            image_url?: string
            picture?: string
          }
          photo_data?: {
            url?: string
          }
        }
      }
    }

    // Collect video IDs that need high-quality thumbnails
    const videoAds: { adId: string; videoId: string }[] = []
    for (const ad of ads as MetaAd[]) {
      const videoId = ad.creative?.object_story_spec?.video_data?.video_id
      if (videoId) {
        videoAds.push({ adId: ad.id, videoId })
      }
    }

    // Fetch all video thumbnails in parallel for performance
    const videoThumbnailMap = new Map<string, string>()
    if (videoAds.length > 0) {
      try {
        const thumbnailResults = await Promise.all(
          videoAds.map(async ({ adId, videoId }) => {
            try {
              const videoUrl = `https://graph.facebook.com/v18.0/${videoId}?fields=thumbnails&access_token=${accessToken}`
              const videoRes = await fetch(videoUrl)
              const videoData = await videoRes.json()
              const thumbnails = videoData.thumbnails?.data || []
              if (thumbnails.length > 0) {
                // Pick the largest thumbnail (highest width)
                const best = thumbnails.sort((a: { width?: number }, b: { width?: number }) =>
                  (b.width || 0) - (a.width || 0)
                )[0]
                return { adId, uri: best.uri }
              }
              return { adId, uri: null }
            } catch {
              return { adId, uri: null }
            }
          })
        )
        for (const { adId, uri } of thumbnailResults) {
          if (uri) videoThumbnailMap.set(adId, uri)
        }
      } catch (err) {
        console.error('Failed to fetch video thumbnails:', err)
      }
    }

    // Build response with high-quality thumbnails
    return NextResponse.json({
      success: true,
      ads: (ads as MetaAd[]).map((ad) => {
        // Determine high-quality thumbnail URL
        let highQualityThumbnail: string | null = null

        // Priority 1: Video thumbnail (fetched from video endpoint - highest quality)
        if (videoThumbnailMap.has(ad.id)) {
          highQualityThumbnail = videoThumbnailMap.get(ad.id) || null
        }
        // Priority 2: Video data image_url (good quality fallback for videos)
        else if (ad.creative?.object_story_spec?.video_data?.image_url) {
          highQualityThumbnail = ad.creative.object_story_spec.video_data.image_url
        }
        // Priority 3: Link data image_url (high quality for link ads)
        else if (ad.creative?.object_story_spec?.link_data?.image_url) {
          highQualityThumbnail = ad.creative.object_story_spec.link_data.image_url
        }
        // Priority 4: Link data picture (alternative for link ads)
        else if (ad.creative?.object_story_spec?.link_data?.picture) {
          highQualityThumbnail = ad.creative.object_story_spec.link_data.picture
        }
        // Priority 5: Photo data url (for photo ads)
        else if (ad.creative?.object_story_spec?.photo_data?.url) {
          highQualityThumbnail = ad.creative.object_story_spec.photo_data.url
        }
        // Priority 6: Creative image_url (better than thumbnail_url)
        else if (ad.creative?.image_url) {
          highQualityThumbnail = ad.creative.image_url
        }

        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          effectiveStatus: ad.effective_status,
          creative: ad.creative ? {
            id: ad.creative.id,
            name: ad.creative.name,
            thumbnailUrl: ad.creative.thumbnail_url,  // Keep for fallback (low quality)
            imageUrl: ad.creative.image_url,
            highQualityThumbnail,  // NEW: High quality image/video thumbnail
            hasCreative: true
          } : null
        }
      })
    })

  } catch (err) {
    console.error('Fetch ads error:', err)
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 })
  }
}
