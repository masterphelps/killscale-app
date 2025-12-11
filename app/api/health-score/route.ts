import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateHealthScore, HierarchyItem, AdDataRow } from '@/lib/health-score'
import { BudgetChangeRecord } from '@/lib/andromeda-score'
import { Rules } from '@/lib/supabase'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_RULES: Rules = {
  id: '',
  user_id: '',
  scale_roas: 3.0,
  min_roas: 1.5,
  learning_spend: 100,
  scale_percentage: 20,
  created_at: '',
  updated_at: ''
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, dateStart, dateEnd } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Fetch ad_data for user
    let adDataQuery = supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', userId)

    if (adAccountId) {
      adDataQuery = adDataQuery.eq('ad_account_id', adAccountId)
    }

    const { data: rawAdData, error: adError } = await adDataQuery

    if (adError) {
      console.error('Error fetching ad data:', adError)
      return NextResponse.json({ error: 'Failed to fetch ad data' }, { status: 500 })
    }

    if (!rawAdData || rawAdData.length === 0) {
      return NextResponse.json({ error: 'No ad data found' }, { status: 404 })
    }

    // Transform to AdDataRow type
    const adData: AdDataRow[] = rawAdData.map(row => ({
      date_start: row.date_start,
      date_end: row.date_end,
      campaign_name: row.campaign_name,
      campaign_id: row.campaign_id,
      adset_name: row.adset_name,
      adset_id: row.adset_id,
      ad_name: row.ad_name,
      ad_id: row.ad_id,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      spend: parseFloat(row.spend) || 0,
      purchases: row.purchases || 0,
      revenue: parseFloat(row.revenue) || 0,
      status: row.status,
      adset_status: row.adset_status,
      campaign_status: row.campaign_status,
      campaign_daily_budget: row.campaign_daily_budget,
      campaign_lifetime_budget: row.campaign_lifetime_budget,
      adset_daily_budget: row.adset_daily_budget,
      adset_lifetime_budget: row.adset_lifetime_budget
    }))

    // Calculate date range
    const dateRange = {
      start: dateStart || adData.reduce((min, r) => r.date_start < min ? r.date_start : min, adData[0].date_start),
      end: dateEnd || adData.reduce((max, r) => r.date_start > max ? r.date_start : max, adData[0].date_start)
    }

    // Calculate date range days
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)
    const dateRangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Filter ad data by date range
    const filteredAdData = adData.filter(row =>
      row.date_start >= dateRange.start && row.date_start <= dateRange.end
    )

    // Fetch rules
    let rulesQuery = supabase
      .from('rules')
      .select('*')
      .eq('user_id', userId)

    if (adAccountId) {
      rulesQuery = rulesQuery.eq('ad_account_id', adAccountId)
    } else {
      rulesQuery = rulesQuery.is('ad_account_id', null)
    }

    const { data: rulesData } = await rulesQuery.single()

    const rules: Rules = rulesData ? {
      id: rulesData.id,
      user_id: rulesData.user_id,
      scale_roas: parseFloat(rulesData.scale_roas) || DEFAULT_RULES.scale_roas,
      min_roas: parseFloat(rulesData.min_roas) || DEFAULT_RULES.min_roas,
      learning_spend: parseFloat(rulesData.learning_spend) || DEFAULT_RULES.learning_spend,
      scale_percentage: parseFloat(rulesData.scale_percentage) || DEFAULT_RULES.scale_percentage,
      created_at: rulesData.created_at,
      updated_at: rulesData.updated_at
    } : DEFAULT_RULES

    // Fetch budget changes (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    let budgetChangesQuery = supabase
      .from('budget_changes')
      .select('entity_id, entity_type, old_budget, new_budget, changed_at')
      .eq('user_id', userId)
      .gte('changed_at', sevenDaysAgo.toISOString())

    if (adAccountId) {
      budgetChangesQuery = budgetChangesQuery.eq('ad_account_id', adAccountId)
    }

    const { data: budgetChangesData } = await budgetChangesQuery
    const budgetChanges: BudgetChangeRecord[] = (budgetChangesData || []) as BudgetChangeRecord[]

    // Build hierarchy from filtered ad data
    const hierarchy = buildHierarchy(filteredAdData)

    // Debug: Count unique ads and analyze by status
    const uniqueAdIds = new Set(filteredAdData.map(r => r.ad_id).filter(Boolean))
    const statusCounts: Record<string, number> = {}
    const adsByStatus = new Map<string, Set<string>>()

    filteredAdData.forEach(r => {
      const status = r.status || 'UNKNOWN'
      statusCounts[status] = (statusCounts[status] || 0) + 1
      if (!adsByStatus.has(status)) adsByStatus.set(status, new Set())
      adsByStatus.get(status)!.add(r.ad_id || r.ad_name)
    })

    const uniqueByStatus: Record<string, number> = {}
    adsByStatus.forEach((ads, status) => {
      uniqueByStatus[status] = ads.size
    })

    console.log('Health Score Debug:', {
      totalRows: filteredAdData.length,
      uniqueAdIds: uniqueAdIds.size,
      dateRange,
      statusCounts,
      uniqueByStatus
    })

    // Calculate health score
    const healthScore = calculateHealthScore(
      hierarchy,
      adData, // Pass full data for trend comparison (needs previous period)
      rules,
      budgetChanges,
      dateRange,
      dateRangeDays
    )

    return NextResponse.json(healthScore)
  } catch (err) {
    console.error('Health score error:', err)
    return NextResponse.json({ error: 'Failed to calculate health score' }, { status: 500 })
  }
}

