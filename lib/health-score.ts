// Health Score - Performance Health Analysis
// Measures account PERFORMANCE (vs Andromeda which measures STRUCTURE)

import { BudgetChangeRecord } from './andromeda-score'
import { Rules } from './supabase'

// Types
export type HealthFactor = 'budgetEfficiency' | 'creativeHealth' | 'profitability' | 'trendDirection'
export type FatigueLevel = 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

export type HealthFactorScore = {
  score: number        // 0 to maxPoints
  maxPoints: number    // Weight for this factor
  percentage: number   // score/maxPoints as 0-100
  details: string      // Human-readable explanation
}

export type CreativeFatigueResult = {
  adId: string
  adName: string
  adsetName: string
  campaignName: string
  fatigueLevel: FatigueLevel
  currentROAS: number
  previousROAS: number
  roasChange: number      // Percentage change (negative = declining)
  currentCTR: number
  previousCTR: number
  ctrChange: number
  spend: number
}

// Budget entity health - where the budget lives (CBO campaign or ABO adset)
export type BudgetEntityHealth = {
  entityId: string
  entityName: string
  entityType: 'campaign' | 'adset'
  budgetType: 'CBO' | 'ABO'
  campaignName: string      // For context (same as entityName for campaigns)
  roas: number
  spend: number
  revenue: number
  dailyBudget?: number      // Current daily budget (for scaling recommendations)
  roasChange: number        // Percentage change vs first half of period
  fatigueLevel: FatigueLevel
  ads: CreativeFatigueResult[]  // Individual ads for drill-down
}

export type TrendPeriodData = {
  periodStart: string
  periodEnd: string
  totalSpend: number
  totalRevenue: number
  totalPurchases: number
  impressions: number
  clicks: number
  roas: number
}

export type HealthScoreResult = {
  totalScore: number    // 0-100
  label: 'Excellent' | 'Good' | 'Needs Work' | 'Critical'
  factors: Record<HealthFactor, HealthFactorScore>
  creatives: CreativeFatigueResult[]           // Legacy: individual ads (kept for compatibility)
  budgetEntities: BudgetEntityHealth[]         // New: CBO campaigns + ABO adsets with nested ads
  trend: {
    current: TrendPeriodData
    previous: TrendPeriodData
    direction: 'improving' | 'stable' | 'declining'
    changePercent: number
  }
}

// Hierarchy types (matching action-center)
export type HierarchyItem = {
  name: string
  level: 'campaign' | 'adset' | 'ad'
  campaignId?: string
  adsetId?: string
  adId?: string
  spend: number
  revenue: number
  purchases: number
  roas: number
  dailyBudget?: number
  lifetimeBudget?: number
  budgetType?: 'CBO' | 'ABO' | null
  status?: string | null
  children?: HierarchyItem[]
}

// Ad data row type
export type AdDataRow = {
  date_start: string
  date_end: string
  campaign_name: string
  campaign_id?: string
  adset_name: string
  adset_id?: string
  ad_name: string
  ad_id?: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  status?: string | null
  adset_status?: string | null
  campaign_status?: string | null
  campaign_daily_budget?: number | null
  campaign_lifetime_budget?: number | null
  adset_daily_budget?: number | null
  adset_lifetime_budget?: number | null
}

// Score weights (must sum to 100)
const WEIGHTS: Record<HealthFactor, number> = {
  budgetEfficiency: 30,
  creativeHealth: 25,
  profitability: 25,
  trendDirection: 20
}

// Fatigue level order for sorting (worst first)
const FATIGUE_ORDER: Record<FatigueLevel, number> = {
  fatigued: 0,
  fatiguing: 1,
  warning: 2,
  healthy: 3
}

// Score labels
const SCORE_LABELS: { min: number; label: HealthScoreResult['label'] }[] = [
  { min: 85, label: 'Excellent' },
  { min: 65, label: 'Good' },
  { min: 45, label: 'Needs Work' },
  { min: 0, label: 'Critical' }
]

/**
 * Calculate Budget Efficiency (0-25 pts)
 * What percentage of daily budget goes to profitable ads?
 */
