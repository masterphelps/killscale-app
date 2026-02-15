import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Fetches deduplicated reach & frequency from Meta for a date range.
 *
 * Meta's frequency = impressions / reach, where reach is unique people.
 * Daily reach values can't be summed (same person on day 1 and day 2 = reach 1, not 2).
 * This endpoint asks Meta for the PERIOD-level frequency (no time_increment),
 * which gives the correct deduplicated number matching Ads Manager.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, since, until } = await request.json() as {
      userId: string
      adAccountId: string
      since: string
      until: string
    }

    if (!userId || !adAccountId || !since || !until) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Fetch period-level insights (no time_increment = one row per ad for the full range)
    // Must explicitly request ad_id — Meta doesn't include it automatically even with level=ad
    const fields = 'ad_id,reach,frequency'
    const url = new URL(`${META_GRAPH_URL}/${adAccountId}/insights`)
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('fields', fields)
    url.searchParams.set('level', 'ad')
    url.searchParams.set('time_range', JSON.stringify({ since, until }))
    url.searchParams.set('limit', '500')
    // No time_increment — Meta returns one deduplicated row per ad

    console.log('[Frequency] Fetching for', adAccountId, 'since', since, 'until', until)

    // Paginate through all results
    const frequencyMap: Record<string, { reach: number; frequency: number }> = {}
    let nextUrl: string | null = url.toString()
    let pageCount = 0
    const maxPages = 20

    while (nextUrl && pageCount < maxPages) {
      const currentUrl: string = nextUrl
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(currentUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      const result = await res.json()

      if (result.error) {
        console.error('[Frequency] Meta API error:', result.error)
        return NextResponse.json({ frequencyMap: {} })
      }

      if (result.data && Array.isArray(result.data)) {
        for (const row of result.data) {
          const adId = row.ad_id
          if (!adId) continue
          frequencyMap[adId] = {
            reach: row.reach ? parseInt(row.reach) : 0,
            frequency: row.frequency ? parseFloat(row.frequency) : 0,
          }
        }
      }

      nextUrl = result.paging?.next || null
      pageCount++

      if (nextUrl) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    console.log('[Frequency] Got', Object.keys(frequencyMap).length, 'ads with frequency data')
    return NextResponse.json({ frequencyMap })
  } catch (err) {
    console.error('[Frequency] Error:', err)
    return NextResponse.json({ frequencyMap: {} })
  }
}
