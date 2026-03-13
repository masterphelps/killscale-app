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
  videoAnalysis?: Record<string, unknown>
  analyzedVideoUrl?: string
  imageAnalysis?: Record<string, unknown>
  analyzedImageUrl?: string
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

/** Convert a URL to base64 via download-image endpoint, or return as-is if already base64 */
async function resolveToBase64(value: string): Promise<{ base64: string; mimeType: string } | null> {
  // Already base64 (no protocol prefix)
  if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('blob:')) {
    return { base64: value, mimeType: 'image/png' }
  }
  // URL — download and convert
  try {
    const res = await fetch('/api/creative-studio/download-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: value }),
    })
    if (res.ok) {
      const data = await res.json()
      return { base64: data.base64, mimeType: data.mimeType || 'image/png' }
    }
  } catch { /* download failed */ }
  return null
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
      `Funnel scores — Hook: ${analysis.hook?.score ?? 'N/A'}, Hold: ${analysis.hold?.score ?? 'N/A'}, Click: ${analysis.click?.score ?? 'N/A'}, Convert: ${analysis.convert?.score ?? 'N/A'}.`,
      data.scriptSuggestions?.length ? `${data.scriptSuggestions.length} script rewrite suggestion(s).` : null,
    ].filter(Boolean).join(' '),
  }
}

async function executeAnalyzeImage(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  let imageBase64 = inputs.imageBase64 as string | undefined
  let imageMimeType = (inputs.imageMimeType as string) || 'image/png'

  // Fallback: use first user-uploaded image from context
  if (!imageBase64) {
    const userImage = (context.userMedia || []).find(m => m.type === 'image')
    if (userImage?.url) {
      imageBase64 = userImage.url
    }
  }

  if (!imageBase64) return errorResult('Missing image for analysis. Please upload an image first.')

  // Handle data URLs
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      imageMimeType = match[1]
      imageBase64 = match[2]
    }
  }

  // Convert URL to base64
  if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
    const resolved = await resolveToBase64(imageBase64)
    if (!resolved) return errorResult('Failed to download image for analysis')
    imageBase64 = resolved.base64
    imageMimeType = resolved.mimeType
  }

  const res = await fetch('/api/creative-studio/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, imageMimeType }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Image analysis failed (${res.status})`)
  }

  const data = await res.json()
  const analysis = data.analysis || {}

  const subjects = Array.isArray(analysis.subjects) ? analysis.subjects : []
  const colors = Array.isArray(analysis.colors) ? analysis.colors : []
  const textContent = Array.isArray(analysis.textContent) ? analysis.textContent : []
  const suggestedEdits = Array.isArray(analysis.suggestedEdits) ? analysis.suggestedEdits : []

  return {
    success: true,
    cardType: 'image-analysis',
    data: { analysis },
    modelSummary: [
      'Image analysis complete.',
      analysis.style ? `Style: ${analysis.style}.` : null,
      analysis.mood ? `Mood: ${analysis.mood}.` : null,
      subjects.length > 0 ? `Subjects: ${subjects.join(', ')}.` : null,
      colors.length > 0 ? `Colors: ${colors.join(', ')}.` : null,
      textContent.length > 0 ? `Text detected: ${textContent.map((t: Record<string, string>) => `[${t.role}] "${truncate(t.text, 40)}"`).join(', ')}.` : 'No text detected.',
      analysis.adPotential ? `Ad potential: ${truncate(analysis.adPotential as string, 150)}` : null,
      suggestedEdits.length > 0 ? `Suggested edits: ${suggestedEdits.map((e: string) => truncate(e, 60)).join('; ')}` : null,
    ].filter(Boolean).join(' '),
  }
}

