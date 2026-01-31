import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidGoogleToken, normalizeCustomerId, updateLastSyncAt } from '@/lib/google/auth'

const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GAQL query to fetch ALL campaigns (structure only, no date filter)
// This returns ALL campaigns including paused ones
const STRUCTURE_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign_budget.amount_micros,
  campaign_budget.resource_name
FROM campaign
WHERE campaign.status != 'REMOVED'
`

// GAQL query to fetch campaign METRICS (with date filter)
// Only returns campaigns with activity in the date range
const buildMetricsQuery = (startDate: string, endDate: string) => `
SELECT
  campaign.id,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value
FROM campaign
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
  campaignBudget?: {
    amountMicros: string
    resourceName: string
  }
}

// Metrics row - from buildMetricsQuery (aggregated by campaign)
interface MetricsRow {
  campaign: { id: string }
  metrics: {
    impressions: string
    clicks: string
    costMicros: string
    conversions: string
    conversionsValue: string
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

    // Validate date format to prevent injection in GAQL query
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    // Normalize customer ID for API calls (remove hyphens)
    const normalizedCustomerId = normalizeCustomerId(customerId)

    // ============================================
    // CAMPAIGN-LEVEL SYNC (simplified)
    // 1. Fetch all campaigns (structure + budget)
    // 2. Fetch campaign metrics for date range
    // 3. Merge and save
    // ============================================

    console.log('Google sync: Fetching campaigns...')
    const structureResult = await executeGaqlQuery<StructureRow>(
      STRUCTURE_QUERY,
      accessToken,
      normalizedCustomerId
    )

    if (structureResult.error) {
      return NextResponse.json(
        { error: 'Failed to fetch campaigns from Google Ads', details: structureResult.error },
        { status: 500 }
      )
    }

    console.log(`Google sync: Found ${structureResult.data.length} campaigns`)

    if (structureResult.data.length === 0) {
      // No campaigns in account at all
      await updateLastSyncAt(userId)
      return NextResponse.json({
        success: true,
        message: 'No campaigns found in this account',
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

    // Build structure map keyed by campaign_id
    const structureMap = new Map<string, StructureRow>()
    for (const row of structureResult.data) {
      const campaignId = row.campaign.id
      if (!structureMap.has(campaignId)) {
        structureMap.set(campaignId, row)
      }
    }

    // Aggregate metrics by campaign_id (sum across all dates in range)
    const metricsMap = new Map<string, {
      impressions: number
      clicks: number
      spend: number
      conversions: number
      conversionsValue: number
    }>()

    for (const row of metricsResult.data) {
      const campaignId = row.campaign.id
      const existing = metricsMap.get(campaignId) || {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        conversionsValue: 0,
      }

      metricsMap.set(campaignId, {
        impressions: existing.impressions + parseInt(row.metrics.impressions || '0', 10),
        clicks: existing.clicks + parseInt(row.metrics.clicks || '0', 10),
        spend: existing.spend + (parseInt(row.metrics.costMicros || '0', 10) / 1_000_000),
        conversions: existing.conversions + parseFloat(row.metrics.conversions || '0'),
        conversionsValue: existing.conversionsValue + parseFloat(row.metrics.conversionsValue || '0'),
      })
    }

    // Merge structure + metrics into final rows
    // Every campaign in structureMap gets a row, with 0 metrics if not in metricsMap
    const transformedRows: Array<Record<string, unknown>> = []
    const campaignsWithMetrics = new Set<string>()

    for (const [campaignId, structure] of Array.from(structureMap.entries())) {
      const metrics = metricsMap.get(campaignId) || {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        conversionsValue: 0,
      }

      if (metricsMap.has(campaignId)) {
        campaignsWithMetrics.add(campaignId)
      }

      // Calculate derived metrics
      const roas = metrics.spend > 0 ? metrics.conversionsValue / metrics.spend : 0
      const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0
      const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0
      const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0

      // Budget from structure
      const budgetMicros = structure.campaignBudget?.amountMicros || '0'
      const budgetAmount = parseInt(budgetMicros, 10) / 1_000_000
      const budgetResourceName = structure.campaignBudget?.resourceName || null

      transformedRows.push({
        user_id: userId,
        customer_id: customerId, // Store with hyphens for display
        date_start: start,
        date_end: end,

        // Campaign (this is now the only level)
        campaign_name: structure.campaign.name,
        campaign_id: campaignId,
        campaign_status: normalizeStatus(structure.campaign.status),
        campaign_type: structure.campaign.advertisingChannelType,
        campaign_budget: budgetAmount,
        campaign_budget_resource_name: budgetResourceName,

        // Metrics (rolled up to campaign level)
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

    console.log(`Google sync: ${transformedRows.length} campaigns, ${campaignsWithMetrics.size} with activity`)

    // Delete existing data for this customer and date range
    await supabase
      .from('google_ad_data')
      .delete()
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .gte('date_start', start)
      .lte('date_end', end)

    // Upsert all rows (campaign-level unique constraint)
    const { error: upsertError } = await supabase
      .from('google_ad_data')
      .upsert(transformedRows, {
        onConflict: 'user_id,customer_id,date_start,campaign_id',
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
      campaignsWithActivity: campaignsWithMetrics.size,
      campaignsWithoutActivity: transformedRows.length - campaignsWithMetrics.size,
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
