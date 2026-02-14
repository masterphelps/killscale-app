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

    // Skip tiny images (likely icons/tracking pixels) - minimum 2KB
    if (arrayBuffer.byteLength < 2048) return null

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

function extractImageUrls(html: string): string[] {
  const urls: string[] = []
  // Match <img> tags and extract src
  const imgRegex = /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    // Skip data URIs, tracking pixels, tiny placeholder images
    if (src.startsWith('data:')) continue
    if (src.includes('pixel') || src.includes('tracking') || src.includes('spacer')) continue
    if (src.includes('.gif') && src.includes('1x1')) continue
    urls.push(src)
  }
  // Also extract from og:image meta tags
  const ogRegex = /<meta\s+[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*/gi
  while ((match = ogRegex.exec(html)) !== null) {
    if (!urls.includes(match[1])) urls.unshift(match[1]) // Priority — prepend
  }
  // Reverse order og:image check
  const ogRegex2 = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*/gi
  while ((match = ogRegex2.exec(html)) !== null) {
    if (!urls.includes(match[1])) urls.unshift(match[1])
  }
  return urls
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

    // Extract image URLs from HTML before stripping tags
    const pageImageUrls = extractImageUrls(html)

    // Extract clean text content and meta tags from HTML
    const { metaTags, textContent } = extractCleanContent(html)
    // 50K chars of clean text covers most full pages
    const truncatedText = textContent.slice(0, 50000)

    // Build image context for Claude
    const imageContext = pageImageUrls.length > 0
      ? `\n\nIMAGES FOUND ON PAGE (${pageImageUrls.length} total, showing first 20):\n${pageImageUrls.slice(0, 20).map((u, i) => `${i + 1}. ${u}`).join('\n')}`
      : ''

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
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: `Analyze this product/service page and extract comprehensive information. Read the ENTIRE page content carefully — features, benefits, and details may appear throughout.

URL: ${url}

META TAGS:
${metaTags}

PAGE CONTENT:
${truncatedText}${imageContext}

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
- images: Array of up to 8 product-relevant image objects. Each: { "url": "full URL", "description": "what the image shows", "type": "product|screenshot|lifestyle|hero|packaging" }. Focus on product photos, screenshots, hero images. SKIP icons, logos, decorative backgrounds, and tiny UI elements. From the IMAGES FOUND ON PAGE list, identify which ones are product-relevant.
- benefits: Array of up to 5 customer-facing benefits (phrased as outcomes the customer gets, e.g., "Launch campaigns in under 60 seconds")
- painPoints: Array of up to 3 problems this product solves (phrased as frustrations, e.g., "Hours wasted in Ads Manager")
- testimonialPoints: Array of 3 lines that a satisfied customer would say about this product (authentic UGC style, first person, e.g., "I used to spend hours in Ads Manager. KillScale cut that to under a minute.")
- keyMessages: Array of 3 short punchy hook lines for ads (scroll-stopping, e.g., "Make ads like a pro, scale them like a boss")
- motionOpportunities: Array of up to 5 ways this product could be shown in motion or physical interaction (e.g., "Pouring creates a satisfying cascade", "Snapping the lid shut with a confident click", "Fabric draping and flowing over surfaces"). Think about what's physically INTERESTING about this product — what movements, textures, transformations, or interactions would look satisfying on camera.
- sensoryDetails: Array of up to 5 tactile/visual/sensory qualities (e.g., "Matte black finish with brushed metal accents", "Thick, creamy texture that holds its shape", "Translucent amber color that catches light"). Focus on textures, materials, colors, weight, sound.
- visualHooks: Array of up to 3 visual concepts that would stop someone scrolling (e.g., "Before/after transformation", "Satisfying pour in slow motion", "Macro shot revealing hidden detail"). Think about what would make someone pause their thumb.

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

    // Download the primary product image (backward compat)
    if (productInfo.imageUrl) {
      const resolvedUrl = resolveImageUrl(productInfo.imageUrl, url)
      console.log('[Analyze] Claude extracted imageUrl:', productInfo.imageUrl)
      console.log('[Analyze] Resolved to:', resolvedUrl)

      const imageData = await downloadImageAsBase64(resolvedUrl)
      if (imageData) {
        productInfo.imageBase64 = imageData.base64
        productInfo.imageMimeType = imageData.mimeType
        console.log('[Analyze] Product image downloaded successfully, size:', Math.round(imageData.base64.length / 1024), 'KB')
      } else {
        console.log('[Analyze] Failed to download product image from:', resolvedUrl)
      }
    } else {
      console.log('[Analyze] Claude did NOT extract an imageUrl from the page')
    }

    // Download multiple product images (up to 6, skip primary which is already downloaded)
    const productImages: Array<{ base64: string; mimeType: string; description: string; type: string }> = []

    if (productInfo.images && Array.isArray(productInfo.images)) {
      const imagesToDownload = productInfo.images.slice(0, 6)
      console.log(`[Analyze] Downloading ${imagesToDownload.length} product images...`)

      const downloadPromises = imagesToDownload.map(async (img: { url: string; description: string; type: string }) => {
        const resolvedUrl = resolveImageUrl(img.url, url)
        const imageData = await downloadImageAsBase64(resolvedUrl)
        if (imageData) {
          return {
            base64: imageData.base64,
            mimeType: imageData.mimeType,
            description: img.description || '',
            type: img.type || 'product',
          }
        }
        return null
      })

      const results = await Promise.all(downloadPromises)
      for (const r of results) {
        if (r) productImages.push(r)
      }
      console.log(`[Analyze] Successfully downloaded ${productImages.length} product images`)
    }

    // If primary image was downloaded but not in productImages, add it as first
    if (productInfo.imageBase64 && productImages.length === 0) {
      productImages.push({
        base64: productInfo.imageBase64,
        mimeType: productInfo.imageMimeType || 'image/jpeg',
        description: productInfo.name || 'Primary product image',
        type: 'product',
      })
    } else if (productInfo.imageBase64 && productImages.length > 0) {
      // Check if primary image is already in the list (by checking first few chars of base64)
      const primaryPrefix = productInfo.imageBase64.slice(0, 100)
      const alreadyIncluded = productImages.some(img => img.base64.slice(0, 100) === primaryPrefix)
      if (!alreadyIncluded) {
        productImages.unshift({
          base64: productInfo.imageBase64,
          mimeType: productInfo.imageMimeType || 'image/jpeg',
          description: productInfo.name || 'Primary product image',
          type: 'product',
        })
      }
    }

    // Clean up — don't send the raw image URL list in the response
    delete productInfo.images

    return NextResponse.json({
      product: productInfo,
      productImages,
    })

  } catch (err) {
    console.error('Analyze product URL error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