function calculateBudgetEfficiency(
  hierarchy: HierarchyItem[],
  rules: Rules
): HealthFactorScore {
  let totalBudget = 0
  let weightedScore = 0

  hierarchy.forEach(campaign => {
    // CBO campaigns - budget at campaign level
    if (campaign.budgetType === 'CBO' && campaign.dailyBudget) {
      totalBudget += campaign.dailyBudget
      if (campaign.roas >= rules.scale_roas) {
        weightedScore += campaign.dailyBudget * 1.0  // Profitable
      } else if (campaign.roas >= 1.0) {
        weightedScore += campaign.dailyBudget * 0.5  // Breaking even
      }
      // Losing (ROAS < 1.0) contributes 0
    }

    // ABO adsets - budget at adset level
    campaign.children?.forEach(adset => {
      if ((adset.budgetType === 'ABO' || !campaign.budgetType) && adset.dailyBudget) {
        totalBudget += adset.dailyBudget
        if (adset.roas >= rules.scale_roas) {
          weightedScore += adset.dailyBudget * 1.0
        } else if (adset.roas >= 1.0) {
          weightedScore += adset.dailyBudget * 0.5
        }
      }
    })
  })

  if (totalBudget === 0) {
    return {
      score: WEIGHTS.budgetEfficiency,
      maxPoints: WEIGHTS.budgetEfficiency,
      percentage: 100,
      details: 'No budget data available'
    }
  }

  const efficiency = (weightedScore / totalBudget) * 100
  const score = Math.round((efficiency / 100) * WEIGHTS.budgetEfficiency)

  return {
    score,
    maxPoints: WEIGHTS.budgetEfficiency,
    percentage: Math.round(efficiency),
    details: `${Math.round(efficiency)}% of budget on profitable ads`
  }
}

/**
 * Calculate Creative Health / Fatigue Detection (0-25 pts)
 * Now operates at BUDGET ENTITY level (CBO campaigns, ABO adsets)
 * Individual ad data is kept for drill-down but not used for scoring
 */
