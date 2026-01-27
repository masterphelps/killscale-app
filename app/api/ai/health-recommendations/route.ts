import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { HealthScoreResult } from '@/lib/health-score'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SYSTEM_PROMPT = `You are an expert Meta Ads performance consultant. You analyze health scores to provide actionable recommendations.

CRITICAL CONTEXT - Budget Allocation in Meta Ads:
- CBO (Campaign Budget Optimization): Budget lives at CAMPAIGN level. Meta automatically allocates to winning ads within the campaign.
- ABO (Ad Set Budget Optimization): Budget lives at AD SET level. Meta allocates to winning ads within each ad set.
- Individual ad performance is INFORMATIONAL ONLY. Never recommend killing/pausing individual ads.
- Having 3 "losing" ads and 1 winner in an ad set is FINE - Meta sends budget to the winner automatically.

Health Score Factors:
- Budget Efficiency (30 pts): % of budget on profitable campaigns/ad sets (where budget lives)
- Creative Health (25 pts): ROAS trend at budget entity level (CBO campaigns, ABO ad sets)
- Profitability (25 pts): Overall account ROAS vs thresholds
- Trend Direction (20 pts): ROAS trajectory vs previous period

Health Levels (at budget entity level):
- Healthy: ROAS change >= -5%
- Warning: ROAS change -5% to -15%
- Fatiguing: ROAS change -15% to -30%
- Fatigued: ROAS change < -30%

IMPORTANT RULES:
1. NEVER recommend killing/pausing individual ads - only campaigns (CBO) or ad sets (ABO)
2. Focus recommendations on WHERE THE BUDGET LIVES
3. Individual ad data is context only - don't make action items from it
4. If a campaign/ad set has good overall ROAS, individual ad ROAS doesn't matter

FOR INITIAL ANALYSIS:
Respond with JSON in this exact structure:
{
  "accountSummary": "2-3 sentence overview",
  "biggestOpportunity": { "summary": "...", "potential": "$X/day or X% improvement" },
  "biggestRisk": { "summary": "...", "impact": "$X/day wasted or X% decline" },
  "recommendations": [
    {
      "priority": 1,
      "action": "KILL" | "SCALE" | "WATCH" | "OPTIMIZE" | "CONSOLIDATE",
      "target": "Name of campaign or ad set (NOT individual ads)",
      "targetId": "The entity ID from the data (campaign_id or adset_id) - REQUIRED for KILL/SCALE actions",
      "targetType": "campaign" | "adset" | "account",
      "summary": "Brief action description",
      "reason": "Why this matters - reference budget-level metrics",
      "currentBudget": 0
    }
  ]
}

IMPORTANT for actionable recommendations:
- For KILL actions: Include the targetId so the user can pause directly from this view
- For SCALE actions: Include targetId AND currentBudget (daily budget in dollars) so user can scale
- Extract these from the budget entity data provided (entity IDs are in the context)

FOR FOLLOW-UP QUESTIONS:
Respond in plain text (NOT JSON). Be conversational, helpful, and reference the account data when relevant. Keep answers concise (2-4 sentences).`

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId, healthScore, chatHistory, userQuestion } = await request.json() as {
      userId: string
      healthScore: HealthScoreResult
      chatHistory?: ChatMessage[]
      userQuestion?: string
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!healthScore) {
      return NextResponse.json({ error: 'Missing health score data' }, { status: 400 })
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
    const stripeActive = stripeSub?.status === 'active'

    // Determine effective plan
    const effectivePlan = adminPlan || (stripeActive ? stripePlan : null) || 'free'
    const hasAccess = effectivePlan === 'pro' || effectivePlan === 'agency'

    console.log('[AI Recommendations] Plan check:', {
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
        { error: `AI recommendations require Pro plan. Your plan: ${effectivePlan}` },
        { status: 403 }
      )
    }

    // Build context from health score
    const context = buildHealthScoreContext(healthScore)

    // Build messages array
    const messages: ChatMessage[] = []

    if (!userQuestion) {
      // Initial analysis request
      messages.push({
        role: 'user',
        content: `Please analyze this Meta ad account's health score and provide your recommendations in JSON format:\n\n${context}`
      })
    } else {
      // Follow-up question
      messages.push({
        role: 'user',
        content: `Here is the account health context:\n\n${context}`
      })
      messages.push({
        role: 'assistant',
        content: 'I understand the account health status. What would you like to know?'
      })

      if (chatHistory && chatHistory.length > 0) {
        messages.push(...chatHistory)
      }

      messages.push({
        role: 'user',
        content: userQuestion
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages
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

    // For initial analysis, try to parse JSON
    if (!userQuestion) {
      try {
        // Extract JSON from response (in case there's text around it)
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          return NextResponse.json({
            recommendations: parsed,
            raw: content,
            usage: result.usage
          })
        }
      } catch {
        // If JSON parsing fails, return raw content
      }
    }

    return NextResponse.json({
      content,
      usage: result.usage
    })

  } catch (err) {
    console.error('Health recommendations AI error:', err)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}

function buildHealthScoreContext(score: HealthScoreResult): string {
  const lines: string[] = []

  lines.push(`Health Score: ${score.totalScore}/100 (${score.label})`)
  lines.push('')
  lines.push('Factor Breakdown:')

  for (const [key, factor] of Object.entries(score.factors)) {
    const percentage = Math.round((factor.score / factor.maxPoints) * 100)
    lines.push(`- ${formatFactorName(key)}: ${factor.score}/${factor.maxPoints} (${percentage}%) - ${factor.details}`)
  }

  lines.push('')
  lines.push(`Trend: ${score.trend.direction} (${score.trend.changePercent > 0 ? '+' : ''}${score.trend.changePercent.toFixed(1)}%)`)
  lines.push(`Current Period ROAS: ${score.trend.current.roas.toFixed(2)}x`)
  lines.push(`Previous Period ROAS: ${score.trend.previous.roas.toFixed(2)}x`)

  // Budget Entity Health (CBO campaigns & ABO ad sets)
  if (score.budgetEntities && score.budgetEntities.length > 0) {
    lines.push('')
    lines.push('BUDGET ENTITY HEALTH (where budget lives):')
    lines.push('(CBO = Campaign level budget, ABO = Ad Set level budget)')

    // Group by health level
    const fatigued = score.budgetEntities.filter(e => e.fatigueLevel === 'fatigued')
    const fatiguing = score.budgetEntities.filter(e => e.fatigueLevel === 'fatiguing')
    const warning = score.budgetEntities.filter(e => e.fatigueLevel === 'warning')
    const healthy = score.budgetEntities.filter(e => e.fatigueLevel === 'healthy')

    if (fatigued.length > 0) {
      lines.push(`\nDECLINING (${fatigued.length} - consider pausing/killing):`)
      fatigued.slice(0, 5).forEach(e => {
        const typeLabel = e.budgetType === 'CBO' ? 'Campaign' : 'Ad Set'
        const entityType = e.budgetType === 'CBO' ? 'campaign' : 'adset'
        lines.push(`- [${e.budgetType}] "${e.entityName}" (${typeLabel})`)
        lines.push(`  ID: ${e.entityId} (${entityType})`)
        lines.push(`  ROAS: ${e.roas.toFixed(2)}x, Change: ${e.roasChange > 0 ? '+' : ''}${e.roasChange.toFixed(0)}%`)
        lines.push(`  Spend: $${e.spend.toFixed(0)}, Daily Budget: $${e.dailyBudget?.toFixed(0) || 'N/A'}`)
        lines.push(`  └ ${e.ads.length} ads inside`)
      })
    }

    if (fatiguing.length > 0) {
      lines.push(`\nAT RISK (${fatiguing.length} - watch closely):`)
      fatiguing.slice(0, 3).forEach(e => {
        const typeLabel = e.budgetType === 'CBO' ? 'Campaign' : 'Ad Set'
        const entityType = e.budgetType === 'CBO' ? 'campaign' : 'adset'
        lines.push(`- [${e.budgetType}] "${e.entityName}" (${typeLabel})`)
        lines.push(`  ID: ${e.entityId} (${entityType})`)
        lines.push(`  ROAS: ${e.roas.toFixed(2)}x, Change: ${e.roasChange > 0 ? '+' : ''}${e.roasChange.toFixed(0)}%`)
        lines.push(`  Spend: $${e.spend.toFixed(0)}, Daily Budget: $${e.dailyBudget?.toFixed(0) || 'N/A'}`)
      })
    }

    if (warning.length > 0) {
      lines.push(`\nWARNING (${warning.length}):`)
      warning.slice(0, 3).forEach(e => {
        const entityType = e.budgetType === 'CBO' ? 'campaign' : 'adset'
        lines.push(`- [${e.budgetType}] "${e.entityName}"`)
        lines.push(`  ID: ${e.entityId} (${entityType})`)
        lines.push(`  ROAS: ${e.roas.toFixed(2)}x, Change: ${e.roasChange > 0 ? '+' : ''}${e.roasChange.toFixed(0)}%`)
      })
    }

    if (healthy.length > 0) {
      lines.push(`\nHEALTHY (${healthy.length} performing well - candidates for scaling):`)
      healthy.slice(0, 5).forEach(e => {
        const typeLabel = e.budgetType === 'CBO' ? 'Campaign' : 'Ad Set'
        const entityType = e.budgetType === 'CBO' ? 'campaign' : 'adset'
        lines.push(`- [${e.budgetType}] "${e.entityName}" (${typeLabel})`)
        lines.push(`  ID: ${e.entityId} (${entityType})`)
        lines.push(`  ROAS: ${e.roas.toFixed(2)}x, Change: ${e.roasChange > 0 ? '+' : ''}${e.roasChange.toFixed(0)}%`)
        lines.push(`  Spend: $${e.spend.toFixed(0)}, Daily Budget: $${e.dailyBudget?.toFixed(0) || 'N/A'}`)
      })
    }
  }

  return lines.join('\n')
}

function formatFactorName(key: string): string {
  const names: Record<string, string> = {
    budgetEfficiency: 'Budget Efficiency',
    creativeHealth: 'Creative Health',
    profitability: 'Profitability',
    trendDirection: 'Trend Direction'
  }
  return names[key] || key
}
