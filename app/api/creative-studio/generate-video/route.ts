import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credit cost constants
const VIDEO_CREDIT_COST = 50
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
      adIndex,
      productImageBase64,
      productImageMimeType,
      overlayConfig,
    } = body

    if (!userId || !adAccountId || !prompt || !videoStyle) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, adAccountId, prompt, videoStyle' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
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
    if (used + VIDEO_CREDIT_COST > totalAvailable) {
      return NextResponse.json(
        { error: 'Insufficient credits for video generation', remaining: totalAvailable - used, required: VIDEO_CREDIT_COST },
        { status: 429 }
      )
    }

    // ── Deduct Credits Immediately ────────────────────────────────────────────
    await supabase.from('ai_generation_usage').insert({
      user_id: userId,
      generation_type: 'video',
      credit_cost: VIDEO_CREDIT_COST,
      generation_label: `Video: ${videoStyle}`,
    })

    // ── Prepare Input Image (if provided) ─────────────────────────────────────
    let inputImageUrl: string | null = null

    if (productImageBase64 && productImageMimeType) {
      // Upload padded image to Supabase Storage for Sora reference
      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const tempId = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const ext = productImageMimeType.includes('png') ? 'png' : 'jpg'
      const storagePath = `${userId}/${cleanAccountId}/video-input/${tempId}.${ext}`

      const fileBuffer = Buffer.from(productImageBase64, 'base64')

      const { error: uploadErr } = await supabase
        .storage
        .from('media')
        .upload(storagePath, fileBuffer, { contentType: productImageMimeType, upsert: true })

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath)
        inputImageUrl = urlData?.publicUrl || null
      }
    }

    // ── Create Job Record ─────────────────────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from('video_generation_jobs')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        session_id: sessionId || null,
        input_image_url: inputImageUrl,
        prompt,
        video_style: videoStyle,
        duration_seconds: durationSeconds,
        overlay_config: overlayConfig || null,
        status: 'queued',
        ad_index: adIndex ?? null,
        credit_cost: VIDEO_CREDIT_COST,
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error('[GenerateVideo] Job creation failed:', jobError)
      return NextResponse.json({ error: 'Failed to create video job' }, { status: 500 })
    }

    // ── Call Sora 2 Pro API ───────────────────────────────────────────────────
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      // Sora API: create video from prompt (image-to-video if we have an image)
      const videoParams: any = {
        model: 'sora-2-pro',
        prompt,
        duration: durationSeconds,
        resolution: '1024x1792', // 9:16 portrait for ads
      }

      // If we have a product image, include it for image-to-video
      if (inputImageUrl) {
        videoParams.image = { url: inputImageUrl }
      }

      const videoJob = await (openai.videos as any).create(videoParams)

      // Update job with Sora job ID
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
    } catch (soraError: any) {
      console.error('[GenerateVideo] Sora API error:', soraError)

      // Update job as failed
      await supabase
        .from('video_generation_jobs')
        .update({
          status: 'failed',
          error_message: soraError.message || 'Sora API error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      // Refund credits
      await supabase.from('ai_generation_usage').insert({
        user_id: userId,
        generation_type: 'video',
        credit_cost: -VIDEO_CREDIT_COST,
        generation_label: 'Refund: Video generation failed',
      })

      return NextResponse.json({
        jobId: job.id,
        status: 'failed',
        error: soraError.message || 'Video generation failed',
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