function calculateCreativeHealth(
  adData: AdDataRow[],
  hierarchy: HierarchyItem[],
  dateRange: { start: string; end: string }
): { score: HealthFactorScore; creatives: CreativeFatigueResult[]; budgetEntities: BudgetEntityHealth[] } {
  // Filter to only include data within the date range AND active budgets
  // Both campaign AND adset must be ACTIVE for data to count
  // (Paused campaigns/adsets shouldn't appear in health analysis)
  const filteredData = adData.filter(row =>
    row.date_start >= dateRange.start &&
    row.date_start <= dateRange.end &&
    row.campaign_status === 'ACTIVE' &&
    row.adset_status === 'ACTIVE'
  )

  if (filteredData.length === 0) {
    return {
      score: {
        score: WEIGHTS.creativeHealth,
        maxPoints: WEIGHTS.creativeHealth,
        percentage: 100,
        details: 'No ad data to analyze'
      },
      creatives: [],
      budgetEntities: []
    }
  }

  // Calculate midpoint of date range
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const midpointTime = startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2
  const midpoint = new Date(midpointTime).toISOString().split('T')[0]

  // Build budget entity map from hierarchy
  // Key: entityId (campaign_id for CBO, adset_id for ABO)
  const budgetEntityMap = new Map<string, {
    entityId: string
    entityName: string
    entityType: 'campaign' | 'adset'
    budgetType: 'CBO' | 'ABO'
    campaignName: string
    dailyBudget?: number
  }>()

  hierarchy.forEach(campaign => {
    if (campaign.budgetType === 'CBO') {
      // CBO: budget at campaign level
      budgetEntityMap.set(campaign.campaignId || campaign.name, {
        entityId: campaign.campaignId || campaign.name,
        entityName: campaign.name,
        entityType: 'campaign',
        budgetType: 'CBO',
        campaignName: campaign.name,
        dailyBudget: campaign.dailyBudget
      })
    } else {
      // ABO: budget at adset level
      campaign.children?.forEach(adset => {
        if (adset.budgetType === 'ABO' || adset.dailyBudget || adset.lifetimeBudget) {
          budgetEntityMap.set(adset.adsetId || `${campaign.name}::${adset.name}`, {
            entityId: adset.adsetId || `${campaign.name}::${adset.name}`,
            entityName: adset.name,
            entityType: 'adset',
            budgetType: 'ABO',
            campaignName: campaign.name,
            dailyBudget: adset.dailyBudget
          })
        }
      })
    }
  })

  // Group ad_data by budget entity
  const entityDataMap = new Map<string, AdDataRow[]>()

  filteredData.forEach(row => {
    // Determine which budget entity this row belongs to
    const campaignId = row.campaign_id || row.campaign_name
    const adsetId = row.adset_id || `${row.campaign_name}::${row.adset_name}`

    // Check if campaign is CBO (has entry in budgetEntityMap)
    let entityKey: string
    if (budgetEntityMap.has(campaignId) && budgetEntityMap.get(campaignId)?.budgetType === 'CBO') {
      entityKey = campaignId
    } else if (budgetEntityMap.has(adsetId)) {
      entityKey = adsetId
    } else {
      // Fallback: treat as ABO adset if we can't determine
      entityKey = adsetId
      if (!budgetEntityMap.has(entityKey)) {
        budgetEntityMap.set(entityKey, {
          entityId: entityKey,
          entityName: row.adset_name,
          entityType: 'adset',
          budgetType: 'ABO',
          campaignName: row.campaign_name
        })
      }
    }

    const existing = entityDataMap.get(entityKey) || []
    existing.push(row)
    entityDataMap.set(entityKey, existing)
  })

  // Calculate health for each budget entity
  const budgetEntities: BudgetEntityHealth[] = []
  const creatives: CreativeFatigueResult[] = []  // Legacy flat list
  let healthyEntityCount = 0

  entityDataMap.forEach((rows, entityKey) => {
    const entityInfo = budgetEntityMap.get(entityKey)
    if (!entityInfo) return

    // Split into first half and second half
    const firstHalf = rows.filter(r => r.date_start < midpoint)
    const secondHalf = rows.filter(r => r.date_start >= midpoint)

    // Aggregate metrics at entity level
    const allMetrics = aggregateMetrics(rows)
    let roasChange = 0
    let fatigueLevel: FatigueLevel = 'healthy'

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstMetrics = aggregateMetrics(firstHalf)
      const secondMetrics = aggregateMetrics(secondHalf)

      roasChange = firstMetrics.roas > 0
        ? ((secondMetrics.roas - firstMetrics.roas) / firstMetrics.roas) * 100
        : 0

      // Determine fatigue level based on ROAS change
      if (roasChange >= -5) fatigueLevel = 'healthy'
      else if (roasChange >= -15) fatigueLevel = 'warning'
      else if (roasChange >= -30) fatigueLevel = 'fatiguing'
      else fatigueLevel = 'fatigued'
    }

    if (fatigueLevel === 'healthy') healthyEntityCount++

    // Build individual ad data for drill-down
    const adGroups = new Map<string, AdDataRow[]>()
    rows.forEach(row => {
      const adKey = row.ad_id || `${row.campaign_name}::${row.adset_name}::${row.ad_name}`
      const existing = adGroups.get(adKey) || []
      existing.push(row)
      adGroups.set(adKey, existing)
    })

    const entityAds: CreativeFatigueResult[] = []
    adGroups.forEach((adRows, adKey) => {
      const adFirstHalf = adRows.filter(r => r.date_start < midpoint)
      const adSecondHalf = adRows.filter(r => r.date_start >= midpoint)

      const adAllMetrics = aggregateMetrics(adRows)
      let adRoasChange = 0
      let adCtrChange = 0
      let adFatigueLevel: FatigueLevel = 'healthy'
      let adFirstMetrics = { spend: 0, revenue: 0, impressions: 0, clicks: 0, roas: 0, ctr: 0 }
      let adSecondMetrics = adAllMetrics

      if (adFirstHalf.length > 0 && adSecondHalf.length > 0) {
        adFirstMetrics = aggregateMetrics(adFirstHalf)
        adSecondMetrics = aggregateMetrics(adSecondHalf)

        adRoasChange = adFirstMetrics.roas > 0
          ? ((adSecondMetrics.roas - adFirstMetrics.roas) / adFirstMetrics.roas) * 100
          : 0
        adCtrChange = adFirstMetrics.ctr > 0
          ? ((adSecondMetrics.ctr - adFirstMetrics.ctr) / adFirstMetrics.ctr) * 100
          : 0

        const worstDecline = Math.min(adRoasChange, adCtrChange)
        if (worstDecline >= -5) adFatigueLevel = 'healthy'
        else if (worstDecline >= -15) adFatigueLevel = 'warning'
        else if (worstDecline >= -30) adFatigueLevel = 'fatiguing'
        else adFatigueLevel = 'fatigued'
      }

      const firstAdRow = adRows[0]
      const adResult: CreativeFatigueResult = {
        adId: firstAdRow.ad_id || adKey,
        adName: firstAdRow.ad_name,
        adsetName: firstAdRow.adset_name,
        campaignName: firstAdRow.campaign_name,
        fatigueLevel: adFatigueLevel,
        currentROAS: adSecondMetrics.roas,
        previousROAS: adFirstMetrics.roas,
        roasChange: adRoasChange,
        currentCTR: adSecondMetrics.ctr,
        previousCTR: adFirstMetrics.ctr,
        ctrChange: adCtrChange,
        spend: adRows.reduce((sum, r) => sum + r.spend, 0)
      }

      entityAds.push(adResult)
      creatives.push(adResult)  // Also add to legacy flat list
    })

    // Sort ads by spend (highest first)
    entityAds.sort((a, b) => b.spend - a.spend)

    budgetEntities.push({
      entityId: entityInfo.entityId,
      entityName: entityInfo.entityName,
      entityType: entityInfo.entityType,
      budgetType: entityInfo.budgetType,
      campaignName: entityInfo.campaignName,
      roas: allMetrics.roas,
      spend: allMetrics.spend,
      revenue: allMetrics.revenue,
      dailyBudget: entityInfo.dailyBudget,
      roasChange,
      fatigueLevel,
      ads: entityAds
    })
  })

  // Sort budget entities by fatigue level (worst first), then by spend
  budgetEntities.sort((a, b) => {
    const fatigueDiff = FATIGUE_ORDER[a.fatigueLevel] - FATIGUE_ORDER[b.fatigueLevel]
    if (fatigueDiff !== 0) return fatigueDiff
    return b.spend - a.spend
  })

  // Sort legacy creatives list by fatigue level (worst first)
  creatives.sort((a, b) => FATIGUE_ORDER[a.fatigueLevel] - FATIGUE_ORDER[b.fatigueLevel])

  const totalEntities = budgetEntities.length
  if (totalEntities === 0) {
    return {
      score: {
        score: WEIGHTS.creativeHealth,
        maxPoints: WEIGHTS.creativeHealth,
        percentage: 100,
        details: 'Insufficient data for health analysis'
      },
      creatives: [],
      budgetEntities: []
    }
  }

  const healthyPercent = (healthyEntityCount / totalEntities) * 100
  const score = Math.round((healthyPercent / 100) * WEIGHTS.creativeHealth)
  const fatigueCount = totalEntities - healthyEntityCount

  return {
    score: {
      score,
      maxPoints: WEIGHTS.creativeHealth,
      percentage: Math.round(healthyPercent),
      details: fatigueCount > 0
        ? `${fatigueCount} of ${totalEntities} budget entities showing decline`
        : `All ${totalEntities} budget entities healthy`
    },
    creatives,
    budgetEntities
  }
}

