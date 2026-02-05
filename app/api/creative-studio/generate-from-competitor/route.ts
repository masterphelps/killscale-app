import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

interface CompetitorAd {
  pageName: string
  bodies?: string[]
  headlines?: string[]
  descriptions?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { competitorAd, productName, productDescription } = body as {
      competitorAd: CompetitorAd
      productName: string
      productDescription?: string
    }

    if (!competitorAd || !productName) {
      return NextResponse.json(
        { error: 'Missing required fields: competitorAd, productName' },
        { status: 400 }
      )
    }

    const competitorCopy = [
      competitorAd.bodies?.[0],
      competitorAd.headlines?.[0],
      competitorAd.descriptions?.[0],
    ].filter(Boolean).join('\n\n')

    const prompt = `You are an expert Facebook/Instagram ad copywriter. Analyze this competitor ad and create new ad copy variations for a different product.

COMPETITOR AD (from ${competitorAd.pageName}):
${competitorCopy}

MY PRODUCT:
Name: ${productName}
${productDescription ? `Description: ${productDescription}` : ''}

Generate 4 unique ad copy variations inspired by the competitor's approach but for MY product. Each variation should use a different angle/hook.

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Social Proof", "FOMO/Urgency", "Problem-Solution", "Testimonial Style")
2. headline: A compelling headline (under 40 characters)
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA)
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse the JSON response
    let ads
    try {
      // Try to extract JSON from the response (in case there's any wrapper text)
      const jsonMatch = content.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        ads = JSON.parse(jsonMatch[0])
      } else {
        ads = JSON.parse(content.text)
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.text)
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
