import { NextRequest, NextResponse } from 'next/server'
import { GenerateVideosOperation } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { getGoogleAI, isVertexAI } from '@/lib/google-ai'

const VEO_GCS_OUTPUT_URI = 'gs://killscaleapp/video/'
const VEO_EXTENSION_MODEL = 'veo-3.1-generate-preview'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Runway helpers ──────────────────────────────────────────────────────────
function isRunwayJob(soraJobId: string | null): boolean {
  return !!soraJobId?.startsWith('runway:')
}

function getRunwayTaskId(soraJobId: string): string {
  return soraJobId.replace('runway:', '')
}

interface RunwayTask {
  id: string
  status: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress?: number
  output?: string[]
  failure?: string
  failureReason?: string
  createdAt?: string
}

/** Poll a Runway task by ID */
async function pollRunwayTask(taskId: string): Promise<RunwayTask> {
  const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': '2024-11-06',
    },
  })
  if (!res.ok) {
    throw new Error(`Runway poll ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

/** Download a completed Runway video, upload to Supabase Storage, return public URL */
async function downloadAndStoreRunwayVideo(
  videoUrl: string,
  jobId: string,
  userId: string,
  adAccountId: string
): Promise<string | null> {
  // Runway output URLs are pre-signed — just fetch directly
  const res = await fetch(videoUrl)
  if (!res.ok) {
    console.error(`[VideoStatus] Runway video download failed: ${res.status}`)
    return null
  }

  const videoBuffer = Buffer.from(await res.arrayBuffer())
  const cleanAccountId = adAccountId.replace(/^act_/, '')
  const storagePath = `${userId}/${cleanAccountId}/videos/${jobId}.mp4`

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

  if (uploadError) {
    // Retry once
    const { error: retryError } = await supabase.storage
      .from('media')
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
    if (retryError) {
      console.error('[VideoStatus] Runway video upload retry failed:', retryError)
    }
  }

  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
  return publicUrlData?.publicUrl || null
}

// ── Veo helpers ─────────────────────────────────────────────────────────────
function isVeoJob(soraJobId: string | null): boolean {
  return !!soraJobId?.startsWith('veo:')
}

function getVeoOperationName(soraJobId: string): string {
  return soraJobId.replace('veo:', '')
}

/** Poll a Veo operation by name using the SDK */
async function pollVeoOperation(operationName: string): Promise<GenerateVideosOperation> {
  const ai = getGoogleAI()
  if (!ai) throw new Error('Google AI not configured')
  const stub = Object.assign(new GenerateVideosOperation(), { name: operationName })
  return ai.operations.getVideosOperation({ operation: stub })
}

/**
 * Get the video URI from a Veo response.
 * Vertex AI with outputGcsUri returns gcsUri (gs:// path).
 * AI Studio returns uri (https download URL).
 */
function getVeoVideoUri(generatedVideo: any): string | null {
  const video = generatedVideo?.video
  if (!video) return null
  return video.gcsUri || video.uri || null
}

/** Download a completed Veo video and upload to Supabase Storage, return public URL.
 *  Handles Vertex (gs:// GCS path) and AI Studio (https URI). */
async function downloadAndStoreVeoVideo(
  videoUri: string,
  jobId: string,
  userId: string,
  adAccountId: string
): Promise<string | null> {
  let videoBuffer: Buffer

  if (videoUri.startsWith('gs://')) {
    // Vertex AI: download from GCS via authenticated JSON API
    const gcsPath = videoUri.replace('gs://', '')
    const bucket = gcsPath.split('/')[0]
    const object = gcsPath.split('/').slice(1).join('/')
    const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`

    console.log(`[VideoStatus] Downloading Veo video from GCS: ${videoUri} for ${jobId}`)

    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL!,
        private_key: process.env.GCP_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/devstorage.read_only'],
    })
    const client = await auth.getClient()
    const tokenRes = await client.getAccessToken()

    const res = await fetch(gcsUrl, {
      headers: { 'Authorization': `Bearer ${tokenRes.token}` },
    })
    if (!res.ok) {
      console.error(`[VideoStatus] GCS download failed (${res.status}): ${await res.text()}`)
      return null
    }
    videoBuffer = Buffer.from(await res.arrayBuffer())
    console.log(`[VideoStatus] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB from GCS for ${jobId}`)
  } else {
    // AI Studio: https download URL
    const decoded = decodeURIComponent(videoUri)
    let res = await fetch(decoded)

    if (!res.ok && process.env.GOOGLE_GEMINI_API_KEY) {
      const separator = decoded.includes('?') ? '&' : '?'
      res = await fetch(`${decoded}${separator}key=${process.env.GOOGLE_GEMINI_API_KEY}`)
    }
    if (!res.ok) {
      console.error(`[VideoStatus] Veo video download failed: ${res.status}`)
      return null
    }
    videoBuffer = Buffer.from(await res.arrayBuffer())
  }

  const cleanAccountId = adAccountId.replace(/^act_/, '')
  const storagePath = `${userId}/${cleanAccountId}/videos/${jobId}.mp4`

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

  if (uploadError) {
    const { error: retryError } = await supabase.storage
      .from('media')
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
    if (retryError) {
      console.error('[VideoStatus] Veo video upload retry failed:', retryError)
    }
  }

  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
  return publicUrlData?.publicUrl || null
}

// ── Veo Extended helpers ──────────────────────────────────────────────────
function isVeoExtJob(soraJobId: string | null): boolean {
  return !!soraJobId?.startsWith('veoext:')
}

