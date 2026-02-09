import { NextRequest, NextResponse } from 'next/server'

// Detect actual MIME type from base64 magic bytes (browser file.type can lie)
function detectMimeType(base64: string): string {
  const header = base64.slice(0, 20)
  if (header.startsWith('/9j/')) return 'image/jpeg'
  if (header.startsWith('iVBOR')) return 'image/png'
  if (header.startsWith('R0lGO')) return 'image/gif'
  if (header.startsWith('UklGR')) return 'image/webp'
  return 'image/jpeg' // safe default
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
  targetAudience?: string
  imageBase64?: string
  imageMimeType?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product } = body as { product: ProductInfo }

    if (!product || (!product.name && !product.description)) {
      return NextResponse.json(
        { error: 'Missing required field: product' },
        { status: 400 }
      )
    }

    // Build rich product context (skip "Custom Product" placeholder name)
    const hasRealName = product.name && product.name !== 'Custom Product'
    const productContext = [
      hasRealName ? `Name: ${product.name}` : null,
      product.brand && product.brand !== product.name ? `Brand: ${product.brand}` : null,
      product.description ? `Description: ${product.description}` : null,
      product.price ? `Price: ${product.currency || '$'}${product.price}` : null,
      product.category ? `Category: ${product.category}` : null,
      product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
      product.features?.length ? `Key Features:\n${product.features.map(f => `- ${f}`).join('\n')}` : null,
      product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
    ].filter(Boolean).join('\n')

    const hasImage = product.imageBase64 && product.imageMimeType

    const prompt = `You are an expert Facebook/Instagram ad copywriter. Create compelling ad copy variations for this product.

MY PRODUCT:
${productContext}
${hasImage ? '\nA product image is also attached — use what you see in the image to inform the ad copy (product appearance, colors, branding, use case, etc.).' : ''}

Generate 4 unique ad copy variations for this product. Each variation should use a different angle/hook to appeal to different customer motivations. Use the specific product details, features, and price point in the copy where relevant.

Advertising angles to consider:
- Social Proof / Testimonial style
- Problem-Solution (what pain does this solve?)
- FOMO / Urgency / Scarcity
- Benefit-focused (what transformation does the customer get?)
- Curiosity / Pattern interrupt
- Authority / Expert endorsement
- Emotional appeal
- Value proposition / ROI

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Social Proof", "FOMO/Urgency", "Problem-Solution", "Benefit-Focused")
2. headline: A compelling headline (under 40 characters)
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA)
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`

    // Build message content - text only or multimodal with image
    const messageContent: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

    if (hasImage) {
      const actualMime = detectMimeType(product.imageBase64!)
      if (actualMime !== product.imageMimeType) {
        console.log(`[GenerateFromProduct] MIME mismatch: browser said ${product.imageMimeType}, actual is ${actualMime}`)
      }
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: actualMime,
          data: product.imageBase64!,
        }
      })
    }

    messageContent.push({ type: 'text', text: prompt })

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
          { role: 'user', content: messageContent }
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
    console.error('Generate from product error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
