import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidGoogleToken, getGoogleConnection, normalizeCustomerId, updateLastSyncAt } from '@/lib/google/auth'

const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GAQL query to fetch ad performance data
const buildGaqlQuery = (startDate: string, endDate: string) => `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign_budget.amount_micros,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  ad_group.type,
  ad_group_ad.ad.id,
  ad_group_ad.ad.name,
  ad_group_ad.status,
  ad_group_ad.ad.type,
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

interface GoogleAdRow {
  campaign: {
    id: string
    name: string
    status: string
    advertisingChannelType: string
  }
  campaignBudget?: {
    amountMicros: string
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

    // Execute GAQL query via searchStream
    const query = buildGaqlQuery(start, end)

    const response = await fetch(
      `https://googleads.googleapis.com/v17/customers/${normalizedCustomerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
          'login-customer-id': normalizedCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Google Ads API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to fetch data from Google Ads', details: errorData },
        { status: response.status }
      )
    }

    const data = await response.json()

    // searchStream returns an array of result batches
    const allRows: GoogleAdRow[] = []
    for (const batch of data) {
      if (batch.results) {
        allRows.push(...batch.results)
      }
    }

    if (allRows.length === 0) {
      // No data for this period - update sync time and return
      await updateLastSyncAt(userId)
      return NextResponse.json({
        success: true,
        message: 'No ad data found for the selected period',
        rowsProcessed: 0,
      })
    }

    // Transform and prepare rows for upsert
    const transformedRows = allRows.map((row) => {
      const costMicros = parseInt(row.metrics.costMicros || '0', 10)
      const spend = costMicros / 1_000_000
      const conversionsValue = parseFloat(row.metrics.conversionsValue || '0')
      const conversions = parseFloat(row.metrics.conversions || '0')
      const impressions = parseInt(row.metrics.impressions || '0', 10)
      const clicks = parseInt(row.metrics.clicks || '0', 10)
      const budgetMicros = parseInt(row.campaignBudget?.amountMicros || '0', 10)

      // Calculate metrics
      const roas = spend > 0 ? conversionsValue / spend : 0
      const cpc = clicks > 0 ? spend / clicks : 0
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
      const ctr = impressions > 0 ? clicks / impressions : 0

      return {
        user_id: userId,
        customer_id: customerId, // Store with hyphens for display
        date_start: row.segments.date,
        date_end: row.segments.date,

        // Campaign
        campaign_name: row.campaign.name,
        campaign_id: row.campaign.id,
        campaign_status: normalizeStatus(row.campaign.status),
        campaign_type: row.campaign.advertisingChannelType,
        campaign_budget: budgetMicros / 1_000_000,

        // Ad Group
        ad_group_name: row.adGroup.name,
        ad_group_id: row.adGroup.id,
        ad_group_status: normalizeStatus(row.adGroup.status),
        ad_group_type: row.adGroup.type,

        // Ad
        ad_name: row.adGroupAd.ad.name || `Ad ${row.adGroupAd.ad.id}`,
        ad_id: row.adGroupAd.ad.id,
        ad_status: normalizeStatus(row.adGroupAd.status),
        ad_type: row.adGroupAd.ad.type,

        // Metrics
        impressions,
        clicks,
        spend,
        conversions,
        conversions_value: conversionsValue,

        // Results (for unified verdict logic)
        results: conversions,
        result_value: conversionsValue > 0 ? conversionsValue : null,
        result_type: conversionsValue > 0 ? 'purchase' : 'conversion',

        // Calculated
        roas: parseFloat(roas.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        cpm: parseFloat(cpm.toFixed(2)),
        ctr: parseFloat(ctr.toFixed(4)),

        synced_at: new Date().toISOString(),
      }
    })

    // Delete existing data for this customer and date range first
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
