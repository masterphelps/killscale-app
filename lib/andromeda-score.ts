// Andromeda Optimization Score
// Audits Meta ad account structure against Andromeda ML best practices
// Updated Dec 2024 based on post-Andromeda rollout research
// Sources: Foxwell Digital, Jon Loomer, Meta Engineering Blog, Reddit r/FacebookAds

export type AndromedaFactor = 'cbo' | 'creative' | 'adsets' | 'learning' | 'stability'
export type IssueSeverity = 'critical' | 'warning' | 'passing'

export type AndromedaIssue = {
  severity: IssueSeverity
  factor: AndromedaFactor
  message: string
  recommendation: string
  entityName?: string
}

export type FactorScore = {
  score: number  // 0-100
  weight: number // Decimal weight (e.g., 0.25 for 25%)
  details: string
}

export type AndromedaScoreResult = {
  totalScore: number  // 0-100 weighted average
  label: 'Excellent' | 'Good' | 'Needs Work' | 'Critical'
  factors: Record<AndromedaFactor, FactorScore>
  issues: AndromedaIssue[]
}

export type CampaignData = {
  name: string
  id?: string
  spend: number
  purchases: number
  budgetType: 'CBO' | 'ABO' | null
  adsetCount: number
  adsets: AdsetData[]
}

export type AdsetData = {
  name: string
  id?: string
  spend: number
  purchases: number
  adCount: number
}

export type BudgetChangeRecord = {
  entity_id: string
  entity_type: 'campaign' | 'adset'
  old_budget: number
  new_budget: number
  changed_at: string
}

// Weights for each factor (must sum to 1.0)
const WEIGHTS: Record<AndromedaFactor, number> = {
  cbo: 0.25,
  creative: 0.25,
  adsets: 0.20,
  learning: 0.20,
  stability: 0.10
}

const SCORE_LABELS: { min: number; label: AndromedaScoreResult['label'] }[] = [
  { min: 90, label: 'Excellent' },
  { min: 70, label: 'Good' },
  { min: 50, label: 'Needs Work' },
  { min: 0, label: 'Critical' }
]

/**
 * Calculate the Andromeda Optimization Score for an ad account
 */
export function calculateAndromedaScore(
  campaigns: CampaignData[],
  budgetChanges: BudgetChangeRecord[],
  dateRangeDays: number = 7
): AndromedaScoreResult {
  const issues: AndromedaIssue[] = []

  // Factor 1: CBO Adoption (25%)
  const cboScore = calculateCBOScore(campaigns, issues)

  // Factor 2: Creative Consolidation (25%)
  const creativeScore = calculateCreativeScore(campaigns, issues)

  // Factor 3: Ad Set Count per Campaign (20%)
  const adsetScore = calculateAdsetCountScore(campaigns, issues)

  // Factor 4: Learning Phase Exits (20%)
  const learningScore = calculateLearningScore(campaigns, dateRangeDays, issues)

  // Factor 5: Budget Stability (10%)
  const stabilityScore = calculateStabilityScore(budgetChanges, issues)

  // Calculate weighted total
  const factors: Record<AndromedaFactor, FactorScore> = {
    cbo: cboScore,
    creative: creativeScore,
    adsets: adsetScore,
    learning: learningScore,
    stability: stabilityScore
  }

  const totalScore = Math.round(
    Object.entries(factors).reduce(
      (sum, [, factor]) => sum + factor.score * factor.weight,
      0
    )
  )

  const label = SCORE_LABELS.find(s => totalScore >= s.min)?.label || 'Critical'

  return {
    totalScore,
    label,
    factors,
    issues: issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, passing: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }
}

/**
 * Factor 1: CBO Adoption
 * Goal: Encourage Campaign Budget Optimization over Ad Set Budget
 */
