import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface MergeRequest {
  workspace_id: string
  date_start: string
  date_end: string
}

interface AdMetrics {
  ad_id: string
  ad_name: string
  ks_count: number
  ks_revenue: number
  manual_count: number
  manual_revenue: number
  meta_count: number
  meta_revenue: number
}

export async function POST(request: NextRequest) {
  try {
    const body: MergeRequest = await request.json()
    const { workspace_id, date_start, date_end } = body

    console.log('[Merge] Request received:', { workspace_id, date_start, date_end })

    if (!workspace_id || !date_start || !date_end) {
      console.log('[Merge] Missing required fields')
      return NextResponse.json(
        { error: 'workspace_id, date_start, and date_end are required' },
        { status: 400 }
      )
    }

    // Get user from auth header or query param
    const authHeader = request.headers.get('authorization')
    const userId = authHeader?.replace('Bearer ', '') || request.nextUrl.searchParams.get('userId')

    if (!userId) {
      console.log('[Merge] No userId found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Merge] Processing for user:', userId)

    // Verify user has access to this workspace
    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .select('id, user_id')
      .eq('id', workspace_id)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Check if user is owner or member
    const isOwner = workspace.user_id === userId
    const { data: membership } = await supabaseAdmin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', userId)
      .single()

    if (!isOwner && !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get pixel_id and event_values for this workspace
    const { data: pixelData, error: pixelError } = await supabaseAdmin
      .from('workspace_pixels')
      .select('pixel_id, event_values')
      .eq('workspace_id', workspace_id)
      .single()

    if (pixelError || !pixelData) {
      return NextResponse.json({ error: 'No pixel found for workspace' }, { status: 404 })
    }

    const pixelId = pixelData.pixel_id
    const configuredEventValues: Record<string, number> = (pixelData.event_values && typeof pixelData.event_values === 'object')
      ? pixelData.event_values as Record<string, number>
      : {}

    // Get ad accounts for this workspace (Meta only)
    const { data: workspaceAccounts, error: accountsError } = await supabaseAdmin
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspace_id)
      .eq('platform', 'meta')

    console.log('[Merge] Found accounts:', workspaceAccounts?.length || 0, accountsError?.message)

    if (accountsError) {
      return NextResponse.json(
        { error: 'Failed to fetch workspace accounts' },
        { status: 500 }
      )
    }

    const adAccountIds = workspaceAccounts?.map(a => a.ad_account_id) || []

    if (adAccountIds.length === 0) {
      return NextResponse.json(
        { error: 'No Meta ad accounts found for workspace' },
        { status: 404 }
      )
    }

    // Parse date range
    const startDate = new Date(date_start)
    const endDate = new Date(date_end)

    // Generate array of dates to process
    const dates: string[] = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0])
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Process each date
    const results = []
    for (const date of dates) {
      const mergedData = await processDate(
        workspace_id,
        pixelId,
        adAccountIds,
        date,
        userId,
        configuredEventValues
      )
      results.push(mergedData)
    }

    console.log('[Merge] Complete:', { workspace_id, dates_processed: results.length })

    // Update workspace_pixels with the sync date range
    await supabaseAdmin
      .from('workspace_pixels')
      .update({
        last_sync_start: date_start,
        last_sync_end: date_end
      })
      .eq('workspace_id', workspace_id)

    return NextResponse.json({
      success: true,
      workspace_id,
      pixel_id: pixelId,
      date_start,
      date_end,
      dates_processed: results.length,
      results
    })

  } catch (err) {
    console.error('[Merge] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Process attribution merge for a single date
 */
// Normalize event type for matching (CompleteRegistration -> complete_registration)
const normalizeEventType = (type: string): string => {
  return type
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/__+/g, '_')
}

async function processDate(
  workspaceId: string,
  pixelId: string,
  adAccountIds: string[],
  date: string,
  userId: string,
  configuredEventValues: Record<string, number>
): Promise<any> {
  // 1. Get KillScale pixel events for this date (all conversion events, not just purchases)
  const { data: pixelEvents, error: eventsError } = await supabaseAdmin
    .from('pixel_events')
    .select('utm_content, event_type, event_value, source')
    .eq('pixel_id', pixelId)
    .not('event_type', 'ilike', '%pageview%')
    .not('event_type', 'ilike', '%page_view%')
    .gte('event_time', `${date}T00:00:00Z`)
    .lt('event_time', `${date}T23:59:59Z`)

  if (eventsError) {
    console.error('Failed to fetch pixel events:', eventsError)
  }

  // 2. Get Meta API data for this date
  const { data: metaData, error: metaError } = await supabaseAdmin
    .from('ad_data')
    .select('ad_id, ad_name, purchases, revenue, results, result_value')
    .in('ad_account_id', adAccountIds)
    .eq('user_id', userId)
    .eq('date_start', date)

  if (metaError) {
    console.error('Failed to fetch Meta data:', metaError)
  }

  // 3. Build map of ad metrics from both sources
  const adMetricsMap = new Map<string, AdMetrics>()

  // Process pixel events
  if (pixelEvents) {
    for (const event of pixelEvents) {
      const adId = event.utm_content
      if (!adId) continue

      if (!adMetricsMap.has(adId)) {
        adMetricsMap.set(adId, {
          ad_id: adId,
          ad_name: '', // Will fill from Meta data if available
          ks_count: 0,
          ks_revenue: 0,
          manual_count: 0,
          manual_revenue: 0,
          meta_count: 0,
          meta_revenue: 0
        })
      }

      const metrics = adMetricsMap.get(adId)!
      const normalizedType = normalizeEventType(event.event_type || '')
      const configuredValue = configuredEventValues[normalizedType] || configuredEventValues[event.event_type || ''] || 0
      const eventValue = event.event_value ?? configuredValue

      if (event.source === 'manual') {
        metrics.manual_count++
        metrics.manual_revenue += eventValue
      } else {
        metrics.ks_count++
        metrics.ks_revenue += eventValue
      }
    }
  }

  // Process Meta data
  if (metaData) {
    for (const row of metaData) {
      const adId = row.ad_id
      if (!adId) continue

      if (!adMetricsMap.has(adId)) {
        adMetricsMap.set(adId, {
          ad_id: adId,
          ad_name: row.ad_name || '',
          ks_count: 0,
          ks_revenue: 0,
          manual_count: 0,
          manual_revenue: 0,
          meta_count: 0,
          meta_revenue: 0
        })
      }

      const metrics = adMetricsMap.get(adId)!
      metrics.ad_name = row.ad_name || ''

      // Prefer results/result_value, fallback to purchases/revenue
      metrics.meta_count = row.results || row.purchases || 0
      metrics.meta_revenue = row.result_value || row.revenue || 0
    }
  }

  // 4. Apply deduplication algorithm (Over-Estimate Approach)
  let verifiedConversions = 0
  let verifiedRevenue = 0
  let ksOnlyConversions = 0
  let ksOnlyRevenue = 0
  let metaOnlyConversions = 0
  let metaOnlyRevenue = 0
  let manualConversions = 0
  let manualRevenue = 0

  for (const metrics of Array.from(adMetricsMap.values())) {
    // Manual events are always separate
    manualConversions += metrics.manual_count
    manualRevenue += metrics.manual_revenue

    // Verified = MIN(ks, meta) - both sources agree
    const verified = Math.min(metrics.ks_count, metrics.meta_count)
    verifiedConversions += verified

    // For revenue, take proportional amount from KS revenue
    if (metrics.ks_count > 0) {
      const verifiedRevenueFromKs = (verified / metrics.ks_count) * metrics.ks_revenue
      verifiedRevenue += verifiedRevenueFromKs
    }

    // KS-only = MAX(0, ks - meta) - KS tracked extra
    const ksOnly = Math.max(0, metrics.ks_count - metrics.meta_count)
    ksOnlyConversions += ksOnly

    if (metrics.ks_count > 0) {
      const ksOnlyRevenueFromKs = (ksOnly / metrics.ks_count) * metrics.ks_revenue
      ksOnlyRevenue += ksOnlyRevenueFromKs
    }

    // Meta-only = MAX(0, meta - ks) - Meta reported extra
    const metaOnly = Math.max(0, metrics.meta_count - metrics.ks_count)
    metaOnlyConversions += metaOnly

    if (metrics.meta_count > 0) {
      const metaOnlyRevenueFromMeta = (metaOnly / metrics.meta_count) * metrics.meta_revenue
      metaOnlyRevenue += metaOnlyRevenueFromMeta
    }
  }

  const totalConversions = verifiedConversions + ksOnlyConversions + metaOnlyConversions + manualConversions
  const totalRevenue = verifiedRevenue + ksOnlyRevenue + metaOnlyRevenue + manualRevenue

  // 5. Upsert to merged_attribution table
  const { data: mergedRow, error: upsertError } = await supabaseAdmin
    .from('merged_attribution')
    .upsert({
      workspace_id: workspaceId,
      pixel_id: pixelId,
      date: date,
      verified_conversions: Math.round(verifiedConversions),
      verified_revenue: Math.round(verifiedRevenue * 100) / 100,
      ks_only_conversions: Math.round(ksOnlyConversions),
      ks_only_revenue: Math.round(ksOnlyRevenue * 100) / 100,
      meta_only_conversions: Math.round(metaOnlyConversions),
      meta_only_revenue: Math.round(metaOnlyRevenue * 100) / 100,
      manual_conversions: Math.round(manualConversions),
      manual_revenue: Math.round(manualRevenue * 100) / 100,
      total_conversions: Math.round(totalConversions),
      total_revenue: Math.round(totalRevenue * 100) / 100,
      computed_at: new Date().toISOString()
    }, {
      onConflict: 'workspace_id,pixel_id,date'
    })
    .select()
    .single()

  if (upsertError) {
    console.error('Failed to upsert merged attribution:', upsertError)
    throw upsertError
  }

  return {
    date,
    verified_conversions: Math.round(verifiedConversions),
    verified_revenue: Math.round(verifiedRevenue * 100) / 100,
    ks_only_conversions: Math.round(ksOnlyConversions),
    ks_only_revenue: Math.round(ksOnlyRevenue * 100) / 100,
    meta_only_conversions: Math.round(metaOnlyConversions),
    meta_only_revenue: Math.round(metaOnlyRevenue * 100) / 100,
    manual_conversions: Math.round(manualConversions),
    manual_revenue: Math.round(manualRevenue * 100) / 100,
    total_conversions: Math.round(totalConversions),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    ads_analyzed: adMetricsMap.size
  }
}