/**
 * Helper: Aggregate metrics from multiple rows
 */
function aggregateMetrics(rows: AdDataRow[]): { spend: number; revenue: number; impressions: number; clicks: number; roas: number; ctr: number } {
  const spend = rows.reduce((sum, r) => sum + r.spend, 0)
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0)
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0)

  return {
    spend,
    revenue,
    impressions,
    clicks,
    roas: spend > 0 ? revenue / spend : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0
  }
}

/**
 * Calculate Profitability (0-25 pts)
 * How does overall ROAS compare to thresholds?
 */
function calculateProfitability(
  hierarchy: HierarchyItem[],
  rules: Rules
): HealthFactorScore {
  // Aggregate total spend and revenue across all campaigns
  let totalSpend = 0
  let totalRevenue = 0

  hierarchy.forEach(campaign => {
    totalSpend += campaign.spend
    totalRevenue += campaign.revenue
  })

  if (totalSpend === 0) {
    return {
      score: WEIGHTS.profitability,
      maxPoints: WEIGHTS.profitability,
      percentage: 100,
      details: 'No spend data available'
    }
  }

  const overallROAS = totalRevenue / totalSpend

  // Score based on ROAS relative to thresholds
  // >= scale_roas: 100% of points
  // >= min_roas: 60-100% scaled
  // >= 1.0 (breakeven): 30-60% scaled
  // < 1.0 (losing): 0-30% scaled
  let percentage: number
  let details: string

  if (overallROAS >= rules.scale_roas) {
    percentage = 100
    details = `${overallROAS.toFixed(2)}x ROAS - Excellent (above ${rules.scale_roas}x)`
  } else if (overallROAS >= rules.min_roas) {
    // Scale from 60% to 100% between min_roas and scale_roas
    const range = rules.scale_roas - rules.min_roas
    const position = (overallROAS - rules.min_roas) / range
    percentage = 60 + (position * 40)
    details = `${overallROAS.toFixed(2)}x ROAS - Good (above ${rules.min_roas}x)`
  } else if (overallROAS >= 1.0) {
    // Scale from 30% to 60% between 1.0 and min_roas
    const range = rules.min_roas - 1.0
    const position = (overallROAS - 1.0) / range
    percentage = 30 + (position * 30)
    details = `${overallROAS.toFixed(2)}x ROAS - Breaking even`
  } else {
    // Scale from 0% to 30% between 0 and 1.0
    percentage = overallROAS * 30
    details = `${overallROAS.toFixed(2)}x ROAS - Losing money`
  }

  const score = Math.round((percentage / 100) * WEIGHTS.profitability)

  return {
    score,
    maxPoints: WEIGHTS.profitability,
    percentage: Math.round(percentage),
    details
  }
}