function calculateCBOScore(campaigns: CampaignData[], issues: AndromedaIssue[]): FactorScore {
  if (campaigns.length === 0) {
    return { score: 100, weight: WEIGHTS.cbo, details: 'No campaigns to analyze' }
  }

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
  if (totalSpend === 0) {
    return { score: 100, weight: WEIGHTS.cbo, details: 'No spend data' }
  }

  // Check if we have budget type data (API syncs have it, CSV doesn't)
  const hasBudgetData = campaigns.some(c => c.budgetType !== null)
  if (!hasBudgetData) {
    return { score: 0, weight: 0, details: 'Budget type data not available (CSV upload)' }
  }

  const cboSpend = campaigns
    .filter(c => c.budgetType === 'CBO')
    .reduce((sum, c) => sum + c.spend, 0)

  const cboPercent = (cboSpend / totalSpend) * 100
  const score = Math.min(100, cboPercent)

  // Generate issues for ABO campaigns
  const aboCampaigns = campaigns.filter(c => c.budgetType === 'ABO')
  if (aboCampaigns.length > 0 && cboPercent < 80) {
    const severity: IssueSeverity = cboPercent < 50 ? 'critical' : 'warning'
    issues.push({
      severity,
      factor: 'cbo',
      message: `${aboCampaigns.length} campaign${aboCampaigns.length > 1 ? 's' : ''} using ABO`,
      recommendation: 'Switch to CBO to let Meta optimize budget allocation across ad sets'
    })
  }

  return {
    score: Math.round(score),
    weight: WEIGHTS.cbo,
    details: `${cboPercent.toFixed(0)}% of spend on CBO campaigns`
  }
}

/**
 * Factor 2: Creative Volume
 * Goal: 4+ diverse creatives per ad set for Andromeda
 * Post-Andromeda update: More creatives = better (aim for 4-15+)
 * Score based on % of ad sets with enough creatives
 */
function calculateCreativeScore(campaigns: CampaignData[], issues: AndromedaIssue[]): FactorScore {
  // Build adsets with campaign context
  const adsetsWithCampaign = campaigns.flatMap(c =>
    c.adsets.map(adset => ({ ...adset, campaignName: c.name }))
  )

  if (adsetsWithCampaign.length === 0) {
    return { score: 100, weight: WEIGHTS.creative, details: 'No ad sets to analyze' }
  }

  // Post-Andromeda: 4+ creatives is good, 8+ is excellent
  // No upper limit warning - Andromeda handles large creative pools well
  const MIN_CREATIVES = 4
  const GOOD_CREATIVES = 8

  const excellentAdsets = adsetsWithCampaign.filter(a => a.adCount >= GOOD_CREATIVES)
  const goodAdsets = adsetsWithCampaign.filter(a => a.adCount >= MIN_CREATIVES && a.adCount < GOOD_CREATIVES)
  const lowAdsets = adsetsWithCampaign.filter(a => a.adCount < MIN_CREATIVES && a.adCount > 0)
  const emptyAdsets = adsetsWithCampaign.filter(a => a.adCount === 0)

  // Score: 100% for 8+, 75% for 4-7, 0% for <4
  const excellentScore = excellentAdsets.length * 100
  const goodScore = goodAdsets.length * 75
  const totalPossible = adsetsWithCampaign.length * 100
  const score = totalPossible > 0 ? Math.round((excellentScore + goodScore) / totalPossible * 100) : 100

  // Generate issues for ad sets with too few creatives
  if (lowAdsets.length > 0) {
    const severity: IssueSeverity = lowAdsets.length >= 3 ? 'critical' : 'warning'

    // Add individual issues for each affected ad set (max 10)
    lowAdsets.slice(0, 10).forEach(adset => {
      const creativeWord = adset.adCount === 1 ? 'creative' : 'creatives'
      const needed = MIN_CREATIVES - adset.adCount
      issues.push({
        severity,
        factor: 'creative',
        message: `"${adset.name}" has only ${adset.adCount} ${creativeWord}`,
        recommendation: `Add ${needed}+ more diverse creatives (aim for 8-15 total)`,
        entityName: adset.name
      })
    })

    if (lowAdsets.length > 10) {
      issues.push({
        severity,
        factor: 'creative',
        message: `...and ${lowAdsets.length - 10} more ad sets with <${MIN_CREATIVES} creatives`,
        recommendation: 'Andromeda performs best with 8-15 diverse creatives per ad set'
      })
    }
  }

  // Note: No warning for "too many" creatives - Andromeda handles this well

  const sufficient = excellentAdsets.length + goodAdsets.length
  return {
    score,
    weight: WEIGHTS.creative,
    details: `${sufficient}/${adsetsWithCampaign.length} ad sets have 4+ creatives`
  }
}

/**
 * Factor 3: Ad Set Count per Campaign (Structure Consolidation)
 * Post-Andromeda best practice: 1-3 ad sets per campaign (ideally 1)
 * "One campaign per objective with one ad set" is the new gold standard
 * More ad sets = fragmented data = slower learning
 */
