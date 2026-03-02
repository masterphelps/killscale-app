/**
 * Oracle v2 — Client-Side Tool Executor
 *
 * Maps OracleToolName to the correct API endpoint, executes the call,
 * and returns a structured ToolExecutionResult for both the UI (contextCards)
 * and the model (modelSummary sent back as assistant context).
 */

import type { OracleToolName, OracleContextCardType } from '@/components/creative-studio/oracle-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecutionResult {
  success: boolean
  cardType: OracleContextCardType
  data: Record<string, unknown>
  /** Short text sent back to the model as context for subsequent turns */
  modelSummary: string
  /** Present when the tool produced an asset (image, video, overlay, ad-copy) */
  generatedAsset?: {
    type: 'image' | 'video' | 'overlay' | 'ad-copy'
    url?: string
    mediaHash?: string
    creditCost: number
  }
}

export interface ToolContext {
  userId: string
  adAccountId: string
  productInfo?: Record<string, unknown>
  productImages?: Array<{ base64: string; mimeType: string }>
  userMedia?: Array<{ url: string; mimeType: string; name: string; type: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(message: string): ToolExecutionResult {
  return {
    success: false,
    cardType: 'tool-error',
    data: { error: message },
    modelSummary: `Error: ${message}`,
  }
}

function truncate(str: string | undefined | null, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}

// ---------------------------------------------------------------------------
// Individual executors
// ---------------------------------------------------------------------------

async function executeAnalyzeProduct(
  inputs: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const url = inputs.url as string | undefined
  if (!url) return errorResult('Missing product URL')

  const res = await fetch('/api/creative-studio/analyze-product-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Product analysis failed (${res.status})`)
  }

  const data = await res.json()
  const product = data.product || {}
  const productImages: unknown[] = data.productImages || []

  const features = Array.isArray(product.features) ? product.features : []
  const descSnippet = truncate(product.description, 200)

  return {
    success: true,
    cardType: 'product',
    data: { product, productImages },
    modelSummary: [
      `Product analyzed: "${product.name || 'Unknown'}"`,
      product.price ? `Price: ${product.price}` : null,
      features.length > 0 ? `${features.length} features extracted` : null,
      productImages.length > 0 ? `${productImages.length} product image(s) downloaded` : null,
      descSnippet ? `Description: ${descSnippet}` : null,
    ].filter(Boolean).join('. '),
  }
}

async function executeAnalyzeVideo(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const mediaHash = inputs.mediaHash as string | undefined
  if (!mediaHash) return errorResult('Missing mediaHash for video analysis')

  const res = await fetch('/api/creative-studio/analyze-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: context.userId,
      adAccountId: context.adAccountId,
      mediaHash,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Video analysis failed (${res.status})`)
  }

  const data = await res.json()
  const analysis = data.analysis || {}
  const funnelScores = analysis.funnelScores || {}
  const transcript = truncate(analysis.transcript || data.transcript, 300)

  return {
    success: true,
    cardType: 'video-analysis',
    data: {
      analysis,
      scriptSuggestions: data.scriptSuggestions,
      cached: data.cached,
    },
    modelSummary: [
      'Video analysis complete.',
      transcript ? `Transcript: "${transcript}"` : 'No speech detected.',
      `Funnel scores — Hook: ${funnelScores.hook ?? 'N/A'}, Hold: ${funnelScores.hold ?? 'N/A'}, Click: ${funnelScores.click ?? 'N/A'}, Convert: ${funnelScores.convert ?? 'N/A'}.`,
      data.scriptSuggestions?.length ? `${data.scriptSuggestions.length} script rewrite suggestion(s).` : null,
    ].filter(Boolean).join(' '),
  }
}

async function executeGenerateOverlay(
  inputs: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const videoUrl = inputs.videoUrl as string | undefined
  const instruction = (inputs.instruction as string) || 'Generate captions'
  const durationSeconds = (inputs.durationSeconds as number) || 10

  if (!videoUrl) return errorResult('Missing videoUrl for overlay generation')

  const res = await fetch('/api/creative-studio/generate-overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, instruction, durationSeconds }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Overlay generation failed (${res.status})`)
  }

  const data = await res.json()
  const overlayConfig = data.overlayConfig || {}
  const captionCount = Array.isArray(overlayConfig.captions) ? overlayConfig.captions.length : 0
  const hookText = overlayConfig.hook?.line1 || overlayConfig.hook?.line2 || ''
  const ctaText = overlayConfig.cta?.text || ''
  const style = overlayConfig.style || 'default'

  return {
    success: true,
    cardType: 'overlay-preview',
    data: { overlayConfig, transcript: data.transcript },
    modelSummary: [
      'Overlay generated.',
      hookText ? `Hook: "${truncate(hookText, 60)}"` : null,
      captionCount > 0 ? `${captionCount} caption(s).` : null,
      ctaText ? `CTA: "${ctaText}"` : null,
      `Style: ${style}.`,
    ].filter(Boolean).join(' '),
    generatedAsset: {
      type: 'overlay',
      creditCost: 0,
    },
  }
}

async function executeGenerateAdCopy(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const product = (inputs.product as Record<string, unknown>) || context.productInfo || {}
  if (!product.name) return errorResult('Missing product info for ad copy generation')

  const competitorAd = (inputs.competitorAd as Record<string, unknown>) || {
    pageName: product.name as string,
  }
  const isRefresh = !inputs.competitorAd

  const res = await fetch('/api/creative-studio/generate-from-competitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product, competitorAd, isRefresh }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Ad copy generation failed (${res.status})`)
  }

  const data = await res.json()
  const ads: Array<Record<string, unknown>> = data.ads || []

  const summaryLines = ads.slice(0, 4).map(
    (ad, i) => `${i + 1}. "${truncate(ad.headline as string, 40)}" (${ad.angle || 'general'})`,
  )

  return {
    success: true,
    cardType: 'ad-copy',
    data: { ads },
    modelSummary: [
      `Generated ${ads.length} ad copy variation(s):`,
      ...summaryLines,
    ].join('\n'),
    generatedAsset: {
      type: 'ad-copy',
      creditCost: 0,
    },
  }
}

async function executeGenerateImage(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const adCopy = inputs.adCopy as Record<string, unknown> | undefined
  const product = (inputs.product as Record<string, unknown>) || context.productInfo || {}
  const style = (inputs.style as string) || 'lifestyle'
  const imagePrompt = inputs.imagePrompt as string | undefined
  const noTextOverlay = inputs.noTextOverlay as boolean | undefined

  if (!product.name) return errorResult('Missing product info for image generation')
  if (!adCopy && !noTextOverlay) return errorResult('Missing ad copy for image generation (or set noTextOverlay)')

  // Attach product image from context if available and not already on the product object
  const productWithImage = { ...product }
  if (!productWithImage.imageBase64 && context.productImages?.[0]) {
    productWithImage.imageBase64 = context.productImages[0].base64
    productWithImage.imageMimeType = context.productImages[0].mimeType
  }

  const res = await fetch('/api/creative-studio/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: context.userId,
      adCopy: adCopy || { headline: '', primaryText: '' },
      product: productWithImage,
      style,
      imagePrompt,
      noTextOverlay,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Image generation failed (${res.status})`)
  }

  const data = await res.json()
  const image = data.image || {}

  return {
    success: true,
    cardType: 'image-result',
    data: {
      image,
      model: data.model,
      style,
    },
    modelSummary: `Image generated successfully using ${data.model || 'Gemini'}. Style: ${style}.`,
    generatedAsset: {
      type: 'image',
      creditCost: 5,
    },
  }
}

async function executeGenerateVideo(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const prompt = inputs.prompt as string | undefined
  const videoStyle = (inputs.videoStyle as string) || 'cinematic'
  const durationSeconds = (inputs.durationSeconds as number) || 8
  const productName = (inputs.productName as string) || (context.productInfo?.name as string) || ''

  if (!prompt) return errorResult('Missing prompt for video generation')

  // Collect product images from context (max 3)
  const productImages = context.productImages?.slice(0, 3) || []

  const res = await fetch('/api/creative-studio/generate-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: context.userId,
      adAccountId: context.adAccountId,
      prompt,
      videoStyle,
      durationSeconds,
      productImages,
      productName,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Video generation failed (${res.status})`)
  }