async function executeAdjustImage(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  let imageBase64 = inputs.imageBase64 as string | undefined
  let imageMimeType = (inputs.imageMimeType as string) || 'image/png'
  const adjustmentPrompt = inputs.adjustmentPrompt as string | undefined

  if (!adjustmentPrompt) return errorResult('Missing adjustmentPrompt for image editing')

  // Fallback: use first user-uploaded image from context
  if (!imageBase64) {
    const userImage = (context.userMedia || []).find(m => m.type === 'image')
    if (userImage?.url) {
      imageBase64 = userImage.url
    }
  }

  if (!imageBase64) return errorResult('Missing image for editing. Please upload an image first.')

  // Handle data URLs
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      imageMimeType = match[1]
      imageBase64 = match[2]
    }
  }

  // Convert URL to base64
  if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
    const resolved = await resolveToBase64(imageBase64)
    if (!resolved) return errorResult('Failed to download image for editing')
    imageBase64 = resolved.base64
    imageMimeType = resolved.mimeType
  }

  const res = await fetch('/api/creative-studio/adjust-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, imageMimeType, adjustmentPrompt }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return errorResult((err as Record<string, string>).error || `Image adjustment failed (${res.status})`)
  }

  const data = await res.json()
  const image = data.image || {}

  return {
    success: true,
    cardType: 'image-result',
    data: {
      image,
      adjustmentPrompt,
    },
    modelSummary: `Image edited successfully. Applied: "${truncate(adjustmentPrompt, 100)}".`,
    generatedAsset: {
      type: 'image',
      creditCost: 0, // adjust_image is free (no credit cost)
    },
  }
}

