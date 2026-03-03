import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGoogleAI, isVertexAI } from '@/lib/google-ai'

const VEO_GCS_OUTPUT_URI = 'gs://killscaleapp/video/'
// Extension model now uses VEO_MODELS[qualityTier]

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credit cost constants per quality tier
const CREDIT_COSTS = {
  standard: { base: 20, ext: 30 },   // Veo 3.1 Fast (720p)
  premium:  { base: 50, ext: 75 },   // Veo 3.1 Standard (1080p)
}
const VEO_MODELS = {
  standard: 'veo-3.1-fast-generate-preview',
  premium: 'veo-3.1-generate-preview',
}
const PLAN_CREDITS: Record<string, number> = { pro: 500, scale: 500, launch: 500 }
const TRIAL_CREDITS = 25

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      adAccountId,
      prompt,
      videoStyle,
      durationSeconds = 8,
      sessionId,
      canvasId,
      productName,
      adIndex,
      // Multi-image support (new)
      productImages: productImagesParam,
      // Legacy single-image params (backwards compat)
      productImageBase64,
      productImageMimeType,
      overlayConfig,
      provider: requestedProvider,
      targetDurationSeconds,
      extensionPrompts,
      adCopy,
      dialogue,
      quality = 'premium',
      // Per-segment image assignment (optional)
      segmentImages: segmentImagesParam,
    } = body

    const qualityTier: 'standard' | 'premium' = (quality === 'standard' || quality === 'premium') ? quality : 'premium'

    // Determine provider: explicit param overrides default
    const isVeoExt = requestedProvider === 'veo-ext'
    const effectiveIsVeo = isVeoExt || requestedProvider === 'veo' || !requestedProvider

    if (!userId || !adAccountId || !prompt || !videoStyle) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, adAccountId, prompt, videoStyle' },
        { status: 400 }
      )
    }

    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Video generation not configured' },
        { status: 503 }
      )
    }

    // ── Normalize product images (multi-image or legacy single) ─────────────
    // Per-segment images override flat array when provided
    const hasSegmentImages = Array.isArray(segmentImagesParam) && segmentImagesParam.length > 0
    let images: Array<{ base64: string; mimeType: string }> = []
    if (hasSegmentImages) {
      // Use base segment images for the initial generation
      images = (segmentImagesParam[0] || []).slice(0, 3)
    } else if (Array.isArray(productImagesParam) && productImagesParam.length > 0) {
      images = productImagesParam.slice(0, 3)  // Max 3
    } else if (productImageBase64 && productImageMimeType) {
      images = [{ base64: productImageBase64, mimeType: productImageMimeType }]
    }

    // ── Credit Check ──────────────────────────────────────────────────────────
    const [subResult, adminSubResult, overrideResult] = await Promise.all([
      supabase.from('subscriptions').select('plan, status').eq('user_id', userId).single(),
      supabase.from('admin_granted_subscriptions').select('plan, is_active, expires_at')
        .eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('ai_credit_overrides').select('credit_limit').eq('user_id', userId).single(),
    ])

    const sub = subResult.data
    const adminSub = adminSubResult.data
    const override = overrideResult.data
    const hasAdminSub = adminSub?.is_active && new Date(adminSub.expires_at) > new Date()
    const isTrial = sub?.status === 'trialing'
    const isActive = sub?.status === 'active' || isTrial || hasAdminSub

    if (!isActive) {
      return NextResponse.json({ error: 'Active subscription required' }, { status: 403 })
    }

    const plan = sub?.plan || 'launch'
    let planLimit = isTrial ? TRIAL_CREDITS : (PLAN_CREDITS[plan] || PLAN_CREDITS.launch)
    if (override?.credit_limit) planLimit = override.credit_limit

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    let usedQuery = supabase.from('ai_generation_usage').select('credit_cost').eq('user_id', userId)
    if (!isTrial || override) usedQuery = usedQuery.gte('created_at', monthStart)
    const { data: usageRows } = await usedQuery
    const used = (usageRows || []).reduce((sum: number, row: any) => sum + (row.credit_cost || 5), 0)

    const { data: purchaseRows } = await supabase
      .from('ai_credit_purchases').select('credits').eq('user_id', userId).gte('created_at', monthStart)
    const purchased = (purchaseRows || []).reduce((sum: number, row: any) => sum + row.credits, 0)

    const totalAvailable = planLimit + purchased
    const costs = CREDIT_COSTS[qualityTier]
    const creditCost = isVeoExt ? costs.ext : costs.base
    if (used + creditCost > totalAvailable) {
      return NextResponse.json(
        { error: 'Insufficient credits for video generation', remaining: totalAvailable - used, required: creditCost },
        { status: 429 }
      )
    }

    // ── Deduct Credits Immediately ────────────────────────────────────────────
    await supabase.from('ai_generation_usage').insert({
      user_id: userId,
      generation_type: 'video',
      credit_cost: creditCost,
      generation_label: isVeoExt ? `Video: ${videoStyle} (15s Veo 3.1)` : `Video: ${videoStyle}`,
    })

    // ── Prepare Reference Images for Veo ──────────────────────────────────────
    const veoReferenceImages: Array<{ image: { imageBytes: string; mimeType: string }; referenceType: string }> = []

    for (const img of images) {
      const rawBuffer = Buffer.from(img.base64, 'base64')
      veoReferenceImages.push({
        image: {
          imageBytes: rawBuffer.toString('base64'),
          mimeType: img.mimeType || 'image/png',
        },
        referenceType: 'ASSET',
      })
    }

    // ── Validate duration ────────────────────────────────────────────────────
    let finalDuration: number
    if (isVeoExt) {
      // Veo 3.1 extension: always start with 8s initial generation
      finalDuration = 8
    } else {
      // Veo supports 4, 6, 8 — clamp 12→8
      const veoValid = [4, 6, 8]
      const requested = Number(durationSeconds)
      finalDuration = veoValid.includes(requested) ? requested : Math.min(requested, 8)
      if (!veoValid.includes(finalDuration)) finalDuration = 8
    }

    // ── Compute extension plan for veo-ext ─────────────────────────────────
    const targetDuration = isVeoExt ? (targetDurationSeconds || 15) : finalDuration
    const extensionTotal = isVeoExt ? Math.ceil((targetDuration - 8) / 7) : 0

    // ── Create Job Record ─────────────────────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from('video_generation_jobs')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        session_id: sessionId || null,
        canvas_id: canvasId || null,
        product_name: productName || null,
        input_image_url: images.length > 0 ? 'sdk-direct-upload' : null,
        prompt,
        video_style: videoStyle,
        duration_seconds: finalDuration,
        overlay_config: overlayConfig || null,
        status: 'queued',
        ad_index: adIndex ?? null,
        credit_cost: creditCost,
        provider: isVeoExt ? 'veo-ext' : 'veo',
        target_duration_seconds: isVeoExt ? targetDuration : null,
        extension_step: 0,
        extension_total: extensionTotal,
        extension_prompts: isVeoExt && Array.isArray(extensionPrompts) && extensionPrompts.length > 0
          ? extensionPrompts
          : null,
        ad_copy: adCopy || null,
        dialogue: dialogue || null,
        reference_images: hasSegmentImages
          ? { segments: segmentImagesParam.map((seg: Array<{ base64: string; mimeType: string }>) => (seg || []).slice(0, 3)) }
          : images.length > 0 ? images : null,
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error('[GenerateVideo] Job creation failed:', jobError)
      return NextResponse.json({ error: 'Failed to create video job' }, { status: 500 })
    }

    // ── Submit to Veo ──────────────────────────────────────────────────────────
    try {
      if (isVeoExt) {
        // ── Veo 3.1 Extended Path ──────────────────────────────────────────
        console.log(`[GenerateVideo] Sending to Veo 3.1 Extended: initialDuration=8s, targetDuration=${targetDuration}s, extensions=${extensionTotal}, images=${images.length}`)
        console.log(`[GenerateVideo] Prompt: ${prompt.substring(0, 200)}...`)

        const ai = getGoogleAI()
        if (!ai) throw new Error('Google AI not configured')

        const veoExtConfig: Record<string, unknown> = {
          numberOfVideos: 1,
          durationSeconds: 8,       // Always 8s for extension-capable generation
          aspectRatio: '9:16',
          resolution: '720p',       // Required for extension
        }

        // Vertex AI: outputGcsUri makes Veo write to GCS and return gcsUri (needed for extensions)
        if (isVertexAI()) {
          veoExtConfig.outputGcsUri = VEO_GCS_OUTPUT_URI
        }

        const veoExtParams: Record<string, unknown> = {
          model: VEO_MODELS[qualityTier],   // Match quality tier for extensions
          prompt,
          config: veoExtConfig,
        }

        // Pass reference images
        if (veoReferenceImages.length === 1) {
          // Single image: use legacy `image` param (proven to work)
          veoExtParams.image = veoReferenceImages[0].image
        } else if (veoReferenceImages.length > 1) {
          // Multiple images: use referenceImages array
          veoExtParams.referenceImages = veoReferenceImages
        }

        const operation = await (ai.models as any).generateVideos(veoExtParams)
        const operationId = `veoext:${operation.name}`

        await supabase
          .from('video_generation_jobs')
          .update({
            sora_job_id: operationId,
            status: 'generating',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        console.log(`[GenerateVideo] Veo 3.1 Extended operation created: ${operation.name} for user ${userId} (target ${targetDuration}s, ${extensionTotal} extension(s))`)

        return NextResponse.json({
          jobId: job.id,
          soraJobId: operationId,
          status: 'generating',
          creditCost,
          provider: 'veo-ext',
          targetDurationSeconds: targetDuration,
          extensionTotal,
        })
      } else {
        // ── Veo Standard Path ──────────────────────────────────────────────
        const veoModel = VEO_MODELS[qualityTier]
        console.log(`[GenerateVideo] Sending to Veo: model=${veoModel}, duration=${finalDuration}s, images=${images.length}`)
        console.log(`[GenerateVideo] Prompt: ${prompt.substring(0, 200)}...`)

        const ai = getGoogleAI()
        if (!ai) throw new Error('Google AI not configured')

        const veoConfig: Record<string, unknown> = {
          numberOfVideos: 1,
          durationSeconds: finalDuration,
          aspectRatio: '9:16',   // portrait for ads
          resolution: '720p',
        }

        // Vertex AI: outputGcsUri so we get a downloadable URI instead of raw videoBytes
        if (isVertexAI()) {
          veoConfig.outputGcsUri = VEO_GCS_OUTPUT_URI
        }

        const veoParams: Record<string, unknown> = {
          model: veoModel,
          prompt,
          config: veoConfig,
        }

        // Pass reference images
        if (veoReferenceImages.length === 1) {
          // Single image: use legacy `image` param (proven to work)
          veoParams.image = veoReferenceImages[0].image
        } else if (veoReferenceImages.length > 1) {
          // Multiple images: use referenceImages array
          veoParams.referenceImages = veoReferenceImages
        }

        const operation = await (ai.models as any).generateVideos(veoParams)

        // Store operation name with veo: prefix so polling endpoint knows the provider
        const operationId = `veo:${operation.name}`

        await supabase
          .from('video_generation_jobs')
          .update({
            sora_job_id: operationId,
            status: 'generating',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        console.log(`[GenerateVideo] Veo operation created: ${operation.name} for user ${userId}`)

        return NextResponse.json({
          jobId: job.id,
          soraJobId: operationId,
          status: 'generating',
          creditCost,
        })
      }
    } catch (apiError: any) {
      const providerName = isVeoExt ? 'Veo 3.1 Ext' : 'Veo'
      console.error(`[GenerateVideo] ${providerName} API error:`, apiError)

      await supabase
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          error_message: apiError.message || 'Video API error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      // Refund credits
      await supabase.from('ai_generation_usage').insert({
        user_id: userId,
        generation_type: 'video',
        credit_cost: -creditCost,
        generation_label: 'Refund: Video generation failed',
      })

      return NextResponse.json({
        jobId: job.id,
        status: 'failed',
        error: apiError.message || 'Video generation failed',
        creditsRefunded: true,
      }, { status: 500 })
    }
  } catch (err) {
    console.error('[GenerateVideo] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