/**
 * Build hierarchy from ad data (same pattern as action-center)
 */
function buildHierarchy(adData: AdDataRow[]): HierarchyItem[] {
  if (adData.length === 0) return []

  const campaignMap = new Map<string, HierarchyItem>()

  adData.forEach(row => {
    // Get or create campaign
    let campaign = campaignMap.get(row.campaign_name)
    if (!campaign) {
      campaign = {
        name: row.campaign_name,
        level: 'campaign',
        campaignId: row.campaign_id || undefined,
        spend: 0,
        revenue: 0,
        purchases: 0,
        roas: 0,
        status: row.campaign_status,
        budgetType: row.campaign_daily_budget || row.campaign_lifetime_budget ? 'CBO' : null,
        dailyBudget: row.campaign_daily_budget || undefined,
        lifetimeBudget: row.campaign_lifetime_budget || undefined,
        children: []
      }
      campaignMap.set(row.campaign_name, campaign)
    }

    // Aggregate campaign metrics
    campaign.spend += row.spend
    campaign.revenue += row.revenue
    campaign.purchases += row.purchases

    // Get or create adset
    let adset = campaign.children?.find(a => a.name === row.adset_name)
    if (!adset) {
      adset = {
        name: row.adset_name,
        level: 'adset',
        adsetId: row.adset_id || undefined,
        spend: 0,
        revenue: 0,
        purchases: 0,
        roas: 0,
        status: row.adset_status,
        budgetType: row.adset_daily_budget || row.adset_lifetime_budget ? 'ABO' : null,
        dailyBudget: row.adset_daily_budget || undefined,
        lifetimeBudget: row.adset_lifetime_budget || undefined,
        children: []
      }
      campaign.children?.push(adset)
    }

    // Aggregate adset metrics
    adset.spend += row.spend
    adset.revenue += row.revenue
    adset.purchases += row.purchases

    // Get or create ad
    let ad = adset.children?.find(a => a.name === row.ad_name)
    if (!ad) {
      ad = {
        name: row.ad_name,
        level: 'ad',
        adId: row.ad_id || undefined,
        spend: 0,
        revenue: 0,
        purchases: 0,
        roas: 0,
        status: row.status
      }
      adset.children?.push(ad)
    }

    // Aggregate ad metrics
    ad.spend += row.spend
    ad.revenue += row.revenue
    ad.purchases += row.purchases
  })

  // Calculate ROAS
  campaignMap.forEach(campaign => {
    campaign.roas = campaign.spend > 0 ? campaign.revenue / campaign.spend : 0
    campaign.children?.forEach(adset => {
      adset.roas = adset.spend > 0 ? adset.revenue / adset.spend : 0
      adset.children?.forEach(ad => {
        ad.roas = ad.spend > 0 ? ad.revenue / ad.spend : 0
      })
    })
  })

  return Array.from(campaignMap.values())
}