async function executeGenerateOverlay(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  let videoUrl = inputs.videoUrl as string | undefined
  const instruction = (inputs.instruction as string) || 'Generate captions'
  const durationSeconds = (inputs.durationSeconds as number) || 10

  // Fallback chain: context's analyzed video URL → most recent user-uploaded video
  if (!videoUrl || !videoUrl.startsWith('http')) {
    videoUrl = context.analyzedVideoUrl || undefined
  }
  if (!videoUrl || !videoUrl.startsWith('http')) {
    const userVideos = (context.userMedia || []).filter(m => m.type === 'video')
    if (userVideos.length > 0) {
      videoUrl = userVideos[userVideos.length - 1].url
    }
  }

  if (!videoUrl) return errorResult('Missing videoUrl for overlay generation. Please upload a video first.')

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

  // Create a video_generation_job record so the video editor can load via ?jobId=
  // (the standard pattern used by all other flows — Video Studio, etc.)
  let jobId: string | null = null
  try {
    const jobRes = await fetch('/api/creative-studio/create-overlay-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: context.userId,
        adAccountId: context.adAccountId,
        videoUrl,
        overlayConfig,
        durationSeconds,
      }),
    })
    if (jobRes.ok) {
      const jobData = await jobRes.json()
      jobId = jobData.jobId
    }
  } catch { /* non-fatal — editor will still work via videoUrl fallback */ }

  return {
    success: true,
    cardType: 'overlay-preview',
    data: { overlayConfig, transcript: data.transcript, hookText, captionCount, ctaText, style, videoUrl, jobId },
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
  const product = { ...((inputs.product as Record<string, unknown>) || context.productInfo || {}) }
  if (!product.name) return errorResult('Missing product info for ad copy generation')

  // Check if we have video analysis context — enriches the product for video-informed copy
  const videoAnalysis = (inputs.videoAnalysis as Record<string, unknown>) || context.videoAnalysis
  if (videoAnalysis) {
    // Enrich the product description with video insights so the copy reflects the video
    const videoContext = [
      videoAnalysis.transcript ? `VIDEO TRANSCRIPT: "${truncate(videoAnalysis.transcript as string, 800)}"` : null,
      videoAnalysis.speakerStyle ? `Speaker Style: ${videoAnalysis.speakerStyle}` : null,
      videoAnalysis.visualStyle ? `Visual Style: ${videoAnalysis.visualStyle}` : null,
      videoAnalysis.emotionalTone ? `Emotional Tone: ${videoAnalysis.emotionalTone}` : null,
      Array.isArray(videoAnalysis.keyMessages) ? `Key Messages: ${(videoAnalysis.keyMessages as string[]).join(', ')}` : null,
      videoAnalysis.topStrength ? `Top Strength: ${videoAnalysis.topStrength}` : null,
      videoAnalysis.topWeakness ? `Top Weakness: ${videoAnalysis.topWeakness}` : null,
      (videoAnalysis.hook as Record<string, unknown>)?.score != null
        ? `Funnel Scores — Hook: ${(videoAnalysis.hook as Record<string, unknown>).score}, Hold: ${(videoAnalysis.hold as Record<string, unknown>)?.score ?? 'N/A'}, Click: ${(videoAnalysis.click as Record<string, unknown>)?.score ?? 'N/A'}, Convert: ${(videoAnalysis.convert as Record<string, unknown>)?.score ?? 'N/A'}`
        : null,
    ].filter(Boolean).join('\n')

    product.description = [
      product.description || '',
      '\n\n--- VIDEO AD ANALYSIS (write copy that complements this video) ---',
      'The user has a video ad they want ad copy for. The copy should work AS the ad text accompanying this video.',
      'Reference the video\'s messaging, tone, and key hooks. Don\'t just write generic product copy.',
      videoContext,
    ].join('\n')
  }

  // Use generate-from-product (not competitor) — works with enriched product context
  const res = await fetch('/api/creative-studio/generate-from-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product }),
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
    data: { ads, hasVideoContext: !!videoAnalysis },
    modelSummary: [
      `Generated ${ads.length} ad copy variation(s)${videoAnalysis ? ' based on your video analysis' : ''}:`,
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
  let product = (inputs.product as Record<string, unknown>) || context.productInfo || {}
  const style = (inputs.style as string) || 'lifestyle'
  // Accept "prompt" as alias for "imagePrompt" (Opus/Sonnet send "prompt")
  const imagePrompt = (inputs.imagePrompt as string | undefined) || (inputs.prompt as string | undefined)
  // Auto-set noTextOverlay when there's no ad copy — route to open prompt path
  const noTextOverlay = (inputs.noTextOverlay as boolean | undefined) ?? !adCopy

  // For open prompt images (no ad copy, no product), use placeholder — same as Image mode
  if (!product.name && noTextOverlay) {
    product = { ...product, name: 'Open Prompt' }
  }

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

  // Append image-matching language when product images are present
  const imageMatchText = ' The product matches the reference image precisely — same colors, shape, branding, and proportions.'
  const enrichedPrompt = productImages.length > 0 ? prompt + imageMatchText : prompt

  const res = await fetch('/api/creative-studio/generate-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: context.userId,
      adAccountId: context.adAccountId,
      prompt: enrichedPrompt,
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

async function executeDetectText(
  inputs: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  let imageBase64 = inputs.imageBase64 as string | undefined
  let imageMimeType = (inputs.imageMimeType as string) || 'image/png'

  // If no base64 provided (or it's a URL), try to resolve it
  if (!imageBase64) {
    // Fall back to first user media image from context
    const userImage = (context.userMedia || []).find(m => m.type === 'image')
    if (userImage?.url) {
      imageBase64 = userImage.url
    }
  }

  if (!imageBase64) return errorResult('Missing image for text detection')

  // If it's a data URL, extract the base64 portion
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      imageMimeType = match[1]
      imageBase64 = match[2]
    }
  }

  // If the value is a URL, convert to base64
  if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
    const resolved = await resolveToBase64(imageBase64)
    if (!resolved) return errorResult('Failed to download image for text detection')
    imageBase64 = resolved.base64
    imageMimeType = resolved.mimeType
  }

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

      case 'analyze_image':
        return await executeAnalyzeImage(inputs, context)

      case 'adjust_image':
        return await executeAdjustImage(inputs, context)

      case 'generate_overlay':
        return await executeGenerateOverlay(inputs, context)

      case 'generate_ad_copy':
        return await executeGenerateAdCopy(inputs, context)

      case 'generate_image':
        return await executeGenerateImage(inputs, context)

      case 'generate_video':
        return await executeGenerateVideo(inputs, context)

      case 'detect_text':
        return await executeDetectText(inputs, context)

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
