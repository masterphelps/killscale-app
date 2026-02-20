import { NextRequest, NextResponse } from 'next/server'
import { ANDROMEDA_AI_SYSTEM_PROMPT } from '@/lib/prompts/recommendations'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ScoreData = {
  totalScore: number
  label: string
  factors: Record<string, { score: number; weight: number; details: string }>
  issues: { severity: string; factor: string; message: string; recommendation: string; entityName?: string }[]
}

export async function POST(request: NextRequest) {
  try {
    const { scoreData, chatHistory, userQuestion, isRefresh } = await request.json() as {
      scoreData: ScoreData
      chatHistory?: ChatMessage[]
      userQuestion?: string
      isRefresh?: boolean
    }

    if (!scoreData) {
      return NextResponse.json({ error: 'Missing score data' }, { status: 400 })
    }

    // Build context from score data
    const context = `
Account Andromeda Score: ${scoreData.totalScore}/100 (${scoreData.label})

Factor Breakdown:
${Object.entries(scoreData.factors).map(([key, factor]) =>
  `- ${key}: ${factor.score}/100 (weight: ${(factor.weight * 100).toFixed(0)}%) - ${factor.details}`
).join('\n')}

${scoreData.issues.length > 0 ? `
Issues Found:
${scoreData.issues.map(issue =>
  `- [${issue.severity.toUpperCase()}] ${issue.message}${issue.entityName ? ` (${issue.entityName})` : ''}
  Recommendation: ${issue.recommendation}`
).join('\n')}` : 'No issues found - account is well optimized!'}
`

    // Build messages array
    const messages: ChatMessage[] = []

    // For initial analysis, include context in first message
    if (!userQuestion) {
      const refreshContext = isRefresh
        ? `The user has made changes to their account and is requesting an updated analysis. Please review the current state and highlight any improvements or remaining issues:\n\n`
        : `Please analyze this Meta ad account's Andromeda optimization and provide your recommendations:\n\n`

      messages.push({
        role: 'user',
        content: `${refreshContext}${context}`
      })
    } else {
      // For follow-up questions, include context + chat history + new question
      messages.push({
        role: 'user',
        content: `Here is the account context:\n\n${context}`
      })
      messages.push({
        role: 'assistant',
        content: 'I understand the account structure. How can I help you optimize it?'
      })

      // Add chat history
      if (chatHistory && chatHistory.length > 0) {
        messages.push(...chatHistory)
      }

      // Add new question
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
        system: ANDROMEDA_AI_SYSTEM_PROMPT,
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

    return NextResponse.json({
      content: result.content[0].text,
      usage: result.usage
    })

  } catch (err) {
    console.error('Andromeda AI route error:', err)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
