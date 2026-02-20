import { NextRequest, NextResponse } from 'next/server'
import { buildProductAnalysisPrompt } from '@/lib/prompts/product-analysis'

async function downloadImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string; byteSize: number } | null> {
  try {
    // Try upgraded (full-res) URL first, fall back to original
    const upgradedUrl = upgradeToFullRes(imageUrl)
    let response = await fetch(upgradedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!response.ok && upgradedUrl !== imageUrl) {
      // Full-res URL 404'd — fall back to original
      response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
    }

    if (!response.ok) {
      console.error('[Analyze] Failed to download image:', response.status)
      return null
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()

    // Skip tiny images (likely icons/tracking pixels) - minimum 10KB
    if (arrayBuffer.byteLength < 10240) return null

    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return {
      base64,
      mimeType: contentType.split(';')[0],
      byteSize: arrayBuffer.byteLength,
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

function upgradeToFullRes(url: string): string {
  let upgraded = url

  // Shopify: strip _WIDTHx or _WIDTHxHEIGHT before extension
  // e.g., image_100x.jpg → image.jpg, image_200x200.jpg → image.jpg
  upgraded = upgraded.replace(/_\d+x\d*(\.[a-z]{3,4})/i, '$1')

  // WooCommerce: strip -WIDTHxHEIGHT before extension
  // e.g., image-150x150.jpg → image.jpg
  upgraded = upgraded.replace(/-\d+x\d+(\.[a-z]{3,4})/i, '$1')

  // Strip common thumbnail query params
  try {
    const u = new URL(upgraded)
    const stripParams = ['width', 'w', 'h', 'height', 'resize', 'size', 'fit', 'crop', 'quality', 'q']
    let changed = false
    for (const p of stripParams) {
      if (u.searchParams.has(p)) { u.searchParams.delete(p); changed = true }
    }
    if (changed) upgraded = u.toString()
  } catch {
    // Not a valid URL — skip query param stripping
  }

  return upgraded
}

function extractImageUrls(html: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const addUrl = (u: string) => {
    if (!u || seen.has(u)) return
    if (u.startsWith('data:')) return
    if (u.includes('pixel') || u.includes('tracking') || u.includes('spacer')) return
    if (u.includes('.gif') && u.includes('1x1')) return
    if (u.includes('.svg')) return // Skip SVG icons
    seen.add(u)
    urls.push(u)
  }

  let match

  // 1. JSON-LD structured data — often has the best product images
  const jsonLdRegex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(match[1])
      const extractLdImages = (obj: Record<string, unknown>) => {
        if (typeof obj.image === 'string') addUrl(obj.image)
        if (Array.isArray(obj.image)) obj.image.forEach((img: unknown) => { if (typeof img === 'string') addUrl(img); if (typeof img === 'object' && img && 'url' in img) addUrl((img as { url: string }).url) })
        if (typeof obj.image === 'object' && obj.image && 'url' in obj.image) addUrl((obj.image as { url: string }).url)
      }
      if (Array.isArray(ld)) ld.forEach((item) => extractLdImages(item))
      else extractLdImages(ld)
    } catch { /* invalid JSON-LD — skip */ }
  }

  // 2. og:image meta tags (high priority)
  const ogRegex = /<meta\s+[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*/gi
  while ((match = ogRegex.exec(html)) !== null) addUrl(match[1])
  const ogRegex2 = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*/gi
  while ((match = ogRegex2.exec(html)) !== null) addUrl(match[1])

  // 3. <img> tags — src, data-src, data-lazy-src, data-zoom-image, data-large, srcset
  const imgTagRegex = /<img\s+[^>]*>/gi
  while ((match = imgTagRegex.exec(html)) !== null) {
    const tag = match[0]

    // data-zoom-image / data-large (zoom gallery — usually highest res)
    const zoomMatch = tag.match(/data-(?:zoom-image|large|full|highres)\s*=\s*["']([^"']+)["']/i)
    if (zoomMatch) addUrl(zoomMatch[1])

    // srcset — pick the largest
    const srcsetMatch = tag.match(/srcset\s*=\s*["']([^"']+)["']/i)
    if (srcsetMatch) {
      const candidates = srcsetMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      let bestUrl = '', bestWidth = 0
      for (const candidate of candidates) {
        const parts = candidate.split(/\s+/)
        const cUrl = parts[0]
        const descriptor = parts[1] || ''
        const w = parseInt(descriptor) || 0
        if (w > bestWidth) { bestWidth = w; bestUrl = cUrl }
      }
      if (bestUrl) addUrl(bestUrl)
      else if (candidates.length > 0) addUrl(candidates[candidates.length - 1].split(/\s+/)[0]) // last = usually largest
    }

    // data-src / data-lazy-src (lazy-loaded images)
    const lazySrcMatch = tag.match(/data-(?:lazy-)?src\s*=\s*["']([^"']+)["']/i)
    if (lazySrcMatch && !lazySrcMatch[1].startsWith('data:')) addUrl(lazySrcMatch[1])

    // Regular src
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i)
    if (srcMatch && !srcMatch[1].startsWith('data:')) addUrl(srcMatch[1])
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
            content: buildProductAnalysisPrompt(url, metaTags, truncatedText, imageContext)
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
        console.log('[Analyze] Product image downloaded:', Math.round(imageData.byteSize / 1024), 'KB')
      } else {
        console.log('[Analyze] Failed to download product image from:', resolvedUrl)
      }
    } else {
      console.log('[Analyze] Claude did NOT extract an imageUrl from the page')
    }

    // Download multiple product images (up to 6, skip primary which is already downloaded)
    const productImages: Array<{ base64: string; mimeType: string; description: string; type: string; byteSize: number }> = []

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
            byteSize: imageData.byteSize,
          }
        }
        return null
      })

      const results = await Promise.all(downloadPromises)
      for (const r of results) {
        if (r) productImages.push(r)
      }
      // Sort by file size descending — largest (highest quality) first
      productImages.sort((a, b) => b.byteSize - a.byteSize)
      console.log(`[Analyze] Downloaded ${productImages.length} images, sizes:`, productImages.map(i => `${Math.round(i.byteSize / 1024)}KB`).join(', '))
    }

    // If primary image was downloaded but not in productImages, add it as first
    if (productInfo.imageBase64 && productImages.length === 0) {
      productImages.push({
        base64: productInfo.imageBase64,
        mimeType: productInfo.imageMimeType || 'image/jpeg',
        description: productInfo.name || 'Primary product image',
        type: 'product',
        byteSize: Math.round(productInfo.imageBase64.length * 0.75), // approximate from base64
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
          byteSize: Math.round(productInfo.imageBase64.length * 0.75),
        })
      }
    }

    // Clean up — don't send the raw image URL list or byteSize in the response
    delete productInfo.images
    const cleanedImages = productImages.map(({ byteSize: _bs, ...rest }) => rest)

    return NextResponse.json({
      product: productInfo,
      productImages: cleanedImages,
    })

  } catch (err) {
    console.error('Analyze product URL error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
