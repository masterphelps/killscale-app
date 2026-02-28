import { renderMediaOnCloudrun } from '@remotion/cloudrun/client'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { formatSSE, type RenderProgress } from './helpers'
import type { OverlayConfig } from '@/remotion/types'

// Render can take several minutes — extend function lifetime (Vercel Pro w/ Fluid Compute: up to 800s)
export const maxDuration = 800

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Bridge existing GCP env vars to REMOTION_GCP_* format if needed
if (process.env.GCP_SERVICE_ACCOUNT_EMAIL && !process.env.REMOTION_GCP_CLIENT_EMAIL) {
  process.env.REMOTION_GCP_CLIENT_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL
}
if (process.env.GCP_SERVICE_ACCOUNT_KEY && !process.env.REMOTION_GCP_PRIVATE_KEY) {
  // Convert literal \n to real newlines (Vercel stores PEM keys with escaped newlines)
  process.env.REMOTION_GCP_PRIVATE_KEY = process.env.GCP_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n')
}
if (process.env.GOOGLE_CLOUD_PROJECT && !process.env.REMOTION_GCP_PROJECT_ID) {
  process.env.REMOTION_GCP_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT
}

/**
 * Determine the correct Remotion composition ID based on video dimensions.
 * Falls back to vertical 9:16 (most common for ads).
 */
function selectCompositionId(width?: number, height?: number): string {
  if (!width || !height) return 'AdOverlay' // default 9:16
  const ratio = width / height
  if (ratio > 1.2) return 'AdOverlayLandscape' // 16:9
  if (ratio > 0.85 && ratio < 1.15) return 'AdOverlaySquare' // 1:1
  return 'AdOverlay' // 9:16
}

