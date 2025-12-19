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
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
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

    // Strip 'act_' prefix if already present (avoid act_act_ issue)
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Fetch campaigns for the ad account
    // Filter to only active/paused campaigns (not deleted/archived)
    const campaignsUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,objective&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${accessToken}`

    const response = await fetch(campaignsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch campaigns'
      }, { status: 400 })
    }

    // Return campaigns list
    const campaigns = result.data || []

    // Get ad set and ad counts from synced data in Supabase
    const campaignIds = campaigns.map((c: { id: string }) => c.id)

    // Query ad_data for counts - group by campaign and adset
    const { data: adData } = await supabase
      .from('ad_data')
      .select('campaign_id, adset_id')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .in('campaign_id', campaignIds)

    // Build counts map
    const campaignCounts: Record<string, { adSetCount: number; adCount: number; adSetIds: Set<string> }> = {}

    if (adData) {
      for (const row of adData) {
        if (!campaignCounts[row.campaign_id]) {
          campaignCounts[row.campaign_id] = { adSetCount: 0, adCount: 0, adSetIds: new Set() }
        }
        campaignCounts[row.campaign_id].adCount++
        if (!campaignCounts[row.campaign_id].adSetIds.has(row.adset_id)) {
          campaignCounts[row.campaign_id].adSetIds.add(row.adset_id)
          campaignCounts[row.campaign_id].adSetCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      campaigns: campaigns.map((campaign: {
        id: string
        name: string
        status: string
        daily_budget?: string
        lifetime_budget?: string
        objective: string
      }) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        dailyBudget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : null,
        lifetimeBudget: campaign.lifetime_budget ? parseInt(campaign.lifetime_budget) / 100 : null,
        objective: campaign.objective,
        // CBO = Campaign Budget Optimization (budget set at campaign level)
        // ABO = Ad Set Budget Optimization (no campaign-level budget)
        isCBO: !!(campaign.daily_budget || campaign.lifetime_budget),
        adSetCount: campaignCounts[campaign.id]?.adSetCount || 0,
        adCount: campaignCounts[campaign.id]?.adCount || 0
      }))
    })

  } catch (err) {
    console.error('Fetch campaigns error:', err)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}