  const data = await res.json()
  const creditCost = (data.creditCost as number) || 50

  return {
    success: true,
    cardType: 'video-result',
    data: {
      jobId: data.jobId,
      status: data.status,
      creditCost,
      provider: data.provider,
      soraJobId: data.soraJobId,
    },
    modelSummary: `Video generation started (job ${data.jobId}). Provider: ${data.provider || 'veo'}. ${creditCost} credits used. Style: ${videoStyle}, duration: ${durationSeconds}s. Poll /api/creative-studio/video-status for progress.`,
    generatedAsset: {
      type: 'video',
      creditCost,
    },
  }
}

async function executeGenerateConcepts(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const product = (inputs.product as Record<string, unknown>) || context.productInfo || {}
  const count = (inputs.count as number) || 4
  const style = (inputs.style as string) || 'cinematic'
  const directionPrompt = inputs.directionPrompt as string | undefined

  if (!product.name) return errorResult('Missing product info for concept generation')

  const res = await fetch('/api/creative-studio/generate-ad-concepts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product, count, style, directionPrompt }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Concept generation failed (${res.status})`)
  }

  const data = await res.json()
  const concepts: Array<Record<string, unknown>> = data.concepts || []

  const summaryLines = concepts.map(
    (c, i) => `${i + 1}. "${truncate(c.title as string, 50)}" — ${c.angle || 'general'} (${c.estimatedDuration || 8}s)`,
  )

  return {
    success: true,
    cardType: 'concepts',
    data: { concepts },
    modelSummary: [
      `Generated ${concepts.length} video concept(s):`,
      ...summaryLines,
    ].join('\n'),
  }
}