export async function POST(req: Request) {
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const serviceName = process.env.REMOTION_CLOUDRUN_SERVICE_NAME
  const serveUrl = process.env.REMOTION_CLOUDRUN_SERVE_URL

  if (!serviceName || !serveUrl) {
    return new Response(
      JSON.stringify({ error: 'Remotion Cloud Run is not configured. Set REMOTION_CLOUDRUN_SERVICE_NAME and REMOTION_CLOUDRUN_SERVE_URL.' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: {
    videoJobId?: string
    compositionId?: string
    overlayConfig: OverlayConfig
    userId: string
    adAccountId: string
    videoUrl?: string
    durationInSeconds?: number
    width?: number
    height?: number
    overlayId?: string
  }

  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { overlayConfig, userId, adAccountId, videoJobId, compositionId } = body

  if (!overlayConfig || !userId || !adAccountId) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: overlayConfig, userId, adAccountId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!videoJobId && !compositionId && !body.videoUrl) {
    return new Response(
      JSON.stringify({ error: 'Must provide videoJobId, compositionId, or videoUrl' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const send = async (message: RenderProgress) => {
    try {
      await writer.write(encoder.encode(formatSSE(message)))
    } catch {
      // Client disconnected — SSE write fails silently
    }
  }

  const runRender = async () => {
    let overlayId: string | null = null

    try {
      // ── Resolve video URL and duration ──
      let videoUrl = body.videoUrl || ''
      let durationInSeconds = body.durationInSeconds || 10
      let videoWidth = body.width
      let videoHeight = body.height

      if (videoJobId) {
        const { data: job, error: jobError } = await supabaseAdmin
          .from('video_generation_jobs')
          .select('id, user_id, raw_video_url, duration_seconds, ad_account_id')
          .eq('id', videoJobId)
          .single()

        if (jobError || !job) {
          await send({ type: 'error', message: 'Video job not found' })
          return
        }
        if (job.user_id !== userId) {
          await send({ type: 'error', message: 'Unauthorized' })
          return
        }
        videoUrl = job.raw_video_url || ''
        // Only use DB duration as fallback — client sends actual timeline duration
        if (!body.durationInSeconds) durationInSeconds = job.duration_seconds || 10
      } else if (compositionId) {
        const { data: comp, error: compError } = await supabaseAdmin
          .from('video_compositions')
          .select('id, user_id, source_job_ids, duration_seconds')
          .eq('id', compositionId)
          .single()

        if (compError || !comp) {
          await send({ type: 'error', message: 'Composition not found' })
          return
        }
        if (comp.user_id !== userId) {
          await send({ type: 'error', message: 'Unauthorized' })
          return
        }

        // Get first source job's video URL
        if (comp.source_job_ids?.length) {
          const { data: firstJob } = await supabaseAdmin
            .from('video_generation_jobs')
            .select('raw_video_url, duration_seconds')
            .eq('id', comp.source_job_ids[0])
            .single()
          if (firstJob?.raw_video_url) {
            videoUrl = firstJob.raw_video_url
          }
        }
        // Only use DB duration as fallback — client sends actual timeline duration
        if (!body.durationInSeconds) durationInSeconds = comp.duration_seconds || durationInSeconds
      }

      if (!videoUrl) {
        await send({ type: 'error', message: 'No video URL found' })
        return
      }

      // ── Create or update overlay record with render_status = 'rendering' ──
      if (body.overlayId) {
        // Update existing overlay row — re-render an existing version
        const { data: existingOverlay, error: existingError } = await supabaseAdmin
          .from('video_overlays')
          .update({
            render_status: 'rendering',
            overlay_config: overlayConfig,
            rendered_video_url: null,
          })
          .eq('id', body.overlayId)
          .eq('user_id', userId)
          .select('id')
          .single()

        if (existingError || !existingOverlay) {
          console.error('Failed to update existing overlay record:', existingError)
          await send({ type: 'error', message: 'Overlay version not found or unauthorized' })
          return
        }
        overlayId = existingOverlay.id
      } else {
        // Create new overlay row — existing behavior
        const parentField = compositionId
          ? { composition_id: compositionId, video_job_id: null }
          : videoJobId
            ? { video_job_id: videoJobId, composition_id: null }
            : { video_job_id: null, composition_id: null }

        // Get next version number
        const versionFilter = compositionId
          ? { composition_id: compositionId }
          : videoJobId
            ? { video_job_id: videoJobId }
            : null

        let nextVersion = 1
        if (versionFilter) {
          const filterKey = Object.keys(versionFilter)[0]
          const filterVal = Object.values(versionFilter)[0]
          const { data: maxVersionRow } = await supabaseAdmin
            .from('video_overlays')
            .select('version')
            .eq(filterKey, filterVal)
            .order('version', { ascending: false })
            .limit(1)
            .single()
          nextVersion = (maxVersionRow?.version ?? 0) + 1
        }

        const { data: overlay, error: overlayError } = await supabaseAdmin
          .from('video_overlays')
          .insert({
            ...parentField,
            user_id: userId,
            version: nextVersion,
            overlay_config: overlayConfig,
            render_status: 'rendering',
          })
          .select('id')
          .single()

        if (overlayError || !overlay) {
          console.error('Failed to create overlay record:', overlayError)
          await send({ type: 'error', message: 'Failed to create render record' })
          return
        }
        overlayId = overlay.id
      }

      // ── Render via Cloud Run ──
      const remotionCompId = selectCompositionId(videoWidth, videoHeight)
      const region = (process.env.REMOTION_GCP_REGION || 'us-east1') as 'us-east1'

      await send({ type: 'phase', phase: 'Sending to Cloud Run...', progress: 0.05 })

      let result: Awaited<ReturnType<typeof renderMediaOnCloudrun>>
      try {
        await send({ type: 'phase', phase: 'Rendering video...', progress: 0.1 })
        result = await renderMediaOnCloudrun({
          region,
          serviceName,
          serveUrl,
          composition: remotionCompId,
          codec: 'h264',
          inputProps: {
            videoUrl,
            durationInSeconds,
            overlayConfig,
          },
          privacy: 'public',
          updateRenderProgress: (progress: number) => {
            // Map 0-1 Cloud Run progress to 10-90% band
            const mapped = 0.1 + progress * 0.8
            send({ type: 'phase', phase: 'Rendering video...', progress: mapped })
          },
        })
      } catch (renderErr) {
        const msg = renderErr instanceof Error ? renderErr.message : String(renderErr)
        await send({ type: 'error', message: `[Render] ${msg}` })
        return
      }

      if (result.type === 'crash') {
        await send({ type: 'error', message: `[Render] Cloud Run crashed: ${result.message}` })
        return
      }

      const cloudRunUrl = result.publicUrl
      const fileSize = result.size

      if (!cloudRunUrl) {
        await send({ type: 'error', message: '[Render] No public URL returned from Cloud Run' })
        return
      }

      // ── Download from Cloud Run → Upload to Supabase Storage ──
      await send({ type: 'phase', phase: 'Saving to storage...', progress: 0.9 })

      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const storagePath = `${cleanAccountId}/videos/rendered/${overlayId}.mp4`

      let videoResponse: Response
      try {
        videoResponse = await fetch(cloudRunUrl)
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        await send({ type: 'error', message: `[Download] fetch failed: ${msg} url=${cloudRunUrl}` })
        return
      }

      if (!videoResponse.ok) {
        // Download failed — still save with Cloud Run URL directly
        console.error(`[RenderVideo] Cloud Run download failed: ${videoResponse.status} from ${cloudRunUrl}`)
        await supabaseAdmin
          .from('video_overlays')
          .update({ render_status: 'complete', rendered_video_url: cloudRunUrl })
          .eq('id', overlayId)
        await send({ type: 'done', url: cloudRunUrl, size: fileSize })
        return
      }

      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

      const { error: uploadError } = await supabaseAdmin.storage
        .from('media')
        .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

      if (uploadError) {
        // Retry once
        const { error: retryError } = await supabaseAdmin.storage
          .from('media')
          .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
        if (retryError) {
          console.error('[RenderVideo] Supabase upload retry failed:', retryError)
        }
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('media')
        .getPublicUrl(storagePath)
      const renderedVideoUrl = publicUrlData?.publicUrl || cloudRunUrl

      // ── Update overlay record ──
      await supabaseAdmin
        .from('video_overlays')
        .update({
          render_status: 'complete',
          rendered_video_url: renderedVideoUrl,
        })
        .eq('id', overlayId)

      await send({ type: 'done', url: renderedVideoUrl, size: fileSize })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errDetail = JSON.stringify(err, Object.getOwnPropertyNames(err as object))
      console.error('[RenderVideo] Render failed:', errDetail)
      if (overlayId) {
        if (body.overlayId) {
          // Existing version — mark as failed, don't delete
          await supabaseAdmin
            .from('video_overlays')
            .update({ render_status: 'failed' })
            .eq('id', overlayId)
        } else {
          // Newly created version — delete the orphaned row
          await supabaseAdmin
            .from('video_overlays')
            .delete()
            .eq('id', overlayId)
        }
      }
      await send({ type: 'error', message: errMsg })
    } finally {
      await writer.close()
    }
  }

  waitUntil(runRender())

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
