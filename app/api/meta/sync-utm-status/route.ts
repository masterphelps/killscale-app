/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  FRAGILE CODE - DO NOT MODIFY WITHOUT APPROVAL  ⚠️                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This file uses Meta's Batch API to avoid rate limits.                    ║
 * ║  Changes here have caused production rate limit issues in the past.       ║
 * ║                                                                           ║
 * ║  Before modifying:                                                        ║
 * ║  1. Read the "FRAGILE CODE" section in CLAUDE.md                         ║
 * ║  2. Get explicit user approval                                           ║
 * ║  3. Test with a large account (100+ ads)                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

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

interface BatchRequest {
  method: string
  relative_url: string
}

interface BatchResponse {
  code: number
  body: string
}

// Helper to delay between batch requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

    // ══════════════════════════════════════════════════════════════════════════
    // CRITICAL: Use Meta Batch API to combine multiple ad requests into ONE HTTP call
    // This reduces API calls from N (one per ad) to N/50 (one batch call per 50 ads)
    // DO NOT revert to individual fetch() calls - this will hit rate limits
    // ══════════════════════════════════════════════════════════════════════════

    // Batch ads into groups of 50 (Meta's batch limit)
    const batchSize = 50
    const batches: string[][] = []
    for (let i = 0; i < adIds.length; i += batchSize) {
      batches.push(adIds.slice(i, i + batchSize))
    }

    console.log(`[sync-utm-status] Fetching UTM status for ${adIds.length} ads in ${batches.length} batch API calls`)

    const utmStatus: UtmStatusResult = {}

    // Process each batch using Meta Batch API (one HTTP call per 50 ads)
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]

      // Add delay between batches to avoid rate limits (1s, like sync route does)
      if (batchIndex > 0) {
        await delay(1000)
      }

      // Build batch request - each item fetches one ad's creative
      const batchRequests: BatchRequest[] = batch.map(adId => ({
        method: 'GET',
        relative_url: `${adId}?fields=creative{object_story_spec}`
      }))

      // Make single batch API call for up to 50 ads
      const batchUrl = `${META_GRAPH_URL}/?batch=${encodeURIComponent(
        JSON.stringify(batchRequests)
      )}&access_token=${accessToken}&include_headers=false`

      try {
        const batchResponse = await fetch(batchUrl, { method: 'POST' })
        const batchResults = await batchResponse.json() as BatchResponse[]

        if (!Array.isArray(batchResults)) {
          console.error('[sync-utm-status] Unexpected batch response:', batchResults)
          // Mark all ads in this batch as false (no UTM) on error
          batch.forEach(adId => { utmStatus[adId] = false })
          continue
        }

        // Parse each result in the batch
        batchResults.forEach((result, index) => {
          const adId = batch[index]

          if (result.code !== 200) {
            console.error(`[sync-utm-status] Error fetching ad ${adId}: code ${result.code}`)
            utmStatus[adId] = false
            return
          }

          try {
            const adData = JSON.parse(result.body || '{}')
            utmStatus[adId] = checkUtmParams(adData)
          } catch {
            utmStatus[adId] = false
          }
        })

      } catch (err) {
        console.error(`[sync-utm-status] Batch ${batchIndex + 1} failed:`, err)
        // Mark all ads in this batch as false on error
        batch.forEach(adId => { utmStatus[adId] = false })
      }
    }

    console.log(`[sync-utm-status] Completed. Found UTM params on ${Object.values(utmStatus).filter(Boolean).length} of ${adIds.length} ads`)

    // ══════════════════════════════════════════════════════════════════════════
    // Store results in Supabase for caching (reads don't hit Meta API)
    // ══════════════════════════════════════════════════════════════════════════
    const now = new Date().toISOString()
    const upsertData = Object.entries(utmStatus).map(([adId, hasUtm]) => ({
      user_id: userId,
      ad_account_id: adAccountId,
      ad_id: adId,
      has_utm: hasUtm,
      last_synced_at: now
    }))

    if (upsertData.length > 0) {
      const { error: upsertError } = await supabase
        .from('utm_status')
        .upsert(upsertData, { onConflict: 'user_id,ad_account_id,ad_id' })

      if (upsertError) {
        console.error('[sync-utm-status] Failed to store in Supabase:', upsertError)
        // Don't fail the request - we still have the data in memory
      } else {
        console.log(`[sync-utm-status] Stored ${upsertData.length} UTM status records in Supabase`)
      }
    }

    return NextResponse.json({
      success: true,
      utmStatus,
      lastSynced: now
    })

  } catch (err) {
    console.error('Sync UTM status error:', err)
    return NextResponse.json({ error: 'Failed to sync UTM status' }, { status: 500 })
  }
}

/**
 * Check if an ad's creative contains UTM parameters
 * Extracted from the old fetchAdUtmStatus function - DO NOT modify UTM detection logic
 */
function checkUtmParams(adData: { creative?: { object_story_spec?: {
  link_data?: { call_to_action?: { value?: { link?: string } } }
  video_data?: { call_to_action?: { value?: { link?: string } } }
} } }): boolean {
  const objectStorySpec = adData.creative?.object_story_spec
  if (!objectStorySpec) return false

  // Check for UTM params based on creative type
  const linkData = objectStorySpec.link_data
  const videoData = objectStorySpec.video_data

  if (linkData) {
    // Image/link ads: Check CTA link for utm_ params
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
}

/**
 * GET - Fetch cached UTM status from Supabase (no Meta API call)
 * This allows the UI to display cached data without hitting rate limits
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('utm_status')
      .select('ad_id, has_utm, last_synced_at')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)

    if (error) {
      console.error('[sync-utm-status GET] Supabase error:', error)
      return NextResponse.json({ error: 'Failed to fetch UTM status' }, { status: 500 })
    }

    // Convert to { [adId]: boolean } format
    const utmStatus: UtmStatusResult = {}
    let lastSynced: string | null = null

    if (data && data.length > 0) {
      data.forEach(row => {
        utmStatus[row.ad_id] = row.has_utm
      })
      // Use the most recent sync time
      lastSynced = data[0].last_synced_at
    }

    return NextResponse.json({
      utmStatus,
      lastSynced,
      cached: true
    })

  } catch (err) {
    console.error('Get UTM status error:', err)
    return NextResponse.json({ error: 'Failed to fetch UTM status' }, { status: 500 })
  }
}
