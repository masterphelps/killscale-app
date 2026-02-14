import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { getGoogleAI, isVertexAI } from '@/lib/google-ai'

const VEO_GCS_OUTPUT_URI = 'gs://killscaleapp/video/'
const VEO_EXTENSION_MODEL = 'veo-3.1-generate-preview'

// ── Video Model Config ──────────────────────────────────────────────────────
const VIDEO_MODEL = process.env.VIDEO_MODEL || 'sora-2-pro'
const isVeo = VIDEO_MODEL.startsWith('veo')
const isRunway = VIDEO_MODEL.startsWith('runway-')

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credit cost constants
const VIDEO_CREDIT_COST = 50
const VEO_EXT_CREDIT_COST = 75
const PLAN_CREDITS: Record<string, number> = { pro: 500, scale: 500, launch: 500 }
const TRIAL_CREDITS = 25

/**
 * Condense a structured Sora/Veo prompt into ≤1000 chars for Runway.
 * Strips block headers, redundant adjectives, and technical directives
 * that Runway doesn't need, while preserving the core creative intent.
 */
function condenseForRunway(prompt: string): string {
  if (prompt.length <= 1000) return prompt

  let condensed = prompt
    // Strip block headers like [Scene], [Action], [Mood & Atmosphere], [Technical], [Dialogue]
    .replace(/\[(?:Scene|Subject|Action|Product|Mood & Atmosphere|Technical|Dialogue)\]\n?/g, '')
    // Remove the Technical block entirely — Runway handles its own rendering
    .replace(/Vertical 9:16 portrait[^.]*\.\s*(?:Professional ad quality\.?\s*)?(?:Cinematic lighting\.?\s*)?/gi, '')
    .replace(/Pacing:[^.]*\.[^.]*\./g, '')
    // Compress beat markers into shorter form
    .replace(/\bBeat \d+:\s*/g, '')
    .replace(/\bOpening:\s*/g, '')
    .replace(/\bMid:\s*/g, '')
    .replace(/\bClosing:\s*/g, '')
    // Remove flowery filler phrases
    .replace(/\b(?:the kind of (?:shot|video|frame) that)[^.]*\./gi, '')
    .replace(/\b(?:every frame (?:is|feels|looks)[^.]*\.)/gi, '')
    .replace(/\b(?:the viewer feels[^.]*\.)/gi, '')
    .replace(/\b(?:nothing else competes for attention\.?\s*)/gi, '')
    .replace(/\bNo (?:dialogue|music|background music)[^.]*\.\s*/gi, '')
    // Compress repeated whitespace and newlines
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim()

  // If still over 1000, trim at last sentence boundary
  if (condensed.length > 1000) {
    condensed = condensed.substring(0, 1000)
    const lastPeriod = condensed.lastIndexOf('.')
    if (lastPeriod > 600) condensed = condensed.substring(0, lastPeriod + 1)
  }

  console.log(`[GenerateVideo] Runway prompt condensed: ${prompt.length} → ${condensed.length} chars`)
  return condensed
}

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
      productImageBase64,
      productImageMimeType,
      overlayConfig,
      provider: requestedProvider,
      targetDurationSeconds,
    } = body

    // Determine provider: explicit param overrides env var detection
    const isVeoExt = requestedProvider === 'veo-ext'
    // When a specific provider is requested from the frontend, override env var defaults
    const effectiveIsVeo = isVeoExt || requestedProvider === 'veo' || (!requestedProvider && isVeo)
    const effectiveIsRunway = !isVeoExt && (requestedProvider === 'runway' || (!requestedProvider && isRunway))
    const effectiveIsSora = !isVeoExt && (requestedProvider === 'sora' || (!requestedProvider && !isVeo && !isRunway))

    if (!userId || !adAccountId || !prompt || !videoStyle) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, adAccountId, prompt, videoStyle' },
        { status: 400 }
      )
    }

    const requiredKey = isVeoExt ? 'GOOGLE_GEMINI_API_KEY' : effectiveIsRunway ? 'RUNWAY_API_KEY' : effectiveIsVeo ? 'GOOGLE_GEMINI_API_KEY' : 'OPENAI_API_KEY'
    if (!process.env[requiredKey]) {
      return NextResponse.json(
        { error: 'Video generation not configured' },
        { status: 503 }
      )
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
    const creditCost = isVeoExt ? VEO_EXT_CREDIT_COST : VIDEO_CREDIT_COST
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

    // ── Prepare Input Image ────────────────────────────────────────────────────
    let imageBuffer: Buffer | null = null
    let imageBase64ForVeo: string | null = null
    let imageUrlForRunway: string | null = null

    if (productImageBase64 && productImageMimeType) {
      const rawBuffer = Buffer.from(productImageBase64, 'base64')

      if (isVeoExt) {
        // Veo 3.1 Extended accepts image bytes directly — same as standard Veo
        imageBase64ForVeo = rawBuffer.toString('base64')
      } else if (effectiveIsRunway) {
        // Runway requires an HTTPS URL — upload to Supabase Storage to get a public URL
        const ext = productImageMimeType.includes('png') ? 'png' : 'jpg'
        const storagePath = `${userId}/${adAccountId.replace(/^act_/, '')}/runway-input/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('media')
          .upload(storagePath, rawBuffer, { contentType: productImageMimeType, upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath)
          imageUrlForRunway = urlData?.publicUrl || null
        }
        if (imageUrlForRunway) {
          console.log(`[GenerateVideo] Product image uploaded for Runway: ${imageUrlForRunway}`)
        }
      } else if (effectiveIsVeo) {
        // Veo accepts image bytes directly — no resize needed
        imageBase64ForVeo = rawBuffer.toString('base64')
      } else {
        // Sora requires input_reference to exactly match the requested size (1024x1792)
        imageBuffer = await sharp(rawBuffer)
          .resize(1024, 1792, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          })
          .png()
          .toBuffer()
        console.log(`[GenerateVideo] Product image resized to 1024x1792`)
      }
    }

    // ── Validate duration ────────────────────────────────────────────────────
    let finalDuration: number
    if (isVeoExt) {
      // Veo 3.1 extension: always start with 8s initial generation
      finalDuration = 8
    } else if (effectiveIsRunway) {
      // Runway supports 2-10 seconds (integer)
      finalDuration = Math.max(2, Math.min(10, Math.round(Number(durationSeconds))))
    } else if (effectiveIsVeo) {
      // Veo supports 4, 6, 8 — clamp 12→8
      const veoValid = [4, 6, 8]
      const requested = Number(durationSeconds)
      finalDuration = veoValid.includes(requested) ? requested : Math.min(requested, 8)
      if (!veoValid.includes(finalDuration)) finalDuration = 8
    } else {
      // Sora accepts '4', '8', '12'
      const validSeconds = ['4', '8', '12']
      const secondsStr = String(durationSeconds)
      finalDuration = validSeconds.includes(secondsStr) ? Number(secondsStr) : 8
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
        input_image_url: (imageBuffer || imageBase64ForVeo || imageUrlForRunway) ? 'sdk-direct-upload' : null,
        prompt,
        video_style: videoStyle,
        duration_seconds: finalDuration,
        overlay_config: overlayConfig || null,
        status: 'queued',
        ad_index: adIndex ?? null,
        credit_cost: creditCost,
        provider: isVeoExt ? 'veo-ext' : effectiveIsRunway ? 'runway' : effectiveIsVeo ? 'veo' : 'sora',
        target_duration_seconds: isVeoExt ? targetDuration : null,
        extension_step: 0,
        extension_total: extensionTotal,
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error('[GenerateVideo] Job creation failed:', jobError)
      return NextResponse.json({ error: 'Failed to create video job' }, { status: 500 })
    }

    // ── Submit to Video Provider ────────────────────────────────────────────
    try {
      if (isVeoExt) {
        // ── Veo 3.1 Extended Path ──────────────────────────────────────────
        console.log(`[GenerateVideo] Sending to Veo 3.1 Extended: initialDuration=8s, targetDuration=${targetDuration}s, extensions=${extensionTotal}, hasImage=${!!imageBase64ForVeo}`)
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
          model: VEO_EXTENSION_MODEL,   // Must use preview model for extensions
          prompt,
          config: veoExtConfig,
        }

        if (imageBase64ForVeo) {
          veoExtParams.image = {
            imageBytes: imageBase64ForVeo,
            mimeType: productImageMimeType || 'image/png',
          }
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
      } else if (effectiveIsRunway) {
        // ── Runway Path ────────────────────────────────────────────────────
        const runwayModel = VIDEO_MODEL.startsWith('runway-') ? VIDEO_MODEL.replace('runway-', '') : 'gen4.5'
        const hasImage = !!imageUrlForRunway
        const endpoint = hasImage
          ? 'https://api.dev.runwayml.com/v1/image_to_video'
          : 'https://api.dev.runwayml.com/v1/text_to_video'

        console.log(`[GenerateVideo] Sending to Runway: model=${runwayModel}, duration=${finalDuration}s, hasImage=${hasImage}, endpoint=${endpoint}`)
        console.log(`[GenerateVideo] Prompt: ${prompt.substring(0, 200)}...`)

        // Runway has a 1000 character limit on promptText — condense structured prompts
        const runwayPrompt = condenseForRunway(prompt)

        const runwayBody: Record<string, unknown> = {
          model: runwayModel,
          promptText: runwayPrompt,
          ratio: '720:1280',  // 9:16 portrait for ads
          duration: finalDuration,
        }
        if (hasImage) {
          runwayBody.promptImage = imageUrlForRunway
        }

        const runwayRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06',
          },
          body: JSON.stringify(runwayBody),
        })

        if (!runwayRes.ok) {
          const errText = await runwayRes.text()
          throw new Error(`Runway API ${runwayRes.status}: ${errText}`)
        }

        const runwayTask = await runwayRes.json()
        const taskId = `runway:${runwayTask.id}`

        await supabase
          .from('video_generation_jobs')
          .update({
            sora_job_id: taskId,
            status: 'generating',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        console.log(`[GenerateVideo] Runway task created: ${runwayTask.id} for user ${userId}`)

        return NextResponse.json({
          jobId: job.id,
          soraJobId: taskId,
          status: 'generating',
          creditCost: VIDEO_CREDIT_COST,
        })
      } else if (effectiveIsVeo) {
        // ── Veo Path (Google GenAI) ──────────────────────────────────────────
        const veoModel = VIDEO_MODEL.startsWith('veo') ? VIDEO_MODEL : 'veo-3.1-generate-preview'
        console.log(`[GenerateVideo] Sending to Veo: model=${veoModel}, duration=${finalDuration}s, hasImage=${!!imageBase64ForVeo}`)
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

        // If product image provided, pass as image input
        if (imageBase64ForVeo) {
          veoParams.image = {
            imageBytes: imageBase64ForVeo,
            mimeType: productImageMimeType || 'image/png',
          }
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
          creditCost: VIDEO_CREDIT_COST,
        })
      } else {
        // ── Sora Path (OpenAI) ───────────────────────────────────────────────
        const soraDuration = String(finalDuration) as '4' | '8' | '12'
        console.log(`[GenerateVideo] Sending to Sora: model=sora-2-pro, seconds=${soraDuration}, size=1024x1792, hasImage=${!!imageBuffer}`)
        console.log(`[GenerateVideo] Prompt: ${prompt.substring(0, 200)}...`)

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const videoParams: any = {
          model: 'sora-2-pro',
          prompt,
          seconds: soraDuration,
          size: '1024x1792' as const,
        }

        if (imageBuffer) {
          videoParams.input_reference = await OpenAI.toFile(imageBuffer, 'product.png', { type: 'image/png' })
        }

        const videoJob = await openai.videos.create(videoParams)

        await supabase
          .from('video_generation_jobs')
          .update({
            sora_job_id: videoJob.id,
            status: 'generating',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        console.log(`[GenerateVideo] Sora job created: ${videoJob.id} for user ${userId}`)

        return NextResponse.json({
          jobId: job.id,
          soraJobId: videoJob.id,
          status: 'generating',
          creditCost: VIDEO_CREDIT_COST,
        })
      }
    } catch (apiError: any) {
      const providerName = isVeoExt ? 'Veo 3.1 Ext' : effectiveIsRunway ? 'Runway' : effectiveIsVeo ? 'Veo' : 'Sora'
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
