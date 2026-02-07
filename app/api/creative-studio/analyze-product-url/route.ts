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

function extractCleanContent(html: string): { metaTags: string; textContent: string } {
  // Extract meta tags first (og:image, description, title) before stripping
  const metaTags: string[] = []
  const metaRegex = /<meta\s+[^>]*(?:property|name|content)\s*=\s*[^>]*>/gi
  let metaMatch
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metaTags.push(metaMatch[0])
  }
  // Also grab <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    metaTags.push(`<title>${titleMatch[1].trim()}</title>`)
  }

  let cleaned = html

  // Remove script, style, svg, noscript, iframe tags and their contents
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '')
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '')
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')

  // Remove all HTML tags but keep text content
  // Preserve line breaks for block elements
  cleaned = cleaned.replace(/<\/(div|p|h[1-6]|li|tr|section|article|header|footer|nav|main|aside|blockquote)>/gi, '\n')
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')

  // Decode common HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&')
  cleaned = cleaned.replace(/&lt;/g, '<')
  cleaned = cleaned.replace(/&gt;/g, '>')
  cleaned = cleaned.replace(/&quot;/g, '"')
  cleaned = cleaned.replace(/&#39;/g, "'")
  cleaned = cleaned.replace(/&nbsp;/g, ' ')

  // Collapse whitespace: multiple spaces to one, multiple newlines to two
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n')
  cleaned = cleaned.split('\n').map(line => line.trim()).filter(Boolean).join('\n')

  return {
    metaTags: metaTags.join('\n'),
    textContent: cleaned,
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

    // Extract clean text content and meta tags from HTML
    const { metaTags, textContent } = extractCleanContent(html)
    // 50K chars of clean text covers most full pages
    const truncatedText = textContent.slice(0, 50000)

    // Use Claude to extract product info AND image URL from the page content
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
        messages: [
          {
            role: 'user',
            content: `Analyze this product/service page and extract the key information. Read the ENTIRE page content carefully — features, benefits, and details may appear throughout.

URL: ${url}

META TAGS:
${metaTags}

PAGE CONTENT:
${truncatedText}

Extract and return a JSON object with these fields:
- name: Product/service name
- description: Brief product description (2-3 sentences covering what it does and who it's for)
- price: Price if visible (or null)
- currency: Currency code (USD, EUR, etc.) or null
- features: Array of up to 10 key features/benefits found anywhere on the page
- brand: Brand name if different from product name
- category: Product category (e.g., "fitness equipment", "SaaS", "skincare", "clothing")
- uniqueSellingPoint: The main thing that makes this product special
- targetAudience: Who this product is for (1 sentence)
- imageUrl: The main product image URL (from og:image meta tag or primary product image)

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
