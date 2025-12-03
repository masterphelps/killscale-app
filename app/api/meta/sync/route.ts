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
  name: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

type AdsetData = {
  id: string
  name: string
  campaign_id: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

type AdData = {
  id: string
  name: string
  adset_id: string
  effective_status: string
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

// Helper to calculate date range from preset (for ads without insights)
function getDateRangeFromPreset(datePreset: string): { since: string; until: string } {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (datePreset) {
    case 'today':
      return { since: formatDate(today), until: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { since: formatDate(yesterday), until: formatDate(yesterday) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_14d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 13)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_90d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 89)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { since: formatDate(start), until: formatDate(end) }
    }
    default:
      // Default to last 30 days
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { since: formatDate(start), until: formatDate(today) }
  }
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
    
    // Build status, budget, and name maps for campaigns, adsets, and ads
    const campaignMap: Record<string, { name: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adsetMap: Record<string, { name: string; campaign_id: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adStatusMap: Record<string, string> = {}

    // Fetch campaign statuses and budgets (with pagination)
    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('limit', '500')

    const allCampaigns = await fetchAllPages<CampaignData>(campaignsUrl.toString())
    allCampaigns.forEach((c) => {
      // Budget values from Meta are in cents - convert to dollars
      campaignMap[c.id] = {
        name: c.name,
        status: c.effective_status,
        daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      }
    })
    console.log('Campaign map:', Object.keys(campaignMap).length, 'campaigns')

    // Fetch adset statuses and budgets (with pagination)
    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget')
    adsetsUrl.searchParams.set('limit', '500')

    const allAdsets = await fetchAllPages<AdsetData>(adsetsUrl.toString())
    allAdsets.forEach((a) => {
      // Budget values from Meta are in cents - convert to dollars
      adsetMap[a.id] = {
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      }
    })
    console.log('Adset map:', Object.keys(adsetMap).length, 'adsets')

    // Fetch ad statuses (with pagination) - includes name and adset_id for complete hierarchy
    const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,name,adset_id,effective_status')
    adsUrl.searchParams.set('limit', '500')

    const allAdsData = await fetchAllPages<AdData>(adsUrl.toString())
    allAdsData.forEach((ad) => {
      adStatusMap[ad.id] = ad.effective_status
    })
    console.log('Ad map:', Object.keys(adStatusMap).length, 'ads')
    
    // Track which ads have insights
    const adsWithInsights = new Set<string>()

    // Transform Meta data to our format
    const adData = allInsights.map((insight: MetaInsight, idx: number) => {
      adsWithInsights.add(insight.ad_id)

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

      // Get status at each level using the new maps
      const adStatus = adStatusMap[insight.ad_id] || 'UNKNOWN'
      const adset = adsetMap[insight.adset_id]
      const campaign = campaignMap[insight.campaign_id]

      if (idx < 3) {
        console.log(`Status lookup ${idx}:`, {
          adStatus,
          adsetStatus: adset?.status,
          campaignStatus: campaign?.status
        })
        console.log(`Budget lookup ${idx}:`, {
          campaignBudget: { daily: campaign?.daily_budget, lifetime: campaign?.lifetime_budget },
          adsetBudget: { daily: adset?.daily_budget, lifetime: adset?.lifetime_budget }
        })
      }

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
        status: adStatus,
        adset_status: adset?.status || 'UNKNOWN',
        campaign_status: campaign?.status || 'UNKNOWN',
        campaign_daily_budget: campaign?.daily_budget ?? null,
        campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
        adset_daily_budget: adset?.daily_budget ?? null,
        adset_lifetime_budget: adset?.lifetime_budget ?? null,
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        synced_at: new Date().toISOString(),
      }
    })

    // Calculate date range for ads without insights
    const dateRange = (datePreset === 'custom' && customStartDate && customEndDate)
      ? { since: customStartDate, until: customEndDate }
      : getDateRangeFromPreset(datePreset)

    // Add entries for ads without any insights (no activity during date range)
    const adsWithoutInsights: typeof adData = []
    allAdsData.forEach((ad) => {
      if (!adsWithInsights.has(ad.id)) {
        const adset = adsetMap[ad.adset_id]
        if (!adset) {
          console.log(`Skipping ad ${ad.id} - adset ${ad.adset_id} not found`)
          return
        }
        const campaign = campaignMap[adset.campaign_id]
        if (!campaign) {
          console.log(`Skipping ad ${ad.id} - campaign ${adset.campaign_id} not found`)
          return
        }

        adsWithoutInsights.push({
          user_id: userId,
          source: 'meta_api',
          ad_account_id: adAccountId,
          date_start: dateRange.since,
          date_end: dateRange.until,
          campaign_name: campaign.name,
          campaign_id: adset.campaign_id,
          adset_name: adset.name,
          adset_id: ad.adset_id,
          ad_name: ad.name,
          ad_id: ad.id,
          status: ad.effective_status,
          adset_status: adset.status,
          campaign_status: campaign.status,
          campaign_daily_budget: campaign.daily_budget,
          campaign_lifetime_budget: campaign.lifetime_budget,
          adset_daily_budget: adset.daily_budget,
          adset_lifetime_budget: adset.lifetime_budget,
          impressions: 0,
          clicks: 0,
          spend: 0,
          purchases: 0,
          revenue: 0,
          synced_at: new Date().toISOString(),
        })
      }
    })

    console.log(`Ads with insights: ${adsWithInsights.size}, Ads without insights: ${adsWithoutInsights.length}`)

    // Combine all ad data
    const allAdData = [...adData, ...adsWithoutInsights]

    if (allAdData.length === 0) {
      return NextResponse.json({
        message: 'No ads found in this account',
        count: 0
      })
    }
    
    // Log sample data before insert
    console.log('Sample data to insert:', JSON.stringify(allAdData[0], null, 2))
    console.log('Total records to insert:', allAdData.length)

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
      .insert(allAdData)
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
      count: allAdData.length,
      adsWithActivity: adData.length,
      adsWithoutActivity: adsWithoutInsights.length 
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
