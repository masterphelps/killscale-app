import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper function to fetch all pages from Meta API
async function fetchAllPages<T>(initialUrl: string): Promise<T[]> {
  const allData: T[] = []
  let nextUrl: string | null = initialUrl
  let pageCount = 0
  const maxPages = 50 // Safety limit
  
  while (nextUrl && pageCount < maxPages) {
    const res: Response = await fetch(nextUrl)
    const result: { data?: T[], error?: unknown, paging?: { next?: string } } = await res.json()
    
    if (result.error) {
      console.error('Meta API pagination error:', result.error)
      break
    }
    
    if (result.data && Array.isArray(result.data)) {
      allData.push(...result.data)
    }
    
    // Check for next page
    nextUrl = result.paging?.next || null
    pageCount++
    
    console.log(`Fetched page ${pageCount}, total records: ${allData.length}`)
  }
  
  return allData
}

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

type CampaignData = {
  id: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

type AdsetData = {
  id: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

// Map our UI presets to valid Meta API date_preset values
const VALID_META_PRESETS: Record<string, string> = {
  'today': 'today',
  'yesterday': 'yesterday',
  'last_7d': 'last_7d',
  'last_14d': 'last_14d',
  'last_30d': 'last_30d',
  'last_90d': 'last_90d',
  'this_month': 'this_month',
  'last_month': 'last_month',
  'maximum': 'maximum',
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
    } else {
      // Map to valid Meta preset, default to last_30d if invalid
      const metaPreset = VALID_META_PRESETS[datePreset] || 'last_30d'
      insightsUrl.searchParams.set('date_preset', metaPreset)
    }
    
    // IMPORTANT: Add time_increment=1 to get daily breakdown for time series charts
    insightsUrl.searchParams.set('time_increment', '1')
    
    // Fetch ALL pages of insights data
    console.log('Fetching insights with pagination...')
    const allInsights = await fetchAllPages<MetaInsight>(insightsUrl.toString())
    console.log(`Total insights fetched: ${allInsights.length}`)
    
    if (allInsights.length === 0) {
      // Check if there was an error on first request
      const testResponse = await fetch(insightsUrl.toString())
      const testData = await testResponse.json()
      if (testData.error) {
        console.error('Meta API error:', testData.error)
        return NextResponse.json({ error: testData.error.message }, { status: 400 })
      }
    }
    
    // Build status and budget maps for campaigns, adsets, and ads
    const campaignStatusMap: Record<string, string> = {}
    const campaignBudgetMap: Record<string, { daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adsetStatusMap: Record<string, string> = {}
    const adsetBudgetMap: Record<string, { daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adStatusMap: Record<string, string> = {}

    // Fetch campaign statuses and budgets (with pagination)
    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('limit', '500')

    const allCampaigns = await fetchAllPages<CampaignData>(campaignsUrl.toString())
    allCampaigns.forEach((c) => {
      campaignStatusMap[c.id] = c.effective_status
      // Budget values from Meta are in cents - convert to dollars
      campaignBudgetMap[c.id] = {
        daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      }
    })
    console.log('Campaign status map:', Object.keys(campaignStatusMap).length, 'campaigns')
    
    // Fetch adset statuses and budgets (with pagination)
    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,effective_status,daily_budget,lifetime_budget')
    adsetsUrl.searchParams.set('limit', '500')

    const allAdsets = await fetchAllPages<AdsetData>(adsetsUrl.toString())
    allAdsets.forEach((a) => {
      adsetStatusMap[a.id] = a.effective_status
      // Budget values from Meta are in cents - convert to dollars
      adsetBudgetMap[a.id] = {
        daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      }
    })
    console.log('Adset status map:', Object.keys(adsetStatusMap).length, 'adsets')
    
    // Fetch ad statuses (with pagination)
    const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,effective_status')
    adsUrl.searchParams.set('limit', '500')
    
    const allAds = await fetchAllPages<EntityStatus>(adsUrl.toString())
    allAds.forEach((ad) => {
      adStatusMap[ad.id] = ad.effective_status
    })
    console.log('Ad status map:', Object.keys(adStatusMap).length, 'ads')
    
    // Transform Meta data to our format
    const adData = allInsights.map((insight: MetaInsight, idx: number) => {
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

      // Get budget data
      const campaignBudget = campaignBudgetMap[insight.campaign_id] || { daily_budget: null, lifetime_budget: null }
      const adsetBudget = adsetBudgetMap[insight.adset_id] || { daily_budget: null, lifetime_budget: null }

      if (idx < 3) {
        console.log(`Status lookup ${idx}:`, { adStatus, adsetStatus, campaignStatus })
        console.log(`Budget lookup ${idx}:`, { campaignBudget, adsetBudget })
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
        // Budget fields (null if not set)
        campaign_daily_budget: campaignBudget.daily_budget,
        campaign_lifetime_budget: campaignBudget.lifetime_budget,
        adset_daily_budget: adsetBudget.daily_budget,
        adset_lifetime_budget: adsetBudget.lifetime_budget,
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
    
    // Log sample data before insert
    console.log('Sample data to insert:', JSON.stringify(adData[0], null, 2))
    console.log('Total records to insert:', adData.length)
    
    // Delete ALL existing data for this user (CSV and API)
    const { error: deleteError } = await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
    
    if (deleteError) {
      console.error('Delete error:', deleteError)
    }
    
    // Insert new data
    const { data: insertedData, error: insertError } = await supabase
      .from('ad_data')
      .insert(adData)
      .select()
    
    console.log('Insert result - inserted:', insertedData?.length || 0, 'error:', insertError)
    
    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save ad data' }, { status: 500 })
    }
    
    // Update last sync time on connection
    await supabase
      .from('meta_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
    
    // Trigger alert generation in the background
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/alerts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }).catch(err => console.error('Alert generation failed:', err))
    } catch (alertErr) {
      console.error('Failed to trigger alerts:', alertErr)
      // Don't fail the sync if alert generation fails
    }
    
    return NextResponse.json({ 
      message: 'Sync complete',
      count: adData.length 
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