/**
 * Calculate Trend Direction (0-20 pts)
 * Compare current period ROAS vs previous period
 */
function calculateTrendDirection(
  adData: AdDataRow[],
  dateRange: { start: string; end: string }
): { score: HealthFactorScore; trend: HealthScoreResult['trend'] } {
  // Calculate period length in days
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  // Calculate previous period dates
  const prevEndDate = new Date(startDate)
  prevEndDate.setDate(prevEndDate.getDate() - 1)
  const prevStartDate = new Date(prevEndDate)
  prevStartDate.setDate(prevStartDate.getDate() - periodDays + 1)

  const prevStart = prevStartDate.toISOString().split('T')[0]
  const prevEnd = prevEndDate.toISOString().split('T')[0]

  // Aggregate current period
  const currentData = adData.filter(r =>
    r.date_start >= dateRange.start && r.date_start <= dateRange.end
  )
  const current = aggregatePeriod(currentData, dateRange.start, dateRange.end)

  // Aggregate previous period
  const prevData = adData.filter(r =>
    r.date_start >= prevStart && r.date_start <= prevEnd
  )
  const previous = aggregatePeriod(prevData, prevStart, prevEnd)

  // Calculate ROAS change
  const roasChange = previous.roas > 0
    ? ((current.roas - previous.roas) / previous.roas) * 100
    : 0

  // Determine direction
  let direction: 'improving' | 'stable' | 'declining'
  if (roasChange >= 5) direction = 'improving'
  else if (roasChange <= -5) direction = 'declining'
  else direction = 'stable'

  // Calculate score
  let score: number
  if (direction === 'improving') {
    score = WEIGHTS.trendDirection // Full points
  } else if (direction === 'stable') {
    score = Math.round(WEIGHTS.trendDirection * 0.7) // 70% of points
  } else {
    // Declining: scale from 50% (just below -5%) to 0 (at -30% or worse)
    const declinePercent = Math.abs(roasChange)
    const penaltyFactor = Math.max(0, 1 - (declinePercent - 5) / 25)
    score = Math.round(WEIGHTS.trendDirection * 0.5 * penaltyFactor)
  }

  const details = direction === 'improving'
    ? `ROAS up ${roasChange.toFixed(1)}% vs previous period`
    : direction === 'stable'
    ? `ROAS stable (${roasChange > 0 ? '+' : ''}${roasChange.toFixed(1)}%)`
    : `ROAS down ${Math.abs(roasChange).toFixed(1)}% vs previous period`

  return {
    score: {
      score,
      maxPoints: WEIGHTS.trendDirection,
      percentage: Math.round((score / WEIGHTS.trendDirection) * 100),
      details
    },
    trend: {
      current,
      previous,
      direction,
      changePercent: roasChange
    }
  }
}

