import { NextRequest, NextResponse } from 'next/server'
import {
  buildCompetitorAdCopyPrompt,
  buildRefreshAdCopyPrompt,
  buildProductContext,
  type ProductInfo,
} from '@/lib/prompts/ad-copy'

interface CompetitorAd {
  pageName: string
  bodies?: string[]
  headlines?: string[]
  descriptions?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { competitorAd, product, productName, productDescription, isRefresh } = body as {
      competitorAd: CompetitorAd
      product?: ProductInfo
      productName?: string
      productDescription?: string
      isRefresh?: boolean
    }

    // Support both new product object and legacy name/description
    const finalProduct = product || {
      name: productName || '',
      description: productDescription,
    }

    if (!competitorAd || !finalProduct.name) {
      return NextResponse.json(
        { error: 'Missing required fields: competitorAd, product' },
        { status: 400 }
      )
    }

    const competitorCopy = [
      competitorAd.bodies?.[0],
      competitorAd.headlines?.[0],
      competitorAd.descriptions?.[0],
    ].filter(Boolean).join('\n\n')

    // Build rich product context
    const productContext = buildProductContext(finalProduct)

    const prompt = isRefresh
      ? buildRefreshAdCopyPrompt({ competitorCopy, productContext })
      : buildCompetitorAdCopyPrompt({ competitorCopy, pageName: competitorAd.pageName, productContext })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: prompt }
        ],
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

    // Parse the JSON response
    let ads
    try {
      // Try to extract JSON from the response (in case there's any wrapper text)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        ads = JSON.parse(jsonMatch[0])
      } else {
        ads = JSON.parse(content)
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content)
      throw new Error('Failed to parse generated ads')
    }

    return NextResponse.json({ ads })

  } catch (err) {
    console.error('Generate from competitor error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
