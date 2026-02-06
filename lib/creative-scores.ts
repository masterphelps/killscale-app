// Creative Studio Score Computation
// Extracted from app/api/creative-studio/media/route.ts for shared use
// between server-side (media API) and client-side (Active Ads, Best Copy pages)

export type FatigueStatus = 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

// Calculate fatigue score based on performance decline metrics
export function calculateFatigueScore(
  earlyRoas: number,
  recentRoas: number,
  earlyCtr: number,
  recentCtr: number,
  earlyCpm: number,
  recentCpm: number,
  daysActive: number
): { score: number; status: FatigueStatus } {
  const roasDecline = earlyRoas > 0 ? Math.max(0, (earlyRoas - recentRoas) / earlyRoas * 100) : 0
  const ctrDecline = earlyCtr > 0 ? Math.max(0, (earlyCtr - recentCtr) / earlyCtr * 100) : 0
  const cpmIncrease = earlyCpm > 0 ? Math.max(0, (recentCpm - earlyCpm) / earlyCpm * 100) : 0
  const agePenalty = Math.min(100, daysActive * 2)

  const score = Math.min(100, (roasDecline * 0.4) + (ctrDecline * 0.25) + (cpmIncrease * 0.25) + (agePenalty * 0.1))

  const status: FatigueStatus = score <= 25 ? 'fresh' : score <= 50 ? 'healthy' : score <= 70 ? 'warning' : score <= 85 ? 'fatiguing' : 'fatigued'

  return { score, status }
}

// Calculate composite scores (min $50 spend threshold)
// Hook Score (video only): Thumbstop Rate benchmarked
// Hold Score (video only): 75% Hold Rate + 25% Completion Rate
// Click Score (all assets): 60% CTR + 40% CPC
// Convert Score (all assets): ROAS benchmarked
export function calculateCompositeScores(
  spend: number,
  roas: number,
  ctr: number,
  cpc: number,
  impressions: number,
  isVideo: boolean,
  thumbstopRate: number | null,
  holdRate: number | null,
  completionRate: number | null
): { hookScore: number | null; holdScore: number | null; clickScore: number | null; convertScore: number | null } {
  const hasEnoughSpend = spend >= 50
  let hookScore: number | null = null
  let holdScore: number | null = null
  let clickScore: number | null = null
  let convertScore: number | null = null

  if (!hasEnoughSpend) return { hookScore, holdScore, clickScore, convertScore }

  // Hook Score (video only): benchmarked on thumbstop rate (3s views / impressions)
  // Benchmarks: 30%+ excellent, 25-30% good, 15-25% average, <15% poor
  if (isVideo && thumbstopRate !== null) {
    if (thumbstopRate >= 30) hookScore = 75 + Math.min(25, (thumbstopRate - 30) / 20 * 25)
    else if (thumbstopRate >= 25) hookScore = 50 + (thumbstopRate - 25) / 5 * 25
    else if (thumbstopRate >= 15) hookScore = 25 + (thumbstopRate - 15) / 10 * 25
    else hookScore = Math.max(0, thumbstopRate / 15 * 25)
    hookScore = Math.round(hookScore)
  }

  // Hold Score (video only): 75% hold rate + 25% completion rate
  if (isVideo && holdRate !== null && completionRate !== null) {
    let holdComponent: number
    if (holdRate >= 40) holdComponent = 75 + Math.min(25, (holdRate - 40) / 20 * 25)
    else if (holdRate >= 30) holdComponent = 50 + (holdRate - 30) / 10 * 25
    else if (holdRate >= 20) holdComponent = 25 + (holdRate - 20) / 10 * 25
    else holdComponent = holdRate / 20 * 25

    let completionComponent: number
    if (completionRate >= 25) completionComponent = 100
    else if (completionRate >= 5) completionComponent = 50 + (completionRate - 5) / 20 * 50
    else completionComponent = completionRate / 5 * 50

    holdScore = Math.round(holdComponent * 0.75 + completionComponent * 0.25)
  }

  // Click Score (all): 60% CTR benchmark + 40% CPC benchmark
  if (impressions > 0) {
    let ctrComponent: number
    if (ctr >= 4) ctrComponent = 100
    else if (ctr >= 2.5) ctrComponent = 75 + (ctr - 2.5) / 1.5 * 25
    else if (ctr >= 1.5) ctrComponent = 50 + (ctr - 1.5) / 1 * 25
    else if (ctr >= 0.8) ctrComponent = 25 + (ctr - 0.8) / 0.7 * 25
    else ctrComponent = ctr / 0.8 * 25

    let cpcComponent: number
    if (cpc <= 0.30) cpcComponent = 100
    else if (cpc <= 0.80) cpcComponent = 75 + (0.80 - cpc) / 0.50 * 25
    else if (cpc <= 1.50) cpcComponent = 50 + (1.50 - cpc) / 0.70 * 25
    else if (cpc <= 3.00) cpcComponent = 25 + (3.00 - cpc) / 1.50 * 25
    else cpcComponent = Math.max(0, 25 - (cpc - 3.00) / 3.00 * 25)

    clickScore = Math.round(ctrComponent * 0.6 + cpcComponent * 0.4)
  }

  // Convert Score (all): ROAS-based
  if (roas > 0 || spend > 0) {
    if (roas >= 5) convertScore = 100
    else if (roas >= 3) convertScore = 75 + (roas - 3) / 2 * 25
    else if (roas >= 1.5) convertScore = 50 + (roas - 1.5) / 1.5 * 25
    else if (roas >= 1) convertScore = 25 + (roas - 1) / 0.5 * 25
    else convertScore = Math.max(0, roas / 1 * 25)
    convertScore = Math.round(convertScore)
  }

  return { hookScore, holdScore, clickScore, convertScore }
}