/**
 * Helper: Aggregate period data
 */
function aggregatePeriod(rows: AdDataRow[], periodStart: string, periodEnd: string): TrendPeriodData {
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0)
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const totalPurchases = rows.reduce((sum, r) => sum + r.purchases, 0)
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0)
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0)

  return {
    periodStart,
    periodEnd,
    totalSpend,
    totalRevenue,
    totalPurchases,
    impressions,
    clicks,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0
  }
}

/**
 * Main function: Calculate Health Score
 */
export function calculateHealthScore(
  hierarchy: HierarchyItem[],
  adData: AdDataRow[],
  rules: Rules,
  _budgetChanges: BudgetChangeRecord[],  // Kept for API compatibility, no longer used
  dateRange: { start: string; end: string },
  _dateRangeDays: number  // Kept for API compatibility, no longer used
): HealthScoreResult {
  // Calculate each factor
  const budgetEfficiency = calculateBudgetEfficiency(hierarchy, rules)
  const { score: creativeHealthScore, creatives, budgetEntities } = calculateCreativeHealth(adData, hierarchy, dateRange)
  const profitability = calculateProfitability(hierarchy, rules)
  const { score: trendScore, trend } = calculateTrendDirection(adData, dateRange)

  // Sum all scores
  const totalScore =
    budgetEfficiency.score +
    creativeHealthScore.score +
    profitability.score +
    trendScore.score

  // Determine label
  const label = SCORE_LABELS.find(s => totalScore >= s.min)?.label || 'Critical'

  return {
    totalScore,
    label,
    factors: {
      budgetEfficiency,
      creativeHealth: creativeHealthScore,
      profitability,
      trendDirection: trendScore
    },
    creatives,
    budgetEntities,
    trend
  }
}

/**
 * Get Tailwind text color class for health score
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 85) return 'text-verdict-scale'
  if (score >= 65) return 'text-verdict-watch'
  if (score >= 45) return 'text-amber-500'
  return 'text-verdict-kill'
}

/**
 * Get Tailwind background color class for health score
 */
export function getHealthScoreBgColor(score: number): string {
  if (score >= 85) return 'bg-verdict-scale'
  if (score >= 65) return 'bg-verdict-watch'
  if (score >= 45) return 'bg-amber-500'
  return 'bg-verdict-kill'
}

/**
 * Get fatigue level color
 */
export function getFatigueColor(level: FatigueLevel): string {
  switch (level) {
    case 'healthy': return 'text-verdict-scale'
    case 'warning': return 'text-verdict-watch'
    case 'fatiguing': return 'text-amber-500'
    case 'fatigued': return 'text-verdict-kill'
  }
}

/**
 * Get fatigue level badge classes
 */
export function getFatigueBadgeClasses(level: FatigueLevel): string {
  switch (level) {
    case 'healthy': return 'bg-verdict-scale/20 text-verdict-scale'
    case 'warning': return 'bg-verdict-watch/20 text-verdict-watch'
    case 'fatiguing': return 'bg-amber-500/20 text-amber-500'
    case 'fatigued': return 'bg-verdict-kill/20 text-verdict-kill'
  }
}
