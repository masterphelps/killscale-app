import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type MetaInsight = {
  campaign_name: string
  campaign_id: string
  adset_name: string
  adset_id: string
  ad_name: string
  ad_id: string
  impressions: string
  clicks: string
  spend: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  date_start: string
  date_stop: string
}

type EntityStatus = {
  id: string
  effective_status: string
  status?: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, datePreset = 'last_30d', customStartDate, customEndDate } = await request.json()
    
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
    
    // Fetch ad insights from Meta Marketing API
    const fields = [
      'campaign_name',
      'campaign_id',
      'adset_name', 
      'adset_id',
      'ad_name',
      'ad_id',
      'impressions',
      'clicks',
      'spend',
      'actions',
      'action_values',
    ].join(',')
    
    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/insights`)
    insightsUrl.searchParams.set('access_token', accessToken)
    insightsUrl.searchParams.set('fields', fields)
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('limit', '500')
    
    // Handle different date options
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      // Use custom time range
      insightsUrl.searchParams.set('time_range', JSON.stringify({
        since: customStartDate,
        until: customEndDate
      }))
    } else if (datePreset === 'maximum') {
      // Maximum = lifetime data (use 'maximum' preset)
      insightsUrl.searchParams.set('date_preset', 'maximum')
    } else {
      // Use preset
      insightsUrl.searchParams.set('date_preset', datePreset)
    }
    
    const response = await fetch(insightsUrl.toString())
    const data = await response.json()
    
    if (data.error) {
      console.error('Meta API error:', data.error)
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }
    
    // Build status maps for campaigns, adsets, and ads
    const campaignStatusMap: Record<string, string> = {}
    const adsetStatusMap: Record<string, string> = {}
    const adStatusMap: Record<string, string> = {}
    
    // Fetch campaign statuses
    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,effective_status')
    campaignsUrl.searchParams.set('limit', '500')
    
    const campaignsResponse = await fetch(campaignsUrl.toString())
    const campaignsData = await campaignsResponse.json()
    
    console.log('Campaigns response:', JSON.stringify(campaignsData).slice(0, 500))
    
    if (campaignsData.data) {
      campaignsData.data.forEach((c: EntityStatus) => {
        campaignStatusMap[c.id] = c.effective_status
      })
    }
    console.log('Campaign status map:', Object.keys(campaignStatusMap).length, 'campaigns')
    
    // Fetch adset statuses
    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,effective_status')
    adsetsUrl.searchParams.set('limit', '500')
    
    const adsetsResponse = await fetch(adsetsUrl.toString())
    const adsetsData = await adsetsResponse.json()
    
    console.log('Adsets response:', JSON.stringify(adsetsData).slice(0, 500))
    
    if (adsetsData.data) {
      adsetsData.data.forEach((a: EntityStatus) => {
        adsetStatusMap[a.id] = a.effective_status
      })
    }
    console.log('Adset status map:', Object.keys(adsetStatusMap).length, 'adsets')
    
    // Fetch ad statuses
    const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,effective_status')
    adsUrl.searchParams.set('limit', '500')
    
    const adsResponse = await fetch(adsUrl.toString())
    const adsData = await adsResponse.json()
    
    console.log('Ads response:', JSON.stringify(adsData).slice(0, 500))
    
    if (adsData.data) {
      adsData.data.forEach((ad: EntityStatus) => {
        adStatusMap[ad.id] = ad.effective_status
      })
    }
    console.log('Ad status map:', Object.keys(adStatusMap).length, 'ads')
    
    // Transform Meta data to our format
    const adData = (data.data || []).map((insight: MetaInsight, idx: number) => {
      // Log first few insights to debug
      if (idx < 3) {
        console.log(`Insight ${idx}:`, {
          ad_id: insight.ad_id,
          adset_id: insight.adset_id,
          campaign_id: insight.campaign_id,
          ad_name: insight.ad_name
        })
      }
      
      // Find purchase actions
      const purchases = insight.actions?.find(a => 
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      const purchaseValue = insight.action_values?.find(a => 
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      
      // Get status at each level
      // Priority: ad status > adset status > campaign status
      // effective_status already includes parent status inheritance
      const adStatus = adStatusMap[insight.ad_id] || 'UNKNOWN'
      const adsetStatus = adsetStatusMap[insight.adset_id] || 'UNKNOWN'
      const campaignStatus = campaignStatusMap[insight.campaign_id] || 'UNKNOWN'
      
      if (idx < 3) {
        console.log(`Status lookup ${idx}:`, { adStatus, adsetStatus, campaignStatus })
      }
      
      // The ad's effective_status should reflect the true status
      // But we'll store all three for proper aggregation
      return {
        user_id: userId,
        source: 'meta_api',
        ad_account_id: adAccountId,
        date_start: insight.date_start,
        date_end: insight.date_stop,
        campaign_name: insight.campaign_name,
        campaign_id: insight.campaign_id,
        adset_name: insight.adset_name,
        adset_id: insight.adset_id,
        ad_name: insight.ad_name,
        ad_id: insight.ad_id,
        status: adStatus,  // Ad's effective status (includes parent inheritance)
        adset_status: adsetStatus,  // Adset's own status
        campaign_status: campaignStatus,  // Campaign's own status
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        synced_at: new Date().toISOString(),
      }
    })
    
    if (adData.length === 0) {
      return NextResponse.json({ 
        message: 'No ad data found for this period',
        count: 0 
      })
    }
    
    // Delete ALL existing data for this user (CSV and API)
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
    
    // Insert new data
    const { error: insertError } = await supabase
      .from('ad_data')
      .insert(adData)
    
    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save ad data' }, { status: 500 })
    }
    
    // Update last sync time on connection
    await supabase
      .from('meta_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
    
    return NextResponse.json({ 
      message: 'Sync complete',
      count: adData.length 
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
