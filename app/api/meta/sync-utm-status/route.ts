import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SyncUtmStatusRequest {
  userId: string
  adAccountId: string
  adIds: string[]
}

interface UtmStatusResult {
  [adId: string]: boolean  // true = has UTM params, false = no UTM params
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, adIds } = await request.json() as SyncUtmStatusRequest

    if (!userId || !adAccountId || !adIds || adIds.length === 0) {
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

    // Batch ads into groups of 50 (Meta's limit)
    const batchSize = 50
    const batches: string[][] = []
    for (let i = 0; i < adIds.length; i += batchSize) {
      batches.push(adIds.slice(i, i + batchSize))
    }

    console.log(`[sync-utm-status] Fetching UTM status for ${adIds.length} ads in ${batches.length} batches`)

    const utmStatus: UtmStatusResult = {}

    // Process batches (limit concurrency to avoid rate limits)
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(adId => fetchAdUtmStatus(adId, accessToken))
      )

      batchResults.forEach((result, index) => {
        utmStatus[batch[index]] = result
      })
    }

    console.log(`[sync-utm-status] Completed. Found UTM params on ${Object.values(utmStatus).filter(Boolean).length} of ${adIds.length} ads`)

    return NextResponse.json({
      success: true,
      utmStatus
    })

  } catch (err) {
    console.error('Sync UTM status error:', err)
    return NextResponse.json({ error: 'Failed to sync UTM status' }, { status: 500 })
  }
}

// Fetch UTM status for a single ad
async function fetchAdUtmStatus(adId: string, accessToken: string): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v18.0/${adId}?fields=creative{object_story_spec}&access_token=${accessToken}`
    const response = await fetch(url)
    const result = await response.json()

    if (result.error) {
      console.error(`[sync-utm-status] Error fetching ad ${adId}:`, result.error.message)
      return false
    }

    const objectStorySpec = result.creative?.object_story_spec
    if (!objectStorySpec) return false

    // Check for UTM params based on creative type
    const linkData = objectStorySpec.link_data
    const videoData = objectStorySpec.video_data

    if (linkData) {
      // Image/link ads: Check CTA link for utm_ params (same as video)
      const ctaLink = linkData.call_to_action?.value?.link
      if (ctaLink) {
        try {
          const url = new URL(ctaLink)
          let hasUtm = false
          url.searchParams.forEach((_, key) => {
            if (key.startsWith('utm_')) {
              hasUtm = true
            }
          })
          return hasUtm
        } catch {
          return false
        }
      }
      return false
    } else if (videoData) {
      // Video ads: Check if CTA link contains utm_ params
      const ctaLink = videoData.call_to_action?.value?.link
      if (ctaLink) {
        try {
          const url = new URL(ctaLink)
          // Check if any query param starts with utm_
          let hasUtm = false
          url.searchParams.forEach((_, key) => {
            if (key.startsWith('utm_')) {
              hasUtm = true
            }
          })
          return hasUtm
        } catch {
          return false
        }
      }
    }

    return false
  } catch (err) {
    console.error(`[sync-utm-status] Error processing ad ${adId}:`, err)
    return false
  }
}