async function executeDetectText(
  inputs: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const imageBase64 = inputs.imageBase64 as string | undefined
  const imageMimeType = (inputs.imageMimeType as string) || 'image/png'

  if (!imageBase64) return errorResult('Missing imageBase64 for text detection')

  const res = await fetch('/api/creative-studio/detect-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, imageMimeType }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Text detection failed (${res.status})`)
  }

  const data = await res.json()
  const textBlocks: Array<Record<string, string>> = data.textBlocks || []

  const summaryLines = textBlocks.map(
    (block) => `- [${block.role}] "${truncate(block.text, 60)}"`,
  )

  return {
    success: true,
    cardType: 'product', // text detection re-uses product card for display
    data: { textBlocks },
    modelSummary: textBlocks.length > 0
      ? [`Detected ${textBlocks.length} text block(s):`, ...summaryLines].join('\n')
      : 'No text detected in the image.',
  }
}

function handleRequestMedia(
  inputs: Record<string, unknown>,
): ToolExecutionResult {
  // request_media is a special tool — it does not call an API.
  // It signals the UI to open a media picker. The result is returned
  // once the user attaches files, so we return a placeholder here.
  const mediaType = (inputs.type as string) || 'any'
  const reason = (inputs.reason as string) || 'Media requested'
  const multiple = (inputs.multiple as boolean) || false

  return {
    success: true,
    cardType: 'media-attached',
    data: {
      awaiting: true,
      mediaType,
      reason,
      multiple,
    },
    modelSummary: `Requesting user to attach ${multiple ? 'one or more' : 'a'} ${mediaType} file(s): ${reason}`,
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function executeOracleTool(
  tool: OracleToolName,
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    switch (tool) {
      case 'analyze_product':
        return await executeAnalyzeProduct(inputs)

      case 'analyze_video':
        return await executeAnalyzeVideo(inputs, context)

      case 'generate_overlay':
        return await executeGenerateOverlay(inputs)

      case 'generate_ad_copy':
        return await executeGenerateAdCopy(inputs, context)

      case 'generate_image':
        return await executeGenerateImage(inputs, context)

      case 'generate_video':
        return await executeGenerateVideo(inputs, context)

      case 'generate_concepts':
        return await executeGenerateConcepts(inputs, context)

      case 'detect_text':
        return await executeDetectText(inputs)

      case 'request_media':
        return handleRequestMedia(inputs)

      default:
        return errorResult(`Unknown tool: ${tool}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed'
    return errorResult(message)
  }
}
