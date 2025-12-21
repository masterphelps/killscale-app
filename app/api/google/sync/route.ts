import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidGoogleToken, normalizeCustomerId, updateLastSyncAt } from '@/lib/google/auth'

const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GAQL query to fetch ad STRUCTURE (all entities, no date filter)
// This returns ALL campaigns/ad_groups/ads including paused ones
const STRUCTURE_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  ad_group.type,
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.status,
  ad_group_ad.ad.type
FROM ad_group_ad
WHERE campaign.status != 'REMOVED'
  AND ad_group.status != 'REMOVED'
  AND ad_group_ad.status != 'REMOVED'
`

// GAQL query to fetch METRICS (with date filter)
// Only returns entities with activity in the date range
const buildMetricsQuery = (startDate: string, endDate: string) => `
SELECT
  campaign.id,
  ad_group.id,
  ad_group_ad.ad.id,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  segments.date
FROM ad_group_ad
WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  AND campaign.status != 'REMOVED'
`

// Normalize Google status to match our display conventions
function normalizeStatus(googleStatus: string): string {
  switch (googleStatus) {
    case 'ENABLED':
      return 'ACTIVE'
    case 'PAUSED':
      return 'PAUSED'
    case 'REMOVED':
      return 'DELETED'
    default:
      return googleStatus
  }
}

// Structure row - from STRUCTURE_QUERY (no metrics)
interface StructureRow {
  campaign: {
    id: string
    name: string
    status: string
    advertisingChannelType: string
  }
  adGroup: {
    id: string
    name: string
    status: string
    type: string
  }
  adGroupAd: {
    ad: {
      id: string
      name: string
      type: string
    }
    status: string
  }
}

// Metrics row - from buildMetricsQuery (with date segment)
interface MetricsRow {
  campaign: { id: string }
  adGroup: { id: string }
  adGroupAd: { ad: { id: string } }
  metrics: {
    impressions: string
    clicks: string
    costMicros: string
    conversions: string
    conversionsValue: string
  }
  segments: {
    date: string
  }
}

// Helper to execute a GAQL query
async function executeGaqlQuery<T>(
  query: string,
  accessToken: string,
  customerId: string
): Promise<{ data: T[], error?: string }> {
  const response = await fetch(
    `https://googleads.googleapis.com/v22/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': customerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )

  if (!response.ok) {
    const errorData = await response.json()
    console.error('Google Ads API error:', JSON.stringify(errorData, null, 2))
    return { data: [], error: JSON.stringify(errorData) }
  }

  const data = await response.json()
  const allRows: T[] = []
  for (const batch of data) {
    if (batch.results) {
      allRows.push(...batch.results)
    }
  }
  return { data: allRows }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, customerId, dateStart, dateEnd } = body

    if (!userId || !customerId) {
      return NextResponse.json(
        { error: 'userId and customerId are required' },
        { status: 400 }
      )
    }

    // Get valid access token (auto-refreshes if needed)
    const accessToken = await getValidGoogleToken(userId)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No valid Google token. Please reconnect your account.' },
        { status: 401 }
      )
    }

    // Default to last 7 days if no dates provided
    const end = dateEnd || new Date().toISOString().split('T')[0]
    const start = dateStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Normalize customer ID for API calls (remove hyphens)
    const normalizedCustomerId = normalizeCustomerId(customerId)

    // ============================================
    // TWO-STEP APPROACH (mirrors Meta sync)
    // 1. Fetch STRUCTURE - all entities including paused
    // 2. Fetch METRICS - only entities with activity in date range
    // 3. Merge - combine structure with metrics
    // ============================================

    console.log('Google sync: Fetching structure (all entities)...')
    const structureResult = await executeGaqlQuery<StructureRow>(
      STRUCTURE_QUERY,
      accessToken,
      normalizedCustomerId
    )

    if (structureResult.error) {
      return NextResponse.json(
        { error: 'Failed to fetch structure from Google Ads', details: structureResult.error },
        { status: 500 }
      )
    }

    console.log(`Google sync: Found ${structureResult.data.length} ad entities`)

    if (structureResult.data.length === 0) {
      // No ads in account at all
      await updateLastSyncAt(userId)
      return NextResponse.json({
        success: true,
        message: 'No ads found in this account',
        rowsProcessed: 0,
      })
    }

    console.log(`Google sync: Fetching metrics for ${start} to ${end}...`)
    const metricsResult = await executeGaqlQuery<MetricsRow>(
      buildMetricsQuery(start, end),
      accessToken,
      normalizedCustomerId
    )

    console.log(`Google sync: Found ${metricsResult.data.length} metric rows`)

    // Build structure map keyed by ad_id
    // This gives us campaign/ad_group/ad info for ALL entities
    const structureMap = new Map<string, StructureRow>()
    for (const row of structureResult.data) {
      const adId = row.adGroupAd.ad.id
      // Keep the first occurrence (dedupe)
      if (!structureMap.has(adId)) {
        structureMap.set(adId, row)
      }
    }

    // Aggregate metrics by ad_id (sum across all dates in range)
    // We store one row per ad with aggregated metrics for the date range
    const metricsMap = new Map<string, {
      impressions: number
      clicks: number
      spend: number
      conversions: number
      conversionsValue: number
    }>()

    for (const row of metricsResult.data) {
      const adId = row.adGroupAd.ad.id
      const existing = metricsMap.get(adId) || {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        conversionsValue: 0,
      }

      metricsMap.set(adId, {
        impressions: existing.impressions + parseInt(row.metrics.impressions || '0', 10),
        clicks: existing.clicks + parseInt(row.metrics.clicks || '0', 10),
        spend: existing.spend + (parseInt(row.metrics.costMicros || '0', 10) / 1_000_000),
        conversions: existing.conversions + parseFloat(row.metrics.conversions || '0'),
        conversionsValue: existing.conversionsValue + parseFloat(row.metrics.conversionsValue || '0'),
      })
    }

    // Merge structure + metrics into final rows
    // Every ad in structureMap gets a row, with 0 metrics if not in metricsMap
    const transformedRows: Array<Record<string, unknown>> = []
    const adsWithMetrics = new Set<string>()

    for (const [adId, structure] of Array.from(structureMap.entries())) {
      const metrics = metricsMap.get(adId) || {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        conversionsValue: 0,
      }

      if (metricsMap.has(adId)) {
        adsWithMetrics.add(adId)
      }

      // Calculate derived metrics
      const roas = metrics.spend > 0 ? metrics.conversionsValue / metrics.spend : 0
      const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0
      const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0
      const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0

      transformedRows.push({
        user_id: userId,
        customer_id: customerId, // Store with hyphens for display
        date_start: start,
        date_end: end,

        // Campaign
        campaign_name: structure.campaign.name,
        campaign_id: structure.campaign.id,
        campaign_status: normalizeStatus(structure.campaign.status),
        campaign_type: structure.campaign.advertisingChannelType,
        campaign_budget: 0, // TODO: Add budget query

        // Ad Group
        ad_group_name: structure.adGroup.name,
        ad_group_id: structure.adGroup.id,
        ad_group_status: normalizeStatus(structure.adGroup.status),
        ad_group_type: structure.adGroup.type,

        // Ad
        ad_name: structure.adGroupAd.ad.name || `Ad ${adId}`,
        ad_id: adId,
        ad_status: normalizeStatus(structure.adGroupAd.status),
        ad_type: structure.adGroupAd.ad.type,

        // Metrics
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: parseFloat(metrics.spend.toFixed(2)),
        conversions: metrics.conversions,
        conversions_value: metrics.conversionsValue,

        // Results (for unified verdict logic)
        results: metrics.conversions,
        result_value: metrics.conversionsValue > 0 ? metrics.conversionsValue : null,
        result_type: metrics.conversionsValue > 0 ? 'purchase' : 'conversion',

        // Calculated
        roas: parseFloat(roas.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        cpm: parseFloat(cpm.toFixed(2)),
        ctr: parseFloat(ctr.toFixed(4)),

        synced_at: new Date().toISOString(),
      })
    }

    console.log(`Google sync: ${transformedRows.length} total ads, ${adsWithMetrics.size} with activity`)

    // Delete existing data for this customer and date range
    await supabase
      .from('google_ad_data')
      .delete()
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .gte('date_start', start)
      .lte('date_end', end)

    // Upsert all rows
    const { error: upsertError } = await supabase
      .from('google_ad_data')
      .upsert(transformedRows, {
        onConflict: 'user_id,customer_id,date_start,campaign_id,ad_group_id,ad_id',
      })

    if (upsertError) {
      console.error('Database upsert error:', upsertError)
      return NextResponse.json(
        { error: 'Failed to save data', details: upsertError },
        { status: 500 }
      )
    }

    // Update last sync timestamp
    await updateLastSyncAt(userId)

    return NextResponse.json({
      success: true,
      rowsProcessed: transformedRows.length,
      adsWithActivity: adsWithMetrics.size,
      adsWithoutActivity: transformedRows.length - adsWithMetrics.size,
      dateRange: { start, end },
    })

  } catch (err) {
    console.error('Google sync error:', err)
    return NextResponse.json(
      { error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
