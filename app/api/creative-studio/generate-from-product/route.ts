import { NextRequest, NextResponse } from 'next/server'
import { buildProductAdCopyPrompt, buildProductContext } from '@/lib/prompts/ad-copy'

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
    const productContext = buildProductContext(product, { skipPlaceholderName: true })

    const hasImage = product.imageBase64 && product.imageMimeType

    const prompt = buildProductAdCopyPrompt({ productContext, hasImage: !!hasImage })

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
