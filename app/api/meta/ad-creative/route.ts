import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch creative ID(s) from source ad(s)
// Query: ?adIds=123,456,789&userId=xxx OR ?adId=123&userId=xxx (single ad with full details)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adIdsParam = searchParams.get('adIds')
    const singleAdId = searchParams.get('adId')
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }

    // Single ad mode - fetch full creative details including copy
    if (singleAdId) {
      const { data: connection, error: connectionError } = await supabase
        .from('meta_connections')
        .select('access_token')
        .eq('user_id', userId)
        .single()

      if (connectionError || !connection?.access_token) {
        return NextResponse.json({ error: 'Meta connection not found' }, { status: 401 })
      }

      const accessToken = connection.access_token

      // Fetch ad with creative details
      const response = await fetch(
        `${META_GRAPH_URL}/${singleAdId}?fields=id,name,creative{id,body,title,link_description,object_story_spec}&access_token=${accessToken}`
      )

      if (!response.ok) {
        const error = await response.json()
        return NextResponse.json({ error: error.error?.message || 'Failed to fetch ad creative' }, { status: 400 })
      }

      const data = await response.json()
      return NextResponse.json({ creative: data.creative || {} })
    }

    // Multiple ads mode (original behavior)
    if (!adIdsParam) {
      return NextResponse.json({ error: 'Missing adIds or adId parameter' }, { status: 400 })
    }

    const adIds = adIdsParam.split(',').filter(id => id.trim())
    if (adIds.length === 0) {
      return NextResponse.json({ error: 'No valid ad IDs provided' }, { status: 400 })
    }

    // Get access token from user's meta connection
    const { data: connection, error: connectionError } = await supabase
      .from('meta_connections')
      .select('access_token')
      .eq('user_id', userId)
      .single()

    if (connectionError || !connection?.access_token) {
      return NextResponse.json({ error: 'Meta connection not found' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Rate limiting constants - avoid hitting Meta API limits
    const BATCH_SIZE = 3
    const BATCH_DELAY_MS = 200
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Helper function to fetch creative for a single ad
    const fetchCreative = async (adId: string) => {
      try {
        const response = await fetch(
          `${META_GRAPH_URL}/${adId}?fields=id,name,creative{id,name,effective_object_story_id}&access_token=${accessToken}`
        )

        if (!response.ok) {
          const error = await response.json()
          console.error(`Failed to fetch creative for ad ${adId}:`, error)
          return { adId, error: error.error?.message || 'Failed to fetch creative' }
        }

        const data = await response.json()
        return {
          adId,
          adName: data.name,
          creativeId: data.creative?.id || null,
          creativeName: data.creative?.name || null
        }
      } catch (err) {
        console.error(`Error fetching creative for ad ${adId}:`, err)
        return { adId, error: 'Network error' }
      }
    }

    // Fetch creative IDs in batches to avoid rate limiting
    const results: Array<{ adId: string; adName?: string; creativeId?: string | null; creativeName?: string | null; error?: string }> = []

    for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
      const batch = adIds.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(batch.map(fetchCreative))
      results.push(...batchResults)

      // Add delay between batches (not after last batch)
      if (i + BATCH_SIZE < adIds.length) {
        await delay(BATCH_DELAY_MS)
      }
    }

    // Separate successful and failed results
    const successful = results.filter(r => !r.error && r.creativeId)
    const failed = results.filter(r => r.error || !r.creativeId)

    return NextResponse.json({
      creatives: successful,
      failed: failed.length > 0 ? failed : undefined,
      total: adIds.length,
      successCount: successful.length
    })
  } catch (err) {
    console.error('Ad creative fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch ad creatives' }, { status: 500 })
  }
}