function calculateAdsetCountScore(campaigns: CampaignData[], issues: AndromedaIssue[]): FactorScore {
  if (campaigns.length === 0) {
    return { score: 100, weight: WEIGHTS.adsets, details: 'No campaigns to analyze' }
  }

  // Post-Andromeda scoring:
  // 1 ad set = 100% (excellent - ideal for Andromeda)
  // 2-3 ad sets = 75% (good - acceptable)
  // 4-5 ad sets = 50% (okay - consider consolidating)
  // 6+ ad sets = 0% (fragmented - hurting performance)

  let totalScore = 0
  const idealCampaigns = campaigns.filter(c => c.adsetCount === 1)
  const goodCampaigns = campaigns.filter(c => c.adsetCount >= 2 && c.adsetCount <= 3)
  const okayCampaigns = campaigns.filter(c => c.adsetCount >= 4 && c.adsetCount <= 5)
  const fragmentedCampaigns = campaigns.filter(c => c.adsetCount > 5)

  totalScore = (idealCampaigns.length * 100) +
               (goodCampaigns.length * 75) +
               (okayCampaigns.length * 50) +
               (fragmentedCampaigns.length * 0)

  const score = totalScore / campaigns.length

  // Generate issues for campaigns with too many ad sets
  fragmentedCampaigns.forEach(campaign => {
    issues.push({
      severity: 'critical',
      factor: 'adsets',
      message: `"${campaign.name}" has ${campaign.adsetCount} ad sets`,
      recommendation: 'Consolidate to 1 ad set with 8-15 creatives. Andromeda works best with simple structures.',
      entityName: campaign.name
    })
  })

  // Also warn about 4-5 ad sets - not critical but suboptimal
  okayCampaigns.forEach(campaign => {
    issues.push({
      severity: 'warning',
      factor: 'adsets',
      message: `"${campaign.name}" has ${campaign.adsetCount} ad sets`,
      recommendation: 'Consider consolidating to 1-3 ad sets. Fewer ad sets = more data per ad set.',
      entityName: campaign.name
    })
  })

  const consolidated = idealCampaigns.length + goodCampaigns.length
  return {
    score: Math.round(score),
    weight: WEIGHTS.adsets,
    details: consolidated === campaigns.length
      ? 'All campaigns have optimal structure (1-3 ad sets)'
      : `${consolidated}/${campaigns.length} campaigns have optimal ad set count`
  }
}

/**
 * Factor 4: Learning Phase Exits
 * 2024 Update: Meta lowered threshold to 10 conversions in 3 days for Purchase/App Install
 * Previous threshold was 50 conversions in 7 days
 * We use ~25 conversions/week as a more relaxed "on track" metric
 * Ad sets below this are likely learning limited
 */
function calculateLearningScore(
  campaigns: CampaignData[],
  dateRangeDays: number,
  issues: AndromedaIssue[]
): FactorScore {
  const allAdsets = campaigns.flatMap(c => c.adsets)
  if (allAdsets.length === 0) {
    return { score: 100, weight: WEIGHTS.learning, details: 'No ad sets to analyze' }
  }

  // Calculate weekly conversion rate (extrapolate if not exactly 7 days)
  const weeklyMultiplier = 7 / Math.max(1, dateRangeDays)

  // 2024 thresholds:
  // - Excellent: 50+ conversions/week (clearly exited learning)
  // - Good: 25-49 conversions/week (on track, likely exited with new 10/3-day rule)
  // - Learning Limited: <25 conversions/week (may be stuck)
  const EXCELLENT_THRESHOLD = 50
  const GOOD_THRESHOLD = 25

  const adsetsWithLearning = allAdsets.map(adset => ({
    ...adset,
    weeklyConversions: adset.purchases * weeklyMultiplier
  }))

  const excellentAdsets = adsetsWithLearning.filter(a => a.weeklyConversions >= EXCELLENT_THRESHOLD)
  const goodAdsets = adsetsWithLearning.filter(a => a.weeklyConversions >= GOOD_THRESHOLD && a.weeklyConversions < EXCELLENT_THRESHOLD)
  const learningLimited = adsetsWithLearning.filter(a => a.weeklyConversions < GOOD_THRESHOLD)

  // Score: Excellent = 100%, Good = 75%, Learning Limited = 0%
  // If you're not hitting 25+ conv/week, you're stuck in learning phase
  const totalScore = (excellentAdsets.length * 100) +
                     (goodAdsets.length * 75)
  const score = totalScore / allAdsets.length

  // Generate issues for adsets stuck in learning
  if (learningLimited.length > 0) {
    const severity: IssueSeverity = learningLimited.length >= allAdsets.length * 0.5 ? 'critical' : 'warning'
    issues.push({
      severity,
      factor: 'learning',
      message: `${learningLimited.length} ad set${learningLimited.length > 1 ? 's' : ''} below 25 conversions/week`,
      recommendation: 'Consider consolidating or increasing budget. Learning-limited ad sets have 68% higher CPAs.'
    })
  }

  const healthyCount = excellentAdsets.length + goodAdsets.length
  return {
    score: Math.round(score),
    weight: WEIGHTS.learning,
    details: healthyCount === allAdsets.length
      ? 'All ad sets have healthy conversion volume'
      : `${healthyCount}/${allAdsets.length} ad sets have 25+ conversions/week`
  }
}

