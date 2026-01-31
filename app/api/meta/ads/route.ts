import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

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

    // Fetch ads for the ad set
    // No filtering - Meta's filtered endpoints have ~5min propagation delay for new/modified entities
    // We filter out DELETED/ARCHIVED client-side instead
    const adsUrl = `${META_GRAPH_URL}/${adsetId}/ads?fields=id,name,status,effective_status,creative{id,name,thumbnail_url,image_url,object_story_spec}&access_token=${accessToken}`

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

    const ads = (result.data || [])
      // Filter out DELETED/ARCHIVED client-side (avoids Meta's 5min propagation delay)
      .filter((ad: { effective_status?: string }) =>
        !['DELETED', 'ARCHIVED'].includes(ad.effective_status || '')
      )

    return NextResponse.json({
      success: true,
      ads: ads.map((ad: {
        id: string
        name: string
        status: string
        effective_status: string
        creative?: {
          id: string
          name?: string
          thumbnail_url?: string
          image_url?: string
          object_story_spec?: unknown
        }
      }) => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        creative: ad.creative ? {
          id: ad.creative.id,
          name: ad.creative.name,
          thumbnailUrl: ad.creative.thumbnail_url,
          imageUrl: ad.creative.image_url,
          hasCreative: true
        } : null
      }))
    })

  } catch (err) {
    console.error('Fetch ads error:', err)
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 })
  }
}
