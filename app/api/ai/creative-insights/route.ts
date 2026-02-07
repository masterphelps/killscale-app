import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Request shape from frontend
interface PerformerData {
  name: string
  score: number
  spend: number
}

interface CreativeInsightsRequest {
  userId: string
  adAccountId: string
  summary: {
    totalAssets: number
    videoCount: number
    imageCount: number
    totalSpend: number
    totalRevenue: number
    avgScores: {
      hook: number | null
      hold: number | null
      click: number | null
      convert: number | null
    }
    scoreDistributions: {
      hook: number[]
      hold: number[]
      click: number[]
      convert: number[]
    }
    topPerformers: {
      hook: PerformerData[]
      hold: PerformerData[]
      click: PerformerData[]
      convert: PerformerData[]
    }
    bottomPerformers: {
      hook: PerformerData[]
      hold: PerformerData[]
      click: PerformerData[]
      convert: PerformerData[]
    }
    copyInsights: {
      totalVariations: number
      topHeadline: { text: string; roas: number; spend: number } | null
      topPrimaryText: { text: string; roas: number; spend: number } | null
    }
    activeAdsCount: number
    fatigueBreakdown: {
      healthy: number
      warning: number
      fatiguing: number
      fatigued: number
    }
  }
}

// Response shape
interface StageInsight {
  headline: string
  insight: string
  winner: string
  opportunity: string
  recommendation: string
}

interface CreativeInsightsResponse {
  overall: string
  stages: {
    hook: StageInsight
    hold: StageInsight
    click: StageInsight
    convert: StageInsight
  }
  biggestWin: { summary: string; impact: string }
  biggestOpportunity: { summary: string; potential: string }
}

