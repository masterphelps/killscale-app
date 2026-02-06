import { NextRequest, NextResponse } from 'next/server'

async function downloadImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      console.error('[Analyze] Failed to download image:', response.status)
      return null
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return {
      base64,
      mimeType: contentType.split(';')[0], // Remove charset if present
    }
  } catch (err) {
    console.error('[Analyze] Error downloading image:', err)
    return null
  }
}

function resolveImageUrl(imageUrl: string, pageUrl: string): string {
  // If already absolute URL, return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }

  // If protocol-relative URL
  if (imageUrl.startsWith('//')) {
    return 'https:' + imageUrl
  }

  // Resolve relative URL against page URL
  try {
    return new URL(imageUrl, pageUrl).href
  } catch {
    return imageUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
    }

    // Fetch the product page
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!pageRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 400 })
    }

    const html = await pageRes.text()

    // Use Claude to extract product info AND image URL from the HTML
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Analyze this product page HTML and extract the key product information.

URL: ${url}

HTML (truncated):
${html.slice(0, 15000)}

Extract and return a JSON object with these fields:
- name: Product name
- description: Brief product description (1-2 sentences)
- price: Price if visible (or null)
- currency: Currency code (USD, EUR, etc.) or null
- features: Array of 3-5 key features/benefits
- brand: Brand name if different from product name
- category: Product category (e.g., "fitness equipment", "skincare", "clothing")
- uniqueSellingPoint: The main thing that makes this product special
- imageUrl: The main product image URL (look for og:image meta tag, or the primary product image in the HTML - return the highest quality image URL you can find)

Respond ONLY with the JSON object, no other text.`
          }
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

    // Parse the JSON
    let productInfo
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        productInfo = JSON.parse(jsonMatch[0])
      } else {
        productInfo = JSON.parse(content)
      }
    } catch (parseError) {
      console.error('Failed to parse product info:', content)
      throw new Error('Failed to analyze product page')
    }

    // Download the product image if we found one
    if (productInfo.imageUrl) {
      const resolvedUrl = resolveImageUrl(productInfo.imageUrl, url)
      console.log('[Analyze] Downloading product image from:', resolvedUrl)

      const imageData = await downloadImageAsBase64(resolvedUrl)
      if (imageData) {
        productInfo.imageBase64 = imageData.base64
        productInfo.imageMimeType = imageData.mimeType
        console.log('[Analyze] Product image downloaded successfully, size:', Math.round(imageData.base64.length / 1024), 'KB')
      } else {
        console.log('[Analyze] Failed to download product image')
      }
    }

    return NextResponse.json({ product: productInfo })

  } catch (err) {
    console.error('Analyze product URL error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
