import { NextRequest, NextResponse } from 'next/server'

interface CompetitorAd {
  pageName: string
  bodies?: string[]
  headlines?: string[]
  descriptions?: string[]
}

interface ProductInfo {
  name: string
  description?: string
  price?: string
  currency?: string
  features?: string[]
  brand?: string
  category?: string
  uniqueSellingPoint?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { competitorAd, product, productName, productDescription } = body as {
      competitorAd: CompetitorAd
      product?: ProductInfo
      productName?: string
      productDescription?: string
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
    const productContext = [
      `Name: ${finalProduct.name}`,
      finalProduct.brand && finalProduct.brand !== finalProduct.name ? `Brand: ${finalProduct.brand}` : null,
      finalProduct.description ? `Description: ${finalProduct.description}` : null,
      finalProduct.price ? `Price: ${finalProduct.currency || '$'}${finalProduct.price}` : null,
      finalProduct.category ? `Category: ${finalProduct.category}` : null,
      finalProduct.uniqueSellingPoint ? `Unique Selling Point: ${finalProduct.uniqueSellingPoint}` : null,
      finalProduct.features?.length ? `Key Features:\n${finalProduct.features.map(f => `- ${f}`).join('\n')}` : null,
    ].filter(Boolean).join('\n')

    const prompt = `You are an expert Facebook/Instagram ad copywriter. Analyze this competitor ad and create new ad copy variations for a different product.

COMPETITOR AD (from ${competitorAd.pageName}):
${competitorCopy}

MY PRODUCT:
${productContext}

Generate 4 unique ad copy variations inspired by the competitor's approach but for MY product. Each variation should use a different angle/hook. Use the specific product details, features, and price point in the copy where relevant.

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Social Proof", "FOMO/Urgency", "Problem-Solution", "Testimonial Style")
2. headline: A compelling headline (under 40 characters)
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA)
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`

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
