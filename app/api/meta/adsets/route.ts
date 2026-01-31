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
    const campaignId = searchParams.get('campaignId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !campaignId) {
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

    // Fetch ad sets for the campaign
    // No filtering - Meta's filtered endpoints have ~5min propagation delay for new/modified entities
    // We filter out DELETED/ARCHIVED client-side instead
    const adsetsUrl = `${META_GRAPH_URL}/${campaignId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event&access_token=${accessToken}`

    const response = await fetch(adsetsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      // Fall back to database - get unique adsets from ad_data
      let query = supabase
        .from('ad_data')
        .select('adset_id, adset_name, status')
        .eq('user_id', userId)
        .eq('campaign_id', campaignId)

      if (adAccountId) {
        query = query.eq('ad_account_id', adAccountId)
      }

      const { data: dbAdsets } = await query

      if (dbAdsets && dbAdsets.length > 0) {
        // Get unique adsets
        const uniqueAdsets = new Map<string, { id: string; name: string; status: string }>()
        for (const row of dbAdsets) {
          if (row.adset_id && !uniqueAdsets.has(row.adset_id)) {
            uniqueAdsets.set(row.adset_id, {
              id: row.adset_id,
              name: row.adset_name || 'Unknown',
              status: row.status || 'UNKNOWN'
            })
          }
        }
        return NextResponse.json({
          success: true,
          fromCache: true,
          adsets: Array.from(uniqueAdsets.values()).map(adset => ({
            id: adset.id,
            name: adset.name,
            status: adset.status,
            dailyBudget: null,
            lifetimeBudget: null,
            optimizationGoal: null,
            billingEvent: null
          }))
        })
      }

      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ad sets'
      }, { status: 400 })
    }

    const adsets = (result.data || [])
      // Filter out DELETED/ARCHIVED client-side (avoids Meta's 5min propagation delay)
      .filter((adset: { effective_status?: string }) =>
        !['DELETED', 'ARCHIVED'].includes(adset.effective_status || '')
      )

    return NextResponse.json({
      success: true,
      adsets: adsets.map((adset: {
        id: string
        name: string
        status: string
        effective_status?: string
        daily_budget?: string
        lifetime_budget?: string
        optimization_goal?: string
        billing_event?: string
      }) => ({
        id: adset.id,
        name: adset.name,
        status: adset.status,
        dailyBudget: adset.daily_budget ? parseInt(adset.daily_budget) / 100 : null,
        lifetimeBudget: adset.lifetime_budget ? parseInt(adset.lifetime_budget) / 100 : null,
        optimizationGoal: adset.optimization_goal,
        billingEvent: adset.billing_event
      }))
    })

  } catch (err) {
    console.error('Fetch adsets error:', err)
    return NextResponse.json({ error: 'Failed to fetch ad sets' }, { status: 500 })
  }
}
