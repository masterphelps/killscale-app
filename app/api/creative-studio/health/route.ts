import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fatigue status levels
type FatigueStatus = 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'
type HealthStatus = 'excellent' | 'good' | 'warning' | 'critical'

// Calculate fatigue score based on performance decline metrics
function calculateFatigueScore(
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

export interface CreativeHealthScore {
  score: number // 0-100
  status: HealthStatus
  factors: {
    diversity: { score: number; detail: string }
    fatigue: { score: number; detail: string }
    winnerHealth: { score: number; detail: string }
    freshPipeline: { score: number; detail: string }
  }
  recommendations: string[]
  stats: {
    totalCreatives: number
    totalMedia: number
    activeAds: number
    fatigueBreakdown: Record<FatigueStatus, number>
  }
}

// GET - Calculate overall Creative Health Score for an ad account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters: userId and adAccountId' }, { status: 400 })
    }

    // Date filtering - last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const startDate = thirtyDaysAgo.toISOString().split('T')[0]

    // Get ad_data directly (no views) with date filter
    const { data: rawData, error: dataError } = await supabase
      .from('ad_data')
      .select('creative_id, ad_id, media_hash, media_type, date_start, date_end, spend, revenue, impressions, clicks')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .gte('date_start', startDate)

    if (dataError) {
      console.error('Error fetching ad data:', dataError)
      return NextResponse.json({ error: 'Failed to fetch ad data' }, { status: 500 })
    }

    // Aggregate creatives from raw data
    const creativeMap = new Map<string, { spend: number; roas: number; first_date: string; last_date: string; revenue: number }>()
    const mediaSet = new Set<string>()

    for (const row of rawData || []) {
      if (row.creative_id) {
        const existing = creativeMap.get(row.creative_id)
        const spend = parseFloat(row.spend) || 0
        const revenue = parseFloat(row.revenue) || 0
        if (existing) {
          existing.spend += spend
          existing.revenue += revenue
          existing.roas = existing.spend > 0 ? existing.revenue / existing.spend : 0
          if (row.date_start < existing.first_date) existing.first_date = row.date_start
          if (row.date_end > existing.last_date) existing.last_date = row.date_end
        } else {
          creativeMap.set(row.creative_id, {
            spend,
            revenue,
            roas: spend > 0 ? revenue / spend : 0,
            first_date: row.date_start,
            last_date: row.date_end || row.date_start
          })
        }
      }
      if (row.media_hash) {
        mediaSet.add(row.media_hash)
      }
    }

    const creatives = Array.from(creativeMap.entries()).map(([creative_id, data]) => ({
      creative_id,
      ...data
    }))
    const mediaItems = Array.from(mediaSet)
    const dailyData = rawData

    // Build daily metrics by creative_id
    const dailyByCreative = new Map<string, Array<{
      date: string
      spend: number
      revenue: number
      impressions: number
      clicks: number
    }>>()

    if (dailyData) {
      for (const row of dailyData) {
        if (!row.creative_id) continue
        if (!dailyByCreative.has(row.creative_id)) {
          dailyByCreative.set(row.creative_id, [])
        }
        dailyByCreative.get(row.creative_id)!.push({
          date: row.date_start,
          spend: parseFloat(row.spend) || 0,
          revenue: parseFloat(row.revenue) || 0,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0
        })
      }
    }

    // Calculate fatigue for each creative
    interface CreativeWithFatigue {
      creativeId: string
      spend: number
      roas: number
      firstDate: string
      lastDate: string
      fatigueScore: number
      fatigueStatus: FatigueStatus
      daysActive: number
    }

    const creativesWithFatigue: CreativeWithFatigue[] = (creatives || []).map(creative => {
      const creativeId = creative.creative_id
      const firstDate = new Date(creative.first_date)
      const lastDate = new Date(creative.last_date)
      const daysActive = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)))

      const dailyRows = dailyByCreative.get(creativeId) || []
      dailyRows.sort((a, b) => a.date.localeCompare(b.date))

      let earlyRoas = 0, recentRoas = 0
      let earlyCtr = 0, recentCtr = 0
      let earlyCpm = 0, recentCpm = 0

      if (dailyRows.length >= 7) {
        const earlyDays = dailyRows.slice(0, Math.min(7, Math.floor(dailyRows.length / 2)))
        const recentDays = dailyRows.slice(-7)

        const earlyTotals = earlyDays.reduce((acc, d) => ({
          spend: acc.spend + d.spend,
          revenue: acc.revenue + d.revenue,
          impressions: acc.impressions + d.impressions,
          clicks: acc.clicks + d.clicks
        }), { spend: 0, revenue: 0, impressions: 0, clicks: 0 })

        const recentTotals = recentDays.reduce((acc, d) => ({
          spend: acc.spend + d.spend,
          revenue: acc.revenue + d.revenue,
          impressions: acc.impressions + d.impressions,
          clicks: acc.clicks + d.clicks
        }), { spend: 0, revenue: 0, impressions: 0, clicks: 0 })

        earlyRoas = earlyTotals.spend > 0 ? earlyTotals.revenue / earlyTotals.spend : 0
        recentRoas = recentTotals.spend > 0 ? recentTotals.revenue / recentTotals.spend : 0
        earlyCtr = earlyTotals.impressions > 0 ? (earlyTotals.clicks / earlyTotals.impressions) * 100 : 0
        recentCtr = recentTotals.impressions > 0 ? (recentTotals.clicks / recentTotals.impressions) * 100 : 0
        earlyCpm = earlyTotals.impressions > 0 ? (earlyTotals.spend / earlyTotals.impressions) * 1000 : 0
        recentCpm = recentTotals.impressions > 0 ? (recentTotals.spend / recentTotals.impressions) * 1000 : 0
      }

      const { score: fatigueScore, status: fatigueStatus } = calculateFatigueScore(
        earlyRoas, recentRoas, earlyCtr, recentCtr, earlyCpm, recentCpm, daysActive
      )

      return {
        creativeId,
        spend: creative.spend || 0,
        roas: creative.roas || 0,
        firstDate: creative.first_date,
        lastDate: creative.last_date,
        fatigueScore,
        fatigueStatus,
        daysActive
      }
    })

    // Calculate health score factors
    const totalCreatives = creativesWithFatigue.length
    const totalMedia = mediaItems.length
    const totalAds = creativesWithFatigue.reduce((sum, c) => sum + (c.spend > 0 ? 1 : 0), 0)

    // 1. DIVERSITY (25% weight) - Unique media vs total ads
    // Good diversity = many unique media assets being tested
    const diversityRatio = totalAds > 0 ? totalMedia / totalAds : 0
    // 0.5 ratio = 50 score, 1.0 ratio = 100 score
    const diversityScore = Math.min(100, diversityRatio * 100)
    const diversityDetail = totalMedia === 0
      ? 'No media assets tracked'
      : `${totalMedia} unique media assets across ${totalAds} active ads`

    // 2. FATIGUE (30% weight) - Average fatigue of active creatives
    // Lower fatigue = higher score
    const fatigueBreakdown: Record<FatigueStatus, number> = {
      fresh: 0,
      healthy: 0,
      warning: 0,
      fatiguing: 0,
      fatigued: 0
    }

    let totalFatigue = 0
    creativesWithFatigue.forEach(c => {
      fatigueBreakdown[c.fatigueStatus]++
      totalFatigue += c.fatigueScore
    })

    const avgFatigue = totalCreatives > 0 ? totalFatigue / totalCreatives : 0
    // Invert: low fatigue = high score
    const fatigueScore = Math.max(0, 100 - avgFatigue)
    const fatigueDetail = totalCreatives === 0
      ? 'No creatives to analyze'
      : `${fatigueBreakdown.fatigued + fatigueBreakdown.fatiguing} of ${totalCreatives} creatives showing fatigue`

    // 3. WINNER HEALTH (25% weight) - Top 5 performers' fatigue
    // Sort by spend to find "winners" (most invested in)
    const winners = [...creativesWithFatigue]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5)

    const winnerAvgFatigue = winners.length > 0
      ? winners.reduce((sum, w) => sum + w.fatigueScore, 0) / winners.length
      : 0
    const winnerHealthScore = Math.max(0, 100 - winnerAvgFatigue)
    const winnersFatiguing = winners.filter(w => w.fatigueStatus === 'fatiguing' || w.fatigueStatus === 'fatigued').length
    const winnerHealthDetail = winners.length === 0
      ? 'No top performers identified'
      : `${winnersFatiguing} of ${winners.length} top performers showing fatigue signs`

    // 4. FRESH PIPELINE (20% weight) - % creatives < 14 days old
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const freshCreatives = creativesWithFatigue.filter(c => {
      const firstDate = new Date(c.firstDate)
      return firstDate >= fourteenDaysAgo
    }).length

    const freshRatio = totalCreatives > 0 ? freshCreatives / totalCreatives : 0
    // Target: 20% fresh = 100 score
    const freshPipelineScore = Math.min(100, freshRatio * 500)
    const freshPipelineDetail = totalCreatives === 0
      ? 'No creatives to analyze'
      : `${freshCreatives} of ${totalCreatives} creatives added in last 14 days (${Math.round(freshRatio * 100)}%)`

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (diversityScore * 0.25) +
      (fatigueScore * 0.30) +
      (winnerHealthScore * 0.25) +
      (freshPipelineScore * 0.20)
    )

    // Determine status
    const status: HealthStatus = overallScore >= 80 ? 'excellent' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'warning' : 'critical'

    // Generate recommendations
    const recommendations: string[] = []

    if (diversityScore < 50) {
      recommendations.push('Low creative diversity: Test more unique media assets to find new winners')
    }

    if (fatigueBreakdown.fatigued > 0) {
      recommendations.push(`${fatigueBreakdown.fatigued} creative(s) are fatigued: Consider replacing with fresh content`)
    }

    if (fatigueBreakdown.fatiguing > 0) {
      recommendations.push(`${fatigueBreakdown.fatiguing} creative(s) showing fatigue: Prepare replacements before performance drops`)
    }

    if (winnersFatiguing > 0) {
      recommendations.push('Top performers showing fatigue: Prioritize creating variations of your best-performing media')
    }

    if (freshRatio < 0.1) {
      recommendations.push('Low fresh creative pipeline: Add new creatives regularly to maintain performance')
    }

    if (totalCreatives === 0) {
      recommendations.push('No creative data available: Sync your Meta account to start tracking creative performance')
    }

    if (recommendations.length === 0 && overallScore >= 80) {
      recommendations.push('Creative health is excellent! Keep monitoring for early fatigue signs')
    }

    const healthScore: CreativeHealthScore = {
      score: overallScore,
      status,
      factors: {
        diversity: { score: Math.round(diversityScore), detail: diversityDetail },
        fatigue: { score: Math.round(fatigueScore), detail: fatigueDetail },
        winnerHealth: { score: Math.round(winnerHealthScore), detail: winnerHealthDetail },
        freshPipeline: { score: Math.round(freshPipelineScore), detail: freshPipelineDetail }
      },
      recommendations,
      stats: {
        totalCreatives,
        totalMedia,
        activeAds: totalAds,
        fatigueBreakdown
      }
    }

    return NextResponse.json(healthScore)

  } catch (err) {
    console.error('Creative Studio health GET error:', err)
    return NextResponse.json({ error: 'Failed to calculate creative health score' }, { status: 500 })
  }
}