const SYSTEM_PROMPT = `You are an expert Meta Ads creative strategist. You analyze creative performance data to provide actionable insights organized by funnel stage.

FUNNEL STAGES:
- Hook (video only): Captures initial attention. Measured by Thumbstop Rate (video views / impressions). Benchmark: 25%+ is good.
- Hold (video only): Keeps viewers watching. Measured by Hold Rate (ThruPlays / video views) and Completion Rate (P100 / impressions). Benchmarks: 30%+ hold, 15%+ completion.
- Click (all assets): Drives action. Measured by CTR and CPC. Benchmarks: 2%+ CTR, <$1 CPC.
- Convert (all assets): Generates revenue. Measured by ROAS. Benchmark: 2x+ ROAS.

SCORE INTERPRETATION (0-100):
- 75-100: Excellent (green)
- 50-74: Good (amber)
- 25-49: Below average (orange)
- 0-24: Poor (red)
- null: Insufficient data (<$50 spend)

SCORE DISTRIBUTIONS:
Each distribution is an array of 4 numbers representing counts of assets in score ranges: [0-24, 25-49, 50-74, 75-100]

RESPONSE FORMAT (JSON):
{
  "overall": "1-2 sentence account summary highlighting strongest and weakest funnel stages",
  "stages": {
    "hook": {
      "headline": "Brief status (e.g., 'Strong attention-grabbing')",
      "insight": "What the data shows about this stage performance",
      "winner": "Top performer callout with name and score",
      "opportunity": "Specific weakness or underperformer to address",
      "recommendation": "Concrete action to improve this stage"
    },
    "hold": { ... same structure ... },
    "click": { ... same structure ... },
    "convert": { ... same structure ... }
  },
  "biggestWin": {
    "summary": "What's working best across all stages",
    "impact": "Quantified benefit (e.g., '$X revenue' or 'X% above benchmark')"
  },
  "biggestOpportunity": {
    "summary": "Most impactful improvement area",
    "potential": "What could be gained (e.g., 'Could add $X/mo' or 'X% improvement potential')"
  }
}

RULES:
1. Be specific - reference actual asset names and scores from the data
2. Be actionable - every recommendation should be something the user can do today
3. For Hook/Hold, acknowledge when data is limited (video-only, requires $50+ spend)
4. If a funnel stage has no data, say "Insufficient data" and recommend getting more assets to this spend threshold
5. Keep insights concise - 1-2 sentences each
6. Focus on high-spend underperformers as the biggest opportunities
7. Never recommend pausing/killing individual ads - focus on creative testing recommendations`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreativeInsightsRequest
    const { userId, adAccountId, summary } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    if (!summary || summary.totalAssets === 0) {
      return NextResponse.json({ error: 'No creative data to analyze' }, { status: 400 })
    }

    // Check subscription - Pro only (check both Stripe and admin-granted)
    const [stripeResult, adminResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('admin_granted_subscriptions')
        .select('plan, expires_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
    ])

    const stripeSub = stripeResult.data
    const adminSub = adminResult.data

    // Check admin-granted subscription first (takes precedence)
    const now = new Date()
    const adminSubValid = adminSub && adminSub.is_active && new Date(adminSub.expires_at) > now
    const adminPlan = adminSubValid ? adminSub.plan?.toLowerCase() : null

    // Fall back to Stripe subscription
    const stripePlan = stripeSub?.plan?.toLowerCase()
    const stripeActive = stripeSub?.status === 'active' || stripeSub?.status === 'trialing'

    // Determine effective plan - any active subscription gets full access
    const effectivePlan = adminPlan || (stripeActive ? stripePlan : null) || 'free'
    const hasAccess = !!adminPlan || stripeActive

    console.log('[AI Creative Insights] Plan check:', {
      userId,
      stripePlan,
      stripeActive,
      adminPlan,
      adminSubValid,
      effectivePlan,
      hasAccess
    })

    if (!hasAccess) {
      return NextResponse.json(
        { error: `AI Creative Insights require an active subscription. Your plan: ${effectivePlan}` },
        { status: 403 }
      )
    }

    // Build context for Claude
    const context = buildContext(summary)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyze this creative portfolio and provide insights in JSON format:\n\n${context}`
          }
        ]
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Anthropic API error:', errorData)
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 500 })
    }

    const result = await response.json()

    if (!result.content || !result.content[0]) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    const content = result.content[0].text

    // Parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as CreativeInsightsResponse
        return NextResponse.json({
          insights: parsed,
          usage: result.usage
        })
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr)
    }

    // Return raw content if JSON parsing fails
    return NextResponse.json({
      raw: content,
      usage: result.usage
    })

  } catch (err) {
    console.error('Creative insights AI error:', err)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

function buildContext(summary: CreativeInsightsRequest['summary']): string {
  const lines: string[] = []

  lines.push('=== PORTFOLIO OVERVIEW ===')
  lines.push(`Total Assets: ${summary.totalAssets} (${summary.videoCount} videos, ${summary.imageCount} images)`)
  lines.push(`Total Spend: $${summary.totalSpend.toLocaleString()}`)
  lines.push(`Total Revenue: $${summary.totalRevenue.toLocaleString()}`)
  lines.push(`Overall ROAS: ${summary.totalSpend > 0 ? (summary.totalRevenue / summary.totalSpend).toFixed(2) : 0}x`)
  lines.push(`Active Ads: ${summary.activeAdsCount}`)
  lines.push('')

  lines.push('=== AVERAGE SCORES ===')
  lines.push(`Hook (video only): ${summary.avgScores.hook ?? 'N/A'}`)
  lines.push(`Hold (video only): ${summary.avgScores.hold ?? 'N/A'}`)
  lines.push(`Click (all assets): ${summary.avgScores.click ?? 'N/A'}`)
  lines.push(`Convert (all assets): ${summary.avgScores.convert ?? 'N/A'}`)
  lines.push('')

  lines.push('=== SCORE DISTRIBUTIONS [0-24, 25-49, 50-74, 75-100] ===')
  lines.push(`Hook: ${JSON.stringify(summary.scoreDistributions.hook)}`)
  lines.push(`Hold: ${JSON.stringify(summary.scoreDistributions.hold)}`)
  lines.push(`Click: ${JSON.stringify(summary.scoreDistributions.click)}`)
  lines.push(`Convert: ${JSON.stringify(summary.scoreDistributions.convert)}`)
  lines.push('')

  lines.push('=== TOP PERFORMERS (by score) ===')
  for (const stage of ['hook', 'hold', 'click', 'convert'] as const) {
    const performers = summary.topPerformers[stage]
    if (performers.length > 0) {
      lines.push(`${stage.charAt(0).toUpperCase() + stage.slice(1)}:`)
      performers.forEach((p, i) => {
        lines.push(`  ${i + 1}. "${p.name}" - Score: ${p.score}, Spend: $${p.spend.toFixed(0)}`)
      })
    } else {
      lines.push(`${stage.charAt(0).toUpperCase() + stage.slice(1)}: No data`)
    }
  }
  lines.push('')

  lines.push('=== BOTTOM PERFORMERS (high spend, low score - opportunities) ===')
  for (const stage of ['hook', 'hold', 'click', 'convert'] as const) {
    const performers = summary.bottomPerformers[stage]
    if (performers.length > 0) {
      lines.push(`${stage.charAt(0).toUpperCase() + stage.slice(1)}:`)
      performers.forEach((p, i) => {
        lines.push(`  ${i + 1}. "${p.name}" - Score: ${p.score}, Spend: $${p.spend.toFixed(0)}`)
      })
    } else {
      lines.push(`${stage.charAt(0).toUpperCase() + stage.slice(1)}: No underperformers found`)
    }
  }
  lines.push('')

  lines.push('=== COPY PERFORMANCE ===')
  lines.push(`Total Copy Variations: ${summary.copyInsights.totalVariations}`)
  if (summary.copyInsights.topHeadline) {
    lines.push(`Best Headline: "${summary.copyInsights.topHeadline.text}" - ROAS: ${summary.copyInsights.topHeadline.roas.toFixed(2)}x, Spend: $${summary.copyInsights.topHeadline.spend.toFixed(0)}`)
  }
  if (summary.copyInsights.topPrimaryText) {
    const truncated = summary.copyInsights.topPrimaryText.text.length > 100
      ? summary.copyInsights.topPrimaryText.text.slice(0, 100) + '...'
      : summary.copyInsights.topPrimaryText.text
    lines.push(`Best Primary Text: "${truncated}" - ROAS: ${summary.copyInsights.topPrimaryText.roas.toFixed(2)}x, Spend: $${summary.copyInsights.topPrimaryText.spend.toFixed(0)}`)
  }
  lines.push('')

  lines.push('=== FATIGUE STATUS ===')
  lines.push(`Healthy: ${summary.fatigueBreakdown.healthy}`)
  lines.push(`Warning: ${summary.fatigueBreakdown.warning}`)
  lines.push(`Fatiguing: ${summary.fatigueBreakdown.fatiguing}`)
  lines.push(`Fatigued: ${summary.fatigueBreakdown.fatigued}`)

  return lines.join('\n')
}
