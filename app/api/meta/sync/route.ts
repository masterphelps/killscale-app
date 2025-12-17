import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper function to fetch all pages from Meta API with timeout
async function fetchAllPages<T>(initialUrl: string, maxPages = 15): Promise<T[]> {
  const allData: T[] = []
  let nextUrl: string | null = initialUrl
  let pageCount = 0
  const timeoutMs = 20000 // 20 second timeout per request

  while (nextUrl && pageCount < maxPages) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const res: Response = await fetch(nextUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      const result: { data?: T[], error?: unknown, paging?: { next?: string } } = await res.json()

      if (result.error) {
        console.error('Meta API pagination error:', result.error)
        break
      }

      if (result.data && Array.isArray(result.data)) {
        allData.push(...result.data)
      }

      nextUrl = result.paging?.next || null
      pageCount++
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Request timed out after', timeoutMs, 'ms')
      } else {
        console.error('Fetch error:', err)
      }
      break
    }
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

    // Normalize ad_account_id to always use act_ prefix (handles legacy format mismatches)
    const cleanAccountId = adAccountId.replace(/^act_/, '')
    const normalizedAccountId = `act_${cleanAccountId}`

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

    // Fetch rules (including event_values) for this ad account
    const { data: rulesData } = await supabase
      .from('rules')
      .select('event_values')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .single()

    const eventValues: Record<string, number> = rulesData?.event_values || {}

    // Fields needed for insights
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

    // Hierarchy cache will be built from entity endpoints (faster than date_preset=maximum discovery)
    const adHierarchyCache: Record<string, { campaign_name: string; campaign_id: string; adset_name: string; adset_id: string; ad_name: string }> = {}

    // Build URLs for all fetches
    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/insights`)
    insightsUrl.searchParams.set('access_token', accessToken)
    insightsUrl.searchParams.set('fields', fields)
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('limit', '500')
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since: customStartDate, until: customEndDate }))
    } else {
      insightsUrl.searchParams.set('date_preset', VALID_META_PRESETS[datePreset] || 'last_30d')
    }
    // Use time_increment=1 to get daily data for proper client-side date filtering
    insightsUrl.searchParams.set('time_increment', '1')

    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('limit', '500')

    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget')
    adsetsUrl.searchParams.set('limit', '500')

    const adsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/ads`)
    adsUrl.searchParams.set('access_token', accessToken)
    adsUrl.searchParams.set('fields', 'id,name,adset_id,effective_status')
    adsUrl.searchParams.set('limit', '500')

    // PARALLEL FETCH - all 4 calls at once for speed
    const [allCampaigns, allAdsets, allAdsData, allInsights] = await Promise.all([
      fetchAllPages<CampaignData>(campaignsUrl.toString()),
      fetchAllPages<AdsetData>(adsetsUrl.toString()),
      fetchAllPages<AdData>(adsUrl.toString()),
      fetchAllPages<MetaInsight>(insightsUrl.toString()),
    ])

    // Log if we have partial data (but don't block - let sync complete)
    if (allInsights.length > 0 && (allAdsets.length === 0 || allAdsData.length === 0)) {
      console.warn('Sync has partial data - some entities may show as UNKNOWN:', {
        campaigns: allCampaigns.length,
        adsets: allAdsets.length,
        ads: allAdsData.length,
        insights: allInsights.length
      })
    }

    // Build maps
    const campaignMap: Record<string, { name: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adsetMap: Record<string, { name: string; campaign_id: string; status: string; daily_budget: number | null; lifetime_budget: number | null }> = {}
    const adStatusMap: Record<string, string> = {}

    allCampaigns.forEach((c) => {
      campaignMap[c.id] = {
        name: c.name,
        status: c.effective_status,
        daily_budget: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      }
    })

    allAdsets.forEach((a) => {
      adsetMap[a.id] = {
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      }
    })

    allAdsData.forEach((ad) => {
      adStatusMap[ad.id] = ad.effective_status
      // Build hierarchy cache from entity data
      if (!adHierarchyCache[ad.id] && ad.adset_id) {
        const adset = adsetMap[ad.adset_id]
        const campaign = adset ? campaignMap[adset.campaign_id] : null
        if (adset && campaign) {
          adHierarchyCache[ad.id] = {
            campaign_name: campaign.name,
            campaign_id: adset.campaign_id,
            adset_name: adset.name,
            adset_id: ad.adset_id,
            ad_name: ad.name,
          }
        }
      }
    })

    // FALLBACK: Build hierarchy and maps from insights if entity calls failed
    // This ensures we have names even if adsets/ads endpoints return empty
    if (allAdsets.length === 0 || allAdsData.length === 0) {
      console.log('Building hierarchy from insights data as fallback')
      allInsights.forEach((insight: MetaInsight) => {
        // Build adset map from insights
        if (insight.adset_id && !adsetMap[insight.adset_id]) {
          adsetMap[insight.adset_id] = {
            name: insight.adset_name,
            campaign_id: insight.campaign_id,
            status: 'ACTIVE', // Assume active since it has insights
            daily_budget: null,
            lifetime_budget: null,
          }
        }
        // Build campaign map from insights if missing
        if (insight.campaign_id && !campaignMap[insight.campaign_id]) {
          campaignMap[insight.campaign_id] = {
            name: insight.campaign_name,
            status: 'ACTIVE', // Assume active since it has insights
            daily_budget: null,
            lifetime_budget: null,
          }
        }
        // Build hierarchy cache from insights
        if (!adHierarchyCache[insight.ad_id]) {
          adHierarchyCache[insight.ad_id] = {
            campaign_name: insight.campaign_name,
            campaign_id: insight.campaign_id,
            adset_name: insight.adset_name,
            adset_id: insight.adset_id,
            ad_name: insight.ad_name,
          }
        }
        // Set ad status to ACTIVE if it has insights (better than UNKNOWN)
        if (!adStatusMap[insight.ad_id]) {
          adStatusMap[insight.ad_id] = 'ACTIVE'
        }
      })
    }
    
    // Track which ads have insights in the selected date range
    const adsWithInsights = new Set<string>()

    // Transform Meta data to our format
    const adData = allInsights.map((insight: MetaInsight) => {
      adsWithInsights.add(insight.ad_id)

      // Find purchase actions (for revenue tracking)
      const purchases = insight.actions?.find(a =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      const purchaseValue = insight.action_values?.find(a =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )

      // Calculate results - look for the most relevant conversion action
      // Priority: purchases > leads > registrations > custom conversions
      const conversionActionTypes = [
        // Purchases (ecommerce)
        'purchase', 'omni_purchase',
        // Leads
        'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
        // Registrations
        'complete_registration', 'offsite_conversion.fb_pixel_complete_registration',
        // App installs
        'app_install', 'mobile_app_install',
        // Other valuable actions
        'contact', 'submit_application', 'subscribe', 'start_trial',
      ]

      // Find the first matching conversion action
      let resultAction = null
      let resultType: string | null = null

      // First check standard conversion types
      for (const actionType of conversionActionTypes) {
        const found = insight.actions?.find(a => a.action_type === actionType)
        if (found && parseInt(found.value) > 0) {
          resultAction = found
          // Simplify the type for display
          if (actionType.includes('purchase')) resultType = 'purchase'
          else if (actionType.includes('lead')) resultType = 'lead'
          else if (actionType.includes('registration')) resultType = 'registration'
          else if (actionType.includes('install')) resultType = 'install'
          else resultType = actionType.split('.').pop() || actionType
          break
        }
      }

      // If no standard conversion found, check for custom conversions only
      // Be specific - don't catch view_content, add_to_cart, etc.
      if (!resultAction) {
        const customConversion = insight.actions?.find(a =>
          a.action_type.startsWith('offsite_conversion.fb_pixel_custom.')
        )
        if (customConversion && parseInt(customConversion.value) > 0) {
          resultAction = customConversion
          // Extract the custom event name (last part after the dots)
          const parts = customConversion.action_type.split('.')
          resultType = parts[parts.length - 1] || 'conversion'
        }
      }

      const resultCount = resultAction ? parseInt(resultAction.value) : 0

      // Calculate result value
      // 1. If we have a purchase value from Meta, use it (ecommerce)
      // 2. If no purchase value but we have results and event_values, calculate it (lead-gen)
      let resultValue: number | null = null

      if (purchaseValue) {
        // Use purchase value from Meta (ecommerce campaigns)
        resultValue = parseFloat(purchaseValue.value)
      } else if (resultCount > 0 && resultType) {
        // Check if we have an event value configured for this result type
        // Normalize the result type to match our event_values keys
        const normalizedType = resultType.toLowerCase().replace(/-/g, '_')

        // Try various key formats to find a match
        const eventValue = eventValues[normalizedType]
          || eventValues[resultType]
          || eventValues[resultType.toLowerCase()]
          // Handle common variations
          || (normalizedType === 'registration' ? eventValues['complete_registration'] : null)
          || (normalizedType === 'complete_registration' ? eventValues['registration'] : null)
          || (normalizedType === 'omni_purchase' ? eventValues['purchase'] : null)
          || (normalizedType === 'app_install' ? eventValues['install'] : null)
          || (normalizedType === 'mobile_app_install' ? eventValues['install'] : null)

        if (eventValue && eventValue > 0) {
          resultValue = resultCount * eventValue
        }
      }

      // Get status at each level using the new maps
      const adStatus = adStatusMap[insight.ad_id] || 'UNKNOWN'
      const adset = adsetMap[insight.adset_id]
      const campaign = campaignMap[insight.campaign_id]

      return {
        user_id: userId,
        source: 'meta_api',
        ad_account_id: normalizedAccountId,
        date_start: insight.date_start,
        date_end: insight.date_stop,
        campaign_name: insight.campaign_name,
        campaign_id: insight.campaign_id,
        adset_name: insight.adset_name,
        adset_id: insight.adset_id,
        ad_name: insight.ad_name,
        ad_id: insight.ad_id,
        status: adStatus,
        adset_status: adset?.status || 'DELETED', // Not in /adsets = deleted
        campaign_status: campaign?.status || 'DELETED', // Not in /campaigns = deleted
        campaign_daily_budget: campaign?.daily_budget ?? null,
        campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
        adset_daily_budget: adset?.daily_budget ?? null,
        adset_lifetime_budget: adset?.lifetime_budget ?? null,
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        results: resultCount,
        result_value: resultValue,
        result_type: resultType,
        synced_at: new Date().toISOString(),
      }
    })

    // Calculate date range for ads without insights
    const dateRange = (datePreset === 'custom' && customStartDate && customEndDate)
      ? { since: customStartDate, until: customEndDate }
      : getDateRangeFromPreset(datePreset)

    // Add entries for ads without any insights (no activity during date range)
    // Use hierarchy cache built from /ads endpoint
    const adsWithoutInsights: typeof adData = []

    // Add ads from hierarchy cache that aren't in the selected date range insights
    Object.entries(adHierarchyCache).forEach(([adId, hierarchy]) => {
      if (!adsWithInsights.has(adId)) {
        // Get status and budget from entity maps if available
        const adStatus = adStatusMap[adId] || 'UNKNOWN'
        const adset = adsetMap[hierarchy.adset_id]
        const campaign = campaignMap[hierarchy.campaign_id]

        adsWithoutInsights.push({
          user_id: userId,
          source: 'meta_api',
          ad_account_id: normalizedAccountId,
          date_start: dateRange.since,
          date_end: dateRange.until,
          campaign_name: hierarchy.campaign_name,
          campaign_id: hierarchy.campaign_id,
          adset_name: hierarchy.adset_name,
          adset_id: hierarchy.adset_id,
          ad_name: hierarchy.ad_name,
          ad_id: adId,
          status: adStatus,
          adset_status: adset?.status || 'DELETED', // Not in /adsets = deleted
          campaign_status: campaign?.status || 'DELETED', // Not in /campaigns = deleted
          campaign_daily_budget: campaign?.daily_budget ?? null,
          campaign_lifetime_budget: campaign?.lifetime_budget ?? null,
          adset_daily_budget: adset?.daily_budget ?? null,
          adset_lifetime_budget: adset?.lifetime_budget ?? null,
          impressions: 0,
          clicks: 0,
          spend: 0,
          purchases: 0,
          revenue: 0,
          results: 0,
          result_value: null,
          result_type: null,
          synced_at: new Date().toISOString(),
        })
      }
    })

    // Combine all ad data
    const allAdData = [...adData, ...adsWithoutInsights]

    if (allAdData.length === 0) {
      return NextResponse.json({
        message: 'No ads found in this account',
        count: 0
      })
    }
    
    // Delete existing data for this account (matches any format variation)
    const { error: deleteError } = await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
      .or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${cleanAccountId},ad_account_id.eq.${normalizedAccountId}`)

    if (deleteError) {
      console.error('Delete error:', deleteError)
    }

    // Insert new data in chunks to avoid payload size limits
    const BATCH_SIZE = 1000
    for (let i = 0; i < allAdData.length; i += BATCH_SIZE) {
      const batch = allAdData.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('ad_data')
        .insert(batch)

      if (insertError) {
        console.error('Insert error at batch', i / BATCH_SIZE, ':', insertError)
        return NextResponse.json({ error: 'Failed to save ad data' }, { status: 500 })
      }
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