/**
 * Factor 5: Budget Stability (Scaling Discipline)
 * Best practice: 15-20% budget increases per day when scaling
 * Changes over 20% can reset learning phase
 * Multiple aggressive changes compound the problem
 */
function calculateStabilityScore(
  budgetChanges: BudgetChangeRecord[],
  issues: AndromedaIssue[]
): FactorScore {
  if (budgetChanges.length === 0) {
    return { score: 100, weight: WEIGHTS.stability, details: 'No recent budget changes' }
  }

  // Look at changes in last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const recentChanges = budgetChanges.filter(
    c => new Date(c.changed_at) > sevenDaysAgo
  )

  if (recentChanges.length === 0) {
    return { score: 100, weight: WEIGHTS.stability, details: 'No budget changes in last 7 days' }
  }

  // Categorize changes by aggressiveness
  // Safe: ≤20% (recommended by experts)
  // Moderate: 21-30% (may cause minor disruption)
  // Aggressive: >30% (likely to reset learning)
  const SAFE_THRESHOLD = 20
  const MODERATE_THRESHOLD = 30

  const categorizedChanges = recentChanges.map(c => {
    if (c.old_budget === 0) return { ...c, changePercent: 0, category: 'safe' as const }
    const changePercent = Math.abs((c.new_budget - c.old_budget) / c.old_budget) * 100
    let category: 'safe' | 'moderate' | 'aggressive'
    if (changePercent <= SAFE_THRESHOLD) category = 'safe'
    else if (changePercent <= MODERATE_THRESHOLD) category = 'moderate'
    else category = 'aggressive'
    return { ...c, changePercent, category }
  })

  const safeChanges = categorizedChanges.filter(c => c.category === 'safe')
  const moderateChanges = categorizedChanges.filter(c => c.category === 'moderate')
  const aggressiveChanges = categorizedChanges.filter(c => c.category === 'aggressive')

  // Score: Safe = 100%, Moderate = 50%, Aggressive = 0%
  const totalScore = (safeChanges.length * 100) +
                     (moderateChanges.length * 50) +
                     (aggressiveChanges.length * 0)
  const score = totalScore / recentChanges.length

  if (aggressiveChanges.length > 0) {
    issues.push({
      severity: aggressiveChanges.length > 2 ? 'critical' : 'warning',
      factor: 'stability',
      message: `${aggressiveChanges.length} budget change${aggressiveChanges.length > 1 ? 's' : ''} exceeded 30%`,
      recommendation: 'Scale budgets by 15-20% per day max. Aggressive changes reset Andromeda learning.'
    })
  }

  if (moderateChanges.length > 0 && aggressiveChanges.length === 0) {
    issues.push({
      severity: 'warning',
      factor: 'stability',
      message: `${moderateChanges.length} budget change${moderateChanges.length > 1 ? 's' : ''} between 20-30%`,
      recommendation: 'Aim for 15-20% scaling per day for optimal Andromeda performance.'
    })
  }

  return {
    score: Math.round(score),
    weight: WEIGHTS.stability,
    details: aggressiveChanges.length === 0 && moderateChanges.length === 0
      ? 'All budget changes within safe range (≤20%)'
      : `${safeChanges.length}/${recentChanges.length} changes were safe (≤20%)`
  }
}

/**
 * Get Tailwind text color class for a score
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-verdict-scale'
  if (score >= 70) return 'text-verdict-watch'
  if (score >= 50) return 'text-amber-500'
  return 'text-verdict-kill'
}

/**
 * Get Tailwind background color class for a score
 */
export function getScoreBgColor(score: number): string {
  if (score >= 90) return 'bg-verdict-scale'
  if (score >= 70) return 'bg-verdict-watch'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-verdict-kill'
}

/**
 * Get Tailwind background/text combo for label badges
 */
export function getScoreBadgeClasses(score: number): string {
  if (score >= 90) return 'bg-verdict-scale/20 text-verdict-scale'
  if (score >= 70) return 'bg-verdict-watch/20 text-verdict-watch'
  if (score >= 50) return 'bg-amber-500/20 text-amber-500'
  return 'bg-verdict-kill/20 text-verdict-kill'
}
