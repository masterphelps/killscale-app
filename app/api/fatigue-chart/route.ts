import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type DailyMetrics = {
  date: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  reach: number
  frequency: number
  ctr: number
  cpm: number
  cpa: number
  results: number
}

type FatigueStatus = 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

type FatigueAnalysis = {
  baselineCtr: number
  baselineCpm: number
  baselineCpa: number
  currentCtr: number
  currentCpm: number
  currentCpa: number
  ctrDeclinePct: number
  cpmIncreasePct: number
  cpaIncreasePct: number
  crossoverDates: string[]
  status: FatigueStatus
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const adAccountId = searchParams.get('adAccountId')
  const entityType = searchParams.get('entityType') // campaign | adset | ad
  const entityId = searchParams.get('entityId')
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  if (!userId || !adAccountId || !entityType || !entityId || !since || !until) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // Cap the end date to yesterday — sync only populates through yesterday,
  // so today's rows are placeholders with 0 metrics that would tank the chart
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const effectiveUntil = until > yesterdayStr ? yesterdayStr : until

  // Build query filtered by entity type
  let query = supabase
    .from('ad_data')
    .select('date_start, impressions, clicks, spend, purchases, revenue, reach, frequency, results')
    .eq('user_id', userId)
    .eq('ad_account_id', adAccountId)
    .gte('date_start', since)
    .lte('date_start', effectiveUntil)

  if (entityType === 'campaign') {
    query = query.eq('campaign_id', entityId)
  } else if (entityType === 'adset') {
    query = query.eq('adset_id', entityId)
  } else {
    query = query.eq('ad_id', entityId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ dailyData: [], fatigue: null })
  }

  // Group by date and aggregate metrics
  // Track raw frequency values from Meta as fallback when reach column hasn't been synced yet
  const dailyMap: Record<string, { impressions: number; clicks: number; spend: number; purchases: number; revenue: number; reach: number; results: number; rawFreqSum: number; rawFreqCount: number }> = {}

  for (const row of data) {
    const date = row.date_start
    if (!dailyMap[date]) {
      dailyMap[date] = { impressions: 0, clicks: 0, spend: 0, purchases: 0, revenue: 0, reach: 0, results: 0, rawFreqSum: 0, rawFreqCount: 0 }
    }
    dailyMap[date].impressions += row.impressions || 0
    dailyMap[date].clicks += row.clicks || 0
    dailyMap[date].spend += parseFloat(row.spend) || 0
    dailyMap[date].purchases += row.purchases || 0
    dailyMap[date].revenue += parseFloat(row.revenue) || 0
    dailyMap[date].reach += row.reach || 0
    dailyMap[date].results += row.results || 0
    // Track raw frequency from Meta for fallback (weighted average by impressions)
    const rawFreq = parseFloat(row.frequency) || 0
    if (rawFreq > 0) {
      dailyMap[date].rawFreqSum += rawFreq * (row.impressions || 1)
      dailyMap[date].rawFreqCount += row.impressions || 1
    }
  }

  // Convert to sorted daily array with calculated metrics
  const dailyData: DailyMetrics[] = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const frequency = d.reach > 0
        ? d.impressions / d.reach
        : (d.rawFreqCount > 0 ? d.rawFreqSum / d.rawFreqCount : 0)
      return {
        date,
        impressions: d.impressions,
        clicks: d.clicks,
        spend: d.spend,
        purchases: d.purchases,
        revenue: d.revenue,
        reach: d.reach,
        frequency,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
        cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
        cpa: d.purchases > 0 ? d.spend / d.purchases : 0,
        results: d.results,
      }
    })

  // Need at least 3 days for fatigue analysis
  if (dailyData.length < 3) {
    return NextResponse.json({ dailyData, fatigue: null })
  }

  // Baseline = average of first 3 days
  const baselineDays = dailyData.slice(0, 3)
  const baselineCtr = baselineDays.reduce((s, d) => s + d.ctr, 0) / baselineDays.length
  const baselineCpm = baselineDays.reduce((s, d) => s + d.cpm, 0) / baselineDays.length
  const baselineCpa = baselineDays.reduce((s, d) => s + d.cpa, 0) / baselineDays.length

  // Current = average of last 3 days
  const currentDays = dailyData.slice(-3)
  const currentCtr = currentDays.reduce((s, d) => s + d.ctr, 0) / currentDays.length
  const currentCpm = currentDays.reduce((s, d) => s + d.cpm, 0) / currentDays.length
  const currentCpa = currentDays.reduce((s, d) => s + d.cpa, 0) / currentDays.length

  // Calculate change percentages
  const ctrDeclinePct = baselineCtr > 0 ? ((baselineCtr - currentCtr) / baselineCtr) * 100 : 0
  const cpmIncreasePct = baselineCpm > 0 ? ((currentCpm - baselineCpm) / baselineCpm) * 100 : 0
  const cpaIncreasePct = baselineCpa > 0 ? ((currentCpa - baselineCpa) / baselineCpa) * 100 : 0

  // Crossover dates: days where CTR drop >20% AND CPM or CPA rising >20%
  const crossoverDates: string[] = []
  for (const day of dailyData) {
    if (baselineCtr > 0 && baselineCpm > 0) {
      const dayCtrDrop = ((baselineCtr - day.ctr) / baselineCtr) * 100
      const dayCpmRise = ((day.cpm - baselineCpm) / baselineCpm) * 100
      const dayCpaRise = baselineCpa > 0 ? ((day.cpa - baselineCpa) / baselineCpa) * 100 : 0
      if (dayCtrDrop > 20 && (dayCpmRise > 20 || dayCpaRise > 20)) {
        crossoverDates.push(day.date)
      }
    }
  }

  // Determine fatigue status using industry-standard media buying logic:
  // - Frequency is the LEADING indicator (audience saturation)
  // - CTR decline + CPM/CPA rising are CONFIRMING indicators (performance impact)
  // - KEY RULE: high frequency + steady CPA = still working, don't change
  // - Only flag fatigue when it's ACTUALLY hurting performance
  const avgFrequency = dailyData.reduce((s, d) => s + d.frequency, 0) / dailyData.length
  const cpaStableOrImproving = cpaIncreasePct <= 5  // CPA not rising meaningfully

  let status: FatigueStatus = 'healthy'

  if (cpaStableOrImproving && cpmIncreasePct <= 10) {
    // CPA stable and CPM not spiking = ad is still performing, regardless of frequency
    // Only warn if frequency is very high (audience will saturate eventually)
    if (avgFrequency >= 3 && ctrDeclinePct > 10) {
      status = 'warning'  // High freq with early CTR dip — watch closely
    }
    // Otherwise healthy — if conversions are steady, don't touch it
  } else {
    // Costs ARE rising — now check if frequency confirms audience fatigue
    if (avgFrequency >= 3 && ctrDeclinePct > 25 && cpaIncreasePct > 20) {
      status = 'fatigued'   // Freq 3+, CTR tanking, CPA spiking → refresh creatives now
    } else if (avgFrequency >= 2.5 && ctrDeclinePct > 20 && (cpaIncreasePct > 15 || cpmIncreasePct > 20)) {
      status = 'fatiguing'  // Freq elevated, clear performance decline → plan creative refresh
    } else if (avgFrequency >= 2 && (ctrDeclinePct > 15 || cpaIncreasePct > 10)) {
      status = 'warning'    // Early signs — frequency rising with costs starting to creep
    }
    // Rising costs without high frequency = not fatigue (could be auction/seasonal)
  }

  const fatigue: FatigueAnalysis = {
    baselineCtr,
    baselineCpm,
    baselineCpa,
    currentCtr,
    currentCpm,
    currentCpa,
    ctrDeclinePct,
    cpmIncreasePct,
    cpaIncreasePct,
    crossoverDates,
    status,
  }

  return NextResponse.json({ dailyData, fatigue })
}
