import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')
    const userId = request.nextUrl.searchParams.get('userId')

    if (!jobId || !userId) {
      return NextResponse.json({ error: 'jobId and userId required' }, { status: 400 })
    }

    // Get job from database
    const { data: job, error: jobError } = await supabase
      .from('video_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // If already complete or failed, return cached result
    if (job.status === 'complete' || job.status === 'failed') {
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress_pct: job.status === 'complete' ? 100 : job.progress_pct,
        raw_video_url: job.raw_video_url,
        final_video_url: job.final_video_url,
        thumbnail_url: job.thumbnail_url,
        error_message: job.error_message,
      })
    }

    // Poll Sora API for status
    if (!job.sora_job_id || !process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress_pct: job.progress_pct,
      })
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const soraJob = await (openai.videos as any).retrieve(job.sora_job_id)

      if (soraJob.status === 'completed') {
        // Download video from Sora and upload to Supabase Storage
        // Use raw fetch for content download — SDK types may lag behind API
        const contentRes = await fetch(`https://api.openai.com/v1/videos/${job.sora_job_id}/content`, {
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        })

        if (!contentRes.ok) {
          throw new Error(`Failed to download video content: ${contentRes.status}`)
        }

        // Get the video as a buffer
        const videoBuffer = Buffer.from(await contentRes.arrayBuffer())

        // Upload to Supabase Storage
        const cleanAccountId = job.ad_account_id.replace(/^act_/, '')
        const storagePath = `${userId}/${cleanAccountId}/videos/${job.id}.mp4`

        const { error: uploadError } = await supabase
          .storage
          .from('media')
          .upload(storagePath, videoBuffer, {
            contentType: 'video/mp4',
            upsert: true,
          })

        if (uploadError) {
          console.error('[VideoStatus] Failed to upload video to storage:', uploadError)
          // Retry once
          const { error: retryError } = await supabase
            .storage
            .from('media')
            .upload(storagePath, videoBuffer, {
              contentType: 'video/mp4',
              upsert: true,
            })
          if (retryError) {
            console.error('[VideoStatus] Retry upload also failed:', retryError)
          }
        }

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
        const rawVideoUrl = publicUrlData?.publicUrl || null

        // Update job as complete
        await supabase
          .from('video_generation_jobs')
          .update({
            status: 'complete',
            progress_pct: 100,
            raw_video_url: rawVideoUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        console.log(`[VideoStatus] Video complete: ${job.id}, stored at ${rawVideoUrl}`)

        return NextResponse.json({
          jobId: job.id,
          status: 'complete',
          progress_pct: 100,
          raw_video_url: rawVideoUrl,
        })
      }

      if (soraJob.status === 'failed') {
        const errorMsg = soraJob.error?.message || 'Video generation failed'

        await supabase
          .from('video_generation_jobs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        // Refund credits
        await supabase.from('ai_generation_usage').insert({
          user_id: userId,
          generation_type: 'video',
          credit_cost: -job.credit_cost,
          generation_label: 'Refund: Video generation failed',
        })

        return NextResponse.json({
          jobId: job.id,
          status: 'failed',
          error_message: errorMsg,
          creditsRefunded: true,
        })
      }

      // Still processing — estimate progress
      const elapsedMs = Date.now() - new Date(job.created_at).getTime()
      const estimatedTotalMs = job.duration_seconds <= 8 ? 120000 : 180000 // 2-3 min estimate
      const estimatedProgress = Math.min(90, Math.round((elapsedMs / estimatedTotalMs) * 100))

      await supabase
        .from('video_generation_jobs')
        .update({
          progress_pct: estimatedProgress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      return NextResponse.json({
        jobId: job.id,
        status: 'generating',
        progress_pct: estimatedProgress,
        estimated_time_remaining: Math.max(0, Math.round((estimatedTotalMs - elapsedMs) / 1000)),
      })
    } catch (pollError: any) {
      console.error('[VideoStatus] Sora poll error:', pollError)

      // If it's a retrieval error, the job might still be processing
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress_pct: job.progress_pct,
        poll_error: pollError.message,
      })
    }
  } catch (err) {
    console.error('[VideoStatus] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Also support getting all jobs for a user (for AI Tasks page)
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, sessionId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    let query = supabase
      .from('video_generation_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    }
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data: jobs, error } = await query

    if (error) {
      console.error('[VideoStatus] List jobs error:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err) {
    console.error('[VideoStatus] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