function getVeoExtOperationName(soraJobId: string): string {
  return soraJobId.replace('veoext:', '')
}

/** Trigger a Veo 3.1 extension — returns new operation name */
async function triggerVeoExtension(
  videoUri: string,
  prompt: string,
): Promise<string> {
  const ai = getGoogleAI()
  if (!ai) throw new Error('Google AI not configured')

  const extConfig: Record<string, unknown> = {
    numberOfVideos: 1,
    resolution: '720p',
    aspectRatio: '9:16',
  }

  // Vertex AI: outputGcsUri so extension also returns gcsUri for further chaining
  if (isVertexAI()) {
    extConfig.outputGcsUri = VEO_GCS_OUTPUT_URI
  }

  const operation = await (ai.models as any).generateVideos({
    model: VEO_EXTENSION_MODEL,
    video: { uri: videoUri, mimeType: 'video/mp4' },
    prompt,
    config: extConfig,
  })
  console.log(`[VideoStatus] Veo extension triggered: ${operation.name}`)
  return operation.name
}

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
        overlay_config: job.overlay_config,
        duration_seconds: job.duration_seconds,
        prompt: job.prompt,
        canvas_id: job.canvas_id,
        ad_index: job.ad_index,
        product_name: job.product_name,
        provider: job.provider,
        extension_step: job.extension_step,
        extension_total: job.extension_total,
        target_duration_seconds: job.target_duration_seconds,
      })
    }

    // No provider job ID — nothing to poll
    if (!job.sora_job_id) {
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress_pct: job.progress_pct,
        canvas_id: job.canvas_id,
        ad_index: job.ad_index,
        product_name: job.product_name,
      })
    }

    // ── Veo 3.1 Extended Polling Path ──────────────────────────────────────
    if (isVeoExtJob(job.sora_job_id)) {
      if (!process.env.GOOGLE_GEMINI_API_KEY) {
        return NextResponse.json({ jobId: job.id, status: job.status, progress_pct: job.progress_pct })
      }

      try {
        const operationName = getVeoExtOperationName(job.sora_job_id)
        const operation = await pollVeoOperation(operationName)

        if (operation.done) {
          // Check for error
          if (operation.error) {
            const errorMsg = typeof operation.error === 'object'
              ? (operation.error.message || JSON.stringify(operation.error))
              : String(operation.error)
            console.error(`[VideoStatus] Veo ext job failed for ${job.id}:`, errorMsg)

            // Full refund if initial step failed, partial refund if extension failed
            const refundAmount = (job.extension_step || 0) === 0
              ? (job.credit_cost || 75)
              : 25  // Extension portion only

            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -refundAmount,
              generation_label: `Refund: Veo 3.1 extension ${(job.extension_step || 0) === 0 ? 'initial' : 'step'} failed`,
            })

            // If extension failed but we have a partial video, save it
            if ((job.extension_step || 0) > 0 && job.extension_video_uri) {
              try {
                const partialUrl = await downloadAndStoreVeoVideo(job.extension_video_uri, job.id, userId, job.ad_account_id)
                await supabase.from('video_generation_jobs')
                  .update({
                    status: 'complete',
                    raw_video_url: partialUrl,
                    duration_seconds: 8,
                    error_message: 'Extension failed. 8s partial video saved.',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', job.id)
                console.log(`[VideoStatus] Saved partial 8s video for ${job.id}`)
                return NextResponse.json({
                  jobId: job.id,
                  status: 'complete',
                  progress_pct: 100,
                  raw_video_url: partialUrl,
                  duration_seconds: 8,
                  error_message: 'Extension failed. 8s partial video saved.',
                  provider: job.provider,
                  extension_step: job.extension_step,
                  extension_total: job.extension_total,
                  target_duration_seconds: job.target_duration_seconds,
                })
              } catch (dlErr) {
                console.error(`[VideoStatus] Failed to save partial video for ${job.id}:`, dlErr)
              }
            }

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: errorMsg, creditsRefunded: true })
          }

          // Check for RAI filtering
          const raiFiltered = operation.response?.raiMediaFilteredCount
          if (raiFiltered && (!operation.response?.generatedVideos?.length)) {
            const errorMsg = `Content filtered by safety policy: ${(operation.response?.raiMediaFilteredReasons || []).join(', ') || 'unknown reason'}`
            console.error(`[VideoStatus] Veo ext RAI filtered for ${job.id}:`, errorMsg)

            const refundAmount = (job.extension_step || 0) === 0 ? (job.credit_cost || 75) : 25
            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -refundAmount,
              generation_label: 'Refund: Video filtered by safety policy',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: errorMsg, creditsRefunded: true })
          }

          // Success — extract video URI (gcsUri for Vertex, uri for AI Studio)
          const videoUri = getVeoVideoUri(operation.response?.generatedVideos?.[0])
          console.log(`[VideoStatus] Veoext response for ${job.id}: videoUri=${videoUri || 'none'}`)

          if (!videoUri) {
            console.error(`[VideoStatus] Veo ext completed but no video URI for ${job.id}`)
            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: 'No video returned from Veo', updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -(job.credit_cost || 75),
              generation_label: 'Refund: No video returned',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: 'No video returned', creditsRefunded: true })
          }

          const currentStep = job.extension_step || 0
          const totalExtensions = job.extension_total || 0

          // EXTENSION DECISION: need more extensions?
          if (currentStep < totalExtensions) {
            // Trigger next extension — optimistic concurrency to prevent duplicates
            try {
              const newOpName = await triggerVeoExtension(videoUri, job.prompt)

              const { data: updated } = await supabase
                .from('video_generation_jobs')
                .update({
                  extension_step: currentStep + 1,
                  sora_job_id: `veoext:${newOpName}`,
                  status: 'extending',
                  extension_video_uri: videoUri,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .eq('extension_step', currentStep)  // WHERE guard for concurrency
                .select()
                .single()

              if (!updated) {
                // Another poll already triggered extension — return current status
                console.log(`[VideoStatus] Concurrent extension trigger detected for ${job.id}, skipping`)
                return NextResponse.json({
                  jobId: job.id,
                  status: 'extending',
                  progress_pct: 0,
                  extension_step: currentStep + 1,
                  extension_total: totalExtensions,
                  target_duration_seconds: job.target_duration_seconds,
                  provider: job.provider,
                  canvas_id: job.canvas_id,
                  ad_index: job.ad_index,
                  product_name: job.product_name,
                })
              }

              console.log(`[VideoStatus] Veo ext extension triggered: step ${currentStep + 1}/${totalExtensions} for ${job.id}, new op: ${newOpName}`)

              return NextResponse.json({
                jobId: job.id,
                status: 'extending',
                progress_pct: 0,
                extension_step: currentStep + 1,
                extension_total: totalExtensions,
                target_duration_seconds: job.target_duration_seconds,
                provider: job.provider,
                canvas_id: job.canvas_id,
                ad_index: job.ad_index,
                product_name: job.product_name,
              })
            } catch (extErr: any) {
              console.error(`[VideoStatus] Extension trigger failed for ${job.id}:`, extErr)
              // Save partial video on extension trigger failure
              try {
                const partialUrl = await downloadAndStoreVeoVideo(videoUri, job.id, userId, job.ad_account_id)
                await supabase.from('video_generation_jobs')
                  .update({
                    status: 'complete',
                    raw_video_url: partialUrl,
                    duration_seconds: 8,
                    error_message: 'Extension failed. 8s partial video saved.',
                    extension_video_uri: videoUri,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', job.id)

                await supabase.from('ai_generation_usage').insert({
                  user_id: userId,
                  generation_type: 'video',
                  credit_cost: -25,
                  generation_label: 'Refund: Extension trigger failed',
                })

                return NextResponse.json({
                  jobId: job.id,
                  status: 'complete',
                  progress_pct: 100,
                  raw_video_url: partialUrl,
                  duration_seconds: 8,
                  error_message: 'Extension failed. 8s partial video saved.',
                  provider: job.provider,
                  extension_step: currentStep,
                  extension_total: totalExtensions,
                  target_duration_seconds: job.target_duration_seconds,
                })
              } catch (dlErr) {
                console.error(`[VideoStatus] Also failed to save partial video for ${job.id}:`, dlErr)
                return NextResponse.json({ jobId: job.id, status: 'failed', error_message: extErr.message })
              }
            }
          }

          // ALL EXTENSIONS DONE — download final video and complete
          console.log(`[VideoStatus] ALL EXTENSIONS DONE for ${job.id}: step=${currentStep}, total=${totalExtensions}. Downloading final ${job.target_duration_seconds}s video...`)
          const rawVideoUrl = await downloadAndStoreVeoVideo(videoUri, job.id, userId, job.ad_account_id)

          await supabase.from('video_generation_jobs')
            .update({
              status: 'complete',
              progress_pct: 100,
              raw_video_url: rawVideoUrl,
              duration_seconds: job.target_duration_seconds || 15,
              extension_video_uri: videoUri,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)

          console.log(`[VideoStatus] Veo ext video complete: ${job.id}, ${job.target_duration_seconds}s, stored at ${rawVideoUrl}`)

          return NextResponse.json({
            jobId: job.id,
            status: 'complete',
            progress_pct: 100,
            raw_video_url: rawVideoUrl,
            overlay_config: job.overlay_config,
            duration_seconds: job.target_duration_seconds || 15,
            prompt: job.prompt,
            canvas_id: job.canvas_id,
            ad_index: job.ad_index,
            product_name: job.product_name,
            provider: job.provider,
            extension_step: currentStep,
            extension_total: totalExtensions,
            target_duration_seconds: job.target_duration_seconds,
          })
        }

        // Still processing — return extending or generating based on DB status
        const displayStatus = job.status === 'extending' ? 'extending' : 'generating'
        return NextResponse.json({
          jobId: job.id,
          status: displayStatus,
          progress_pct: 0,
          extension_step: job.extension_step,
          extension_total: job.extension_total,
          target_duration_seconds: job.target_duration_seconds,
          provider: job.provider,
          canvas_id: job.canvas_id,
          ad_index: job.ad_index,
          product_name: job.product_name,
        })
      } catch (pollError: any) {
        console.error('[VideoStatus] Veo ext poll error:', pollError)
        return NextResponse.json({
          jobId: job.id,
          status: job.status,
          progress_pct: job.progress_pct,
          poll_error: pollError.message,
          extension_step: job.extension_step,
          extension_total: job.extension_total,
        })
      }
    }

    // ── Runway Polling Path ──────────────────────────────────────────────────
    if (isRunwayJob(job.sora_job_id)) {
      if (!process.env.RUNWAY_API_KEY) {
        return NextResponse.json({ jobId: job.id, status: job.status, progress_pct: job.progress_pct })
      }

      try {
        const taskId = getRunwayTaskId(job.sora_job_id)
        const task = await pollRunwayTask(taskId)

        if (task.status === 'SUCCEEDED') {
          const videoUrl = task.output?.[0]
          if (!videoUrl) {
            console.error(`[VideoStatus] Runway completed but no output URL for ${job.id}`)
            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: 'No video returned from Runway', updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -(job.credit_cost || 0),
              generation_label: 'Refund: No video returned',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: 'No video returned', creditsRefunded: true })
          }

          const rawVideoUrl = await downloadAndStoreRunwayVideo(videoUrl, job.id, userId, job.ad_account_id)

          await supabase.from('video_generation_jobs')
            .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, updated_at: new Date().toISOString() })
            .eq('id', job.id)

          console.log(`[VideoStatus] Runway video complete: ${job.id}, stored at ${rawVideoUrl}`)

          return NextResponse.json({
            jobId: job.id,
            status: 'complete',
            progress_pct: 100,
            raw_video_url: rawVideoUrl,
            overlay_config: job.overlay_config,
            duration_seconds: job.duration_seconds,
            prompt: job.prompt,
            canvas_id: job.canvas_id,
            ad_index: job.ad_index,
            product_name: job.product_name,
          })
        }

        if (task.status === 'FAILED') {
          const errorMsg = task.failure || task.failureReason || 'Runway generation failed'
          console.error(`[VideoStatus] Runway task failed for ${job.id}:`, errorMsg)

          await supabase.from('video_generation_jobs')
            .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
            .eq('id', job.id)

          await supabase.from('ai_generation_usage').insert({
            user_id: userId,
            generation_type: 'video',
            credit_cost: -(job.credit_cost || 0),
            generation_label: 'Refund: Runway generation failed',
          })

          return NextResponse.json({ jobId: job.id, status: 'failed', error_message: errorMsg, creditsRefunded: true })
        }

        // PENDING / THROTTLED / RUNNING — still generating
        // Runway provides a progress field (0-1 ratio) on some statuses
        const progress = typeof task.progress === 'number' ? Math.round(task.progress * 100) : 0

        return NextResponse.json({
          jobId: job.id,
          status: 'generating',
          progress_pct: progress,
          canvas_id: job.canvas_id,
          ad_index: job.ad_index,
          product_name: job.product_name,
        })
      } catch (pollError: any) {
        console.error('[VideoStatus] Runway poll error:', pollError)
        return NextResponse.json({
          jobId: job.id,
          status: job.status,
          progress_pct: job.progress_pct,
          poll_error: pollError.message,
        })
      }
    }

    // ── Veo Polling Path ─────────────────────────────────────────────────────
    if (isVeoJob(job.sora_job_id)) {
      if (!process.env.GOOGLE_GEMINI_API_KEY) {
        return NextResponse.json({ jobId: job.id, status: job.status, progress_pct: job.progress_pct })
      }

      try {
        const operationName = getVeoOperationName(job.sora_job_id)
        const operation = await pollVeoOperation(operationName)

        if (operation.done) {
          // Check for error
          if (operation.error) {
            const errorMsg = typeof operation.error === 'object'
              ? (operation.error.message || JSON.stringify(operation.error))
              : String(operation.error)
            console.error(`[VideoStatus] Veo job failed for ${job.id}:`, errorMsg)

            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -(job.credit_cost || 0),
              generation_label: 'Refund: Veo generation failed',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: errorMsg, creditsRefunded: true })
          }

          // Check for RAI filtering
          const raiFiltered = operation.response?.raiMediaFilteredCount
          if (raiFiltered && (!operation.response?.generatedVideos?.length)) {
            const errorMsg = `Content filtered by safety policy: ${(operation.response?.raiMediaFilteredReasons || []).join(', ') || 'unknown reason'}`
            console.error(`[VideoStatus] Veo RAI filtered for ${job.id}:`, errorMsg)

            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -(job.credit_cost || 0),
              generation_label: 'Refund: Video filtered by safety policy',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: errorMsg, creditsRefunded: true })
          }

          // Success — extract video URI (gcsUri for Vertex, uri for AI Studio)
          const videoUri = getVeoVideoUri(operation.response?.generatedVideos?.[0])
          console.log(`[VideoStatus] Veo response for ${job.id}: videoUri=${videoUri || 'none'}`)

          if (!videoUri) {
            console.error(`[VideoStatus] Veo completed but no video URI for ${job.id}`)
            await supabase.from('video_generation_jobs')
              .update({ status: 'failed', error_message: 'No video returned from Veo', updated_at: new Date().toISOString() })
              .eq('id', job.id)

            await supabase.from('ai_generation_usage').insert({
              user_id: userId,
              generation_type: 'video',
              credit_cost: -(job.credit_cost || 0),
              generation_label: 'Refund: No video returned',
            })

            return NextResponse.json({ jobId: job.id, status: 'failed', error_message: 'No video returned', creditsRefunded: true })
          }

          const rawVideoUrl = await downloadAndStoreVeoVideo(videoUri, job.id, userId, job.ad_account_id)

          await supabase.from('video_generation_jobs')
            .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, extension_video_uri: videoUri, updated_at: new Date().toISOString() })
            .eq('id', job.id)

          console.log(`[VideoStatus] Veo video complete: ${job.id}, stored at ${rawVideoUrl}, extensionUri=${videoUri}`)

          return NextResponse.json({
            jobId: job.id,
            status: 'complete',
            progress_pct: 100,
            raw_video_url: rawVideoUrl,
            overlay_config: job.overlay_config,
            duration_seconds: job.duration_seconds,
            prompt: job.prompt,
            canvas_id: job.canvas_id,
            ad_index: job.ad_index,
            product_name: job.product_name,
          })
        }

        // Still processing — Veo has no progress percentage
        return NextResponse.json({
          jobId: job.id,
          status: 'generating',
          progress_pct: 0,
          canvas_id: job.canvas_id,
          ad_index: job.ad_index,
          product_name: job.product_name,
        })
      } catch (pollError: any) {
        console.error('[VideoStatus] Veo poll error:', pollError)
        return NextResponse.json({
          jobId: job.id,
          status: job.status,
          progress_pct: job.progress_pct,
          poll_error: pollError.message,
        })
      }
    }

    // ── Sora Polling Path ────────────────────────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ jobId: job.id, status: job.status, progress_pct: job.progress_pct })
    }

    try {
      const soraRes = await fetch(`https://api.openai.com/v1/videos/${job.sora_job_id}`, {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      })
      if (!soraRes.ok) {
        throw new Error(`Sora poll ${soraRes.status}: ${await soraRes.text()}`)
      }
      const soraJob = await soraRes.json()

      if (soraJob.status === 'completed') {
        const contentRes = await fetch(`https://api.openai.com/v1/videos/${job.sora_job_id}/content`, {
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        })

        if (!contentRes.ok) {
          console.error(`[VideoStatus] Video content expired/unavailable for ${job.id}: ${contentRes.status}`)
          await supabase.from('video_generation_jobs')
            .update({ status: 'failed', error_message: 'Video content expired — please re-generate', updated_at: new Date().toISOString() })
            .eq('id', job.id)
          await supabase.from('ai_generation_usage').insert({
            user_id: userId,
            generation_type: 'video',
            credit_cost: -(job.credit_cost || 0),
            generation_label: 'Refund: Video content expired',
          })
          return NextResponse.json({
            jobId: job.id,
            status: 'failed',
            error_message: 'Video content expired — please re-generate',
            creditsRefunded: true,
          })
        }

        const videoBuffer = Buffer.from(await contentRes.arrayBuffer())
        const cleanAccountId = job.ad_account_id.replace(/^act_/, '')
        const storagePath = `${userId}/${cleanAccountId}/videos/${job.id}.mp4`

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

        if (uploadError) {
          const { error: retryError } = await supabase.storage
            .from('media')
            .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
          if (retryError) {
            console.error('[VideoStatus] Retry upload also failed:', retryError)
          }
        }

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
        const rawVideoUrl = publicUrlData?.publicUrl || null

        await supabase.from('video_generation_jobs')
          .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, updated_at: new Date().toISOString() })
          .eq('id', job.id)

        console.log(`[VideoStatus] Video complete: ${job.id}, stored at ${rawVideoUrl}`)

        return NextResponse.json({
          jobId: job.id,
          status: 'complete',
          progress_pct: 100,
          raw_video_url: rawVideoUrl,
          overlay_config: job.overlay_config,
          duration_seconds: job.duration_seconds,
          prompt: job.prompt,
          canvas_id: job.canvas_id,
          ad_index: job.ad_index,
          product_name: job.product_name,
        })
      }

      if (soraJob.status === 'failed') {
        const errorMsg = soraJob.error?.message || 'Video generation failed'
        console.error(`[VideoStatus] Sora job failed:`, JSON.stringify(soraJob.error || soraJob, null, 2))
        console.error(`[VideoStatus] Job prompt was:`, job.prompt?.substring(0, 500))

        await supabase.from('video_generation_jobs')
          .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
          .eq('id', job.id)

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

      // Still processing
      const progress = typeof soraJob.progress === 'number' ? soraJob.progress : 0

      if (progress > (job.progress_pct || 0)) {
        await supabase.from('video_generation_jobs')
          .update({ progress_pct: progress, updated_at: new Date().toISOString() })
          .eq('id', job.id)
      }

      return NextResponse.json({
        jobId: job.id,
        status: 'generating',
        progress_pct: progress,
        canvas_id: job.canvas_id,
        ad_index: job.ad_index,
        product_name: job.product_name,
      })
    } catch (pollError: any) {
      console.error('[VideoStatus] Sora poll error:', pollError)
      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress_pct: job.progress_pct,
        poll_error: pollError.message,
        canvas_id: job.canvas_id,
        ad_index: job.ad_index,
        product_name: job.product_name,
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
    const { userId, adAccountId, sessionId, canvasId, skipPolling } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // List view: only fetch columns needed for job cards (NOT full overlay_config JSONB)
    // When filtering by canvasId, include overlay_config since we need it for sibling append
    const extensionCols = ', provider, target_duration_seconds, extension_step, extension_total, extension_video_uri'
    const selectCols = canvasId
      ? `id, user_id, ad_account_id, session_id, canvas_id, product_name, sora_job_id, video_style, duration_seconds, status, progress_pct, error_message, raw_video_url, final_video_url, thumbnail_url, ad_index, credit_cost, overlay_config, prompt, created_at, updated_at${extensionCols}`
      : `id, user_id, ad_account_id, session_id, canvas_id, product_name, sora_job_id, video_style, duration_seconds, status, progress_pct, error_message, raw_video_url, final_video_url, thumbnail_url, ad_index, credit_cost, created_at, updated_at${extensionCols}`

    let query = supabase
      .from('video_generation_jobs')
      .select(selectCols)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    }
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }
    if (canvasId) {
      query = query.eq('canvas_id', canvasId)
    }

    const { data: jobs, error } = await query

    if (error) {
      console.error('[VideoStatus] List jobs error:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    // For in-progress jobs, poll the appropriate provider for real progress + handle completion
    // skipPolling=true: return DB state only (fast initial load)
    if (jobs && !skipPolling) {
      const inProgressJobs = jobs.filter((j: any) => (j.status === 'generating' || j.status === 'queued' || j.status === 'extending') && j.sora_job_id)
      if (inProgressJobs.length > 0) {
        await Promise.all(inProgressJobs.map(async (job: any) => {
          try {
            if (isVeoExtJob(job.sora_job_id)) {
              // ── Veo 3.1 Extended Polling ──────────────────────────────────
              if (!process.env.GOOGLE_GEMINI_API_KEY) return

              const operationName = getVeoExtOperationName(job.sora_job_id)
              const operation = await pollVeoOperation(operationName)

              if (operation.done) {
                if (operation.error || !operation.response?.generatedVideos?.length) {
                  const raiFiltered = operation.response?.raiMediaFilteredCount
                  const errorMsg = operation.error
                    ? (typeof operation.error === 'object' ? (operation.error.message || JSON.stringify(operation.error)) : String(operation.error))
                    : raiFiltered
                      ? `Content filtered: ${(operation.response?.raiMediaFilteredReasons || []).join(', ') || 'safety policy'}`
                      : 'No video returned from Veo'

                  const refundAmount = (job.extension_step || 0) === 0 ? (job.credit_cost || 75) : 25
                  console.error(`[VideoStatus/List] Veo ext job failed for ${job.id}:`, errorMsg)

                  await supabase.from('video_generation_jobs')
                    .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
                    .eq('id', job.id)

                  await supabase.from('ai_generation_usage').insert({
                    user_id: job.user_id,
                    generation_type: 'video',
                    credit_cost: -refundAmount,
                    generation_label: 'Refund: Veo 3.1 extension failed',
                  })

                  // Save partial video if extension failed but we have previous video
                  if ((job.extension_step || 0) > 0 && job.extension_video_uri) {
                    try {
                      const partialUrl = await downloadAndStoreVeoVideo(job.extension_video_uri, job.id, job.user_id, job.ad_account_id)
                      await supabase.from('video_generation_jobs')
                        .update({
                          status: 'complete', raw_video_url: partialUrl, duration_seconds: 8,
                          error_message: 'Extension failed. 8s partial video saved.',
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', job.id)
                      job.status = 'complete'
                      job.raw_video_url = partialUrl
                      job.duration_seconds = 8
                      job.error_message = 'Extension failed. 8s partial video saved.'
                    } catch (dlErr) {
                      console.error(`[VideoStatus/List] Failed to save partial video for ${job.id}:`, dlErr)
                      job.status = 'failed'
                      job.error_message = errorMsg
                    }
                  } else {
                    job.status = 'failed'
                    job.error_message = errorMsg
                  }
                  return
                }

                // Success — get video URI
                const videoUri = getVeoVideoUri(operation.response?.generatedVideos?.[0])
                console.log(`[VideoStatus/List] Veoext response for ${job.id}: videoUri=${videoUri || 'none'}`)
                if (!videoUri) {
                  console.error(`[VideoStatus/List] No video URI in completed veoext response for ${job.id}`)
                  return
                }

                const currentStep = job.extension_step || 0
                const totalExtensions = job.extension_total || 0

                // Need more extensions?
                if (currentStep < totalExtensions) {
                  try {
                    const newOpName = await triggerVeoExtension(videoUri, job.prompt)

                    const { data: updated } = await supabase
                      .from('video_generation_jobs')
                      .update({
                        extension_step: currentStep + 1,
                        sora_job_id: `veoext:${newOpName}`,
                        status: 'extending',
                        extension_video_uri: videoUri,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', job.id)
                      .eq('extension_step', currentStep)  // Optimistic concurrency
                      .select()
                      .single()

                    if (updated) {
                      job.status = 'extending'
                      job.extension_step = currentStep + 1
                      job.sora_job_id = `veoext:${newOpName}`
                      console.log(`[VideoStatus/List] Veo ext extension triggered: step ${currentStep + 1}/${totalExtensions} for ${job.id}`)
                    }
                  } catch (extErr) {
                    console.error(`[VideoStatus/List] Extension trigger failed for ${job.id}:`, extErr)
                    // Save partial on failure
                    try {
                      const partialUrl = await downloadAndStoreVeoVideo(videoUri, job.id, job.user_id, job.ad_account_id)
                      await supabase.from('video_generation_jobs')
                        .update({
                          status: 'complete', raw_video_url: partialUrl, duration_seconds: 8,
                          error_message: 'Extension failed. 8s partial video saved.',
                          extension_video_uri: videoUri,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', job.id)
                      await supabase.from('ai_generation_usage').insert({
                        user_id: job.user_id, generation_type: 'video', credit_cost: -25,
                        generation_label: 'Refund: Extension trigger failed',
                      })
                      job.status = 'complete'
                      job.raw_video_url = partialUrl
                      job.duration_seconds = 8
                    } catch { /* already logged */ }
                  }
                  return
                }

                // ALL DONE — download final video
                console.log(`[VideoStatus/List] ALL EXTENSIONS DONE for ${job.id}: step=${currentStep}, total=${totalExtensions}. Downloading final ${job.target_duration_seconds}s video...`)
                try {
                  const rawVideoUrl = await downloadAndStoreVeoVideo(videoUri, job.id, job.user_id, job.ad_account_id)

                  await supabase.from('video_generation_jobs')
                    .update({
                      status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl,
                      duration_seconds: job.target_duration_seconds || 15,
                      extension_video_uri: videoUri,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', job.id)

                  job.status = 'complete'
                  job.progress_pct = 100
                  job.raw_video_url = rawVideoUrl
                  job.duration_seconds = job.target_duration_seconds || 15
                  console.log(`[VideoStatus/List] Veo ext video complete: ${job.id}, ${job.target_duration_seconds}s, stored at ${rawVideoUrl}`)
                } catch (dlErr) {
                  console.error(`[VideoStatus/List] Error finalizing Veo ext video ${job.id}:`, dlErr)
                }
              }
              // If not done, nothing to update (Veo has no progress %)
            } else if (isRunwayJob(job.sora_job_id)) {
              // ── Runway Polling ────────────────────────────────────────────
              if (!process.env.RUNWAY_API_KEY) return

              const taskId = getRunwayTaskId(job.sora_job_id)
              const task = await pollRunwayTask(taskId)

              if (task.status === 'SUCCEEDED') {
                const videoUrl = task.output?.[0]
                if (!videoUrl) return

                try {
                  const rawVideoUrl = await downloadAndStoreRunwayVideo(videoUrl, job.id, job.user_id, job.ad_account_id)

                  await supabase.from('video_generation_jobs')
                    .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, updated_at: new Date().toISOString() })
                    .eq('id', job.id)

                  job.status = 'complete'
                  job.progress_pct = 100
                  job.raw_video_url = rawVideoUrl
                  console.log(`[VideoStatus/List] Runway video complete: ${job.id}, stored at ${rawVideoUrl}`)
                } catch (dlErr) {
                  console.error(`[VideoStatus/List] Error finalizing Runway video ${job.id}:`, dlErr)
                }
              } else if (task.status === 'FAILED') {
                const errorMsg = task.failure || task.failureReason || 'Runway generation failed'
                console.error(`[VideoStatus/List] Runway task failed for ${job.id}:`, errorMsg)

                await supabase.from('video_generation_jobs')
                  .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
                  .eq('id', job.id)

                await supabase.from('ai_generation_usage').insert({
                  user_id: job.user_id,
                  generation_type: 'video',
                  credit_cost: -(job.credit_cost || 0),
                  generation_label: 'Refund: Runway generation failed',
                })

                job.status = 'failed'
                job.error_message = errorMsg
              } else {
                // PENDING / THROTTLED / RUNNING — update progress if available
                const progress = typeof task.progress === 'number' ? Math.round(task.progress * 100) : 0
                job.progress_pct = progress
                if (progress > 0) {
                  await supabase.from('video_generation_jobs')
                    .update({ progress_pct: progress, updated_at: new Date().toISOString() })
                    .eq('id', job.id)
                }
              }
            } else if (isVeoJob(job.sora_job_id)) {
              // ── Veo Polling ──────────────────────────────────────────────
              if (!process.env.GOOGLE_GEMINI_API_KEY) return

              const operationName = getVeoOperationName(job.sora_job_id)
              const operation = await pollVeoOperation(operationName)

              if (operation.done) {
                if (operation.error || !operation.response?.generatedVideos?.length) {
                  const raiFiltered = operation.response?.raiMediaFilteredCount
                  const errorMsg = operation.error
                    ? (typeof operation.error === 'object' ? (operation.error.message || JSON.stringify(operation.error)) : String(operation.error))
                    : raiFiltered
                      ? `Content filtered: ${(operation.response?.raiMediaFilteredReasons || []).join(', ') || 'safety policy'}`
                      : 'No video returned from Veo'

                  console.error(`[VideoStatus/List] Veo job failed for ${job.id}:`, errorMsg)

                  await supabase.from('video_generation_jobs')
                    .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
                    .eq('id', job.id)

                  await supabase.from('ai_generation_usage').insert({
                    user_id: job.user_id,
                    generation_type: 'video',
                    credit_cost: -(job.credit_cost || 0),
                    generation_label: 'Refund: Veo generation failed',
                  })

                  job.status = 'failed'
                  job.error_message = errorMsg
                  return
                }

                // Success — download and store video
                const videoUri = getVeoVideoUri(operation.response?.generatedVideos?.[0])
                console.log(`[VideoStatus/List] Veo response for ${job.id}: videoUri=${videoUri || 'none'}`)
                if (!videoUri) {
                  console.error(`[VideoStatus/List] Veo completed but no URI for ${job.id}`)
                  return
                }

                try {
                  const rawVideoUrl = await downloadAndStoreVeoVideo(videoUri, job.id, job.user_id, job.ad_account_id)

                  await supabase.from('video_generation_jobs')
                    .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, extension_video_uri: videoUri, updated_at: new Date().toISOString() })
                    .eq('id', job.id)

                  job.status = 'complete'
                  job.progress_pct = 100
                  job.raw_video_url = rawVideoUrl
                  console.log(`[VideoStatus/List] Veo video complete: ${job.id}, stored at ${rawVideoUrl}, extensionUri=${videoUri}`)
                } catch (dlErr) {
                  console.error(`[VideoStatus/List] Error finalizing Veo video ${job.id}:`, dlErr)
                }
              }
              // If not done, nothing to update (Veo has no progress %)
            } else {
              // ── Sora Polling ─────────────────────────────────────────────
              if (!process.env.OPENAI_API_KEY) return

              const soraRes = await fetch(`https://api.openai.com/v1/videos/${job.sora_job_id}`, {
                headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
              })
              if (!soraRes.ok) return
              const soraJob = await soraRes.json()

              if (soraJob.status === 'completed') {
                try {
                  const contentRes = await fetch(`https://api.openai.com/v1/videos/${job.sora_job_id}/content`, {
                    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                  })
                  if (!contentRes.ok) {
                    console.error(`[VideoStatus/List] Video content expired/unavailable for ${job.id}: ${contentRes.status}`)
                    await supabase.from('video_generation_jobs')
                      .update({ status: 'failed', error_message: 'Video content expired — please re-generate', updated_at: new Date().toISOString() })
                      .eq('id', job.id)
                    await supabase.from('ai_generation_usage').insert({
                      user_id: job.user_id,
                      generation_type: 'video',
                      credit_cost: -(job.credit_cost || 0),
                      generation_label: 'Refund: Video content expired',
                    })
                    job.status = 'failed'
                    job.error_message = 'Video content expired — please re-generate'
                    return
                  }

                  const videoBuffer = Buffer.from(await contentRes.arrayBuffer())
                  const cleanAccountId = job.ad_account_id.replace(/^act_/, '')
                  const storagePath = `${job.user_id}/${cleanAccountId}/videos/${job.id}.mp4`

                  const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

                  if (uploadError) {
                    await supabase.storage
                      .from('media')
                      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
                  }

                  const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
                  const rawVideoUrl = publicUrlData?.publicUrl || null

                  await supabase.from('video_generation_jobs')
                    .update({ status: 'complete', progress_pct: 100, raw_video_url: rawVideoUrl, updated_at: new Date().toISOString() })
                    .eq('id', job.id)

                  job.status = 'complete'
                  job.progress_pct = 100
                  job.raw_video_url = rawVideoUrl
                  console.log(`[VideoStatus/List] Video complete: ${job.id}, stored at ${rawVideoUrl}`)
                } catch (dlErr) {
                  console.error(`[VideoStatus/List] Error finalizing video ${job.id}:`, dlErr)
                }
              } else if (soraJob.status === 'failed') {
                const errorMsg = soraJob.error?.message || 'Video generation failed'
                console.error(`[VideoStatus/List] Sora job failed for ${job.id}:`, errorMsg)

                await supabase.from('video_generation_jobs')
                  .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
                  .eq('id', job.id)

                await supabase.from('ai_generation_usage').insert({
                  user_id: job.user_id,
                  generation_type: 'video',
                  credit_cost: -(job.credit_cost || 0),
                  generation_label: 'Refund: Video generation failed',
                })

                job.status = 'failed'
                job.error_message = errorMsg
              } else {
                // Still processing — update progress
                const progress = typeof soraJob.progress === 'number' ? soraJob.progress : 0
                job.progress_pct = progress
                if (progress > 0) {
                  await supabase.from('video_generation_jobs')
                    .update({ progress_pct: progress, updated_at: new Date().toISOString() })
                    .eq('id', job.id)
                }
              }
            }
          } catch { /* ignore poll errors for individual jobs */ }
        }))
      }
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err) {
    console.error('[VideoStatus] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ── PATCH: Extend a completed veo-ext job by +7s ──────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const { jobId, userId } = await request.json()

    if (!jobId || !userId) {
      return NextResponse.json({ error: 'jobId and userId required' }, { status: 400 })
    }

    // Look up the job
    const { data: job, error: jobError } = await supabase
      .from('video_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'complete') {
      return NextResponse.json({ error: 'Job must be complete to extend' }, { status: 400 })
    }

    if (job.provider !== 'veo-ext' && job.provider !== 'veo') {
      return NextResponse.json({ error: 'Only Veo jobs can be extended' }, { status: 400 })
    }

    if (!job.extension_video_uri) {
      return NextResponse.json({ error: 'No extension video URI available — cannot extend' }, { status: 400 })
    }

    // Check credits (25 per extension)
    const extensionCreditCost = 25

    // Trigger the extension
    const newOpName = await triggerVeoExtension(job.extension_video_uri, job.prompt)

    const currentStep = job.extension_step || 0
    const currentTotal = job.extension_total || 0
    const currentDuration = job.target_duration_seconds || job.duration_seconds || 8

    // Update the job — upgrade provider to veo-ext if it was plain veo
    const { error: updateError } = await supabase
      .from('video_generation_jobs')
      .update({
        status: 'extending',
        provider: 'veo-ext',
        extension_step: currentStep,     // Will be incremented when extension completes
        extension_total: currentTotal + 1,
        target_duration_seconds: currentDuration + 7,
        sora_job_id: `veoext:${newOpName}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('[VideoStatus] PATCH update error:', updateError)
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    // Charge credits
    await supabase.from('ai_generation_usage').insert({
      user_id: userId,
      generation_type: 'video',
      credit_cost: extensionCreditCost,
      generation_label: `Veo 3.1 extension +7s (${currentDuration}s → ${currentDuration + 7}s)`,
    })

    console.log(`[VideoStatus] Manual extension triggered for ${jobId}: ${currentDuration}s → ${currentDuration + 7}s, op: ${newOpName}`)

    return NextResponse.json({
      jobId,
      status: 'extending',
      extension_step: currentStep,
      extension_total: currentTotal + 1,
      target_duration_seconds: currentDuration + 7,
      creditCost: extensionCreditCost,
    })
  } catch (err: any) {
    console.error('[VideoStatus] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'Extension failed' }, { status: 500 })
  }
}
