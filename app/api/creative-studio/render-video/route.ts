import { renderMediaOnCloudrun } from '@remotion/cloudrun/client'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { formatSSE, type RenderProgress } from './helpers'
import type { OverlayConfig } from '@/remotion/types'
import { overlayConfigToRVEOverlays } from '@/lib/rve-bridge'

// Render can take several minutes — extend function lifetime (Vercel Pro w/ Fluid Compute: up to 800s)
export const maxDuration = 800

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Vercel stores PEM keys as single-line with literal "\n" text — OpenSSL needs real newlines
if (process.env.REMOTION_GCP_PRIVATE_KEY) {
  process.env.REMOTION_GCP_PRIVATE_KEY = process.env.REMOTION_GCP_PRIVATE_KEY.replace(/\\n/g, '\n')
}
// Diagnostic — remove after confirming auth works
console.log('[RenderVideo] GCP auth check:', {
  hasEmail: !!process.env.REMOTION_GCP_CLIENT_EMAIL,
  emailPrefix: process.env.REMOTION_GCP_CLIENT_EMAIL?.substring(0, 15),
  hasKey: !!process.env.REMOTION_GCP_PRIVATE_KEY,
  keyStart: process.env.REMOTION_GCP_PRIVATE_KEY?.substring(0, 30),
  hasProject: !!process.env.REMOTION_GCP_PROJECT_ID,
  project: process.env.REMOTION_GCP_PROJECT_ID,
})

/**
 * Determine the correct Remotion composition ID based on video dimensions.
 * Uses RVERender compositions (same Layer components as editor preview).
 * Falls back to vertical 9:16 (most common for ads).
 */
function selectCompositionId(width?: number, height?: number): string {
  if (!width || !height) return 'RVERender' // default 9:16
  const ratio = width / height
  if (ratio > 1.2) return 'RVERenderLandscape' // 16:9
  if (ratio > 0.85 && ratio < 1.15) return 'RVERenderSquare' // 1:1
  return 'RVERender' // 9:16
}

export async function POST(req: Request) {
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const serviceName = process.env.REMOTION_CLOUDRUN_SERVICE_NAME
  const directUrl = process.env.REMOTION_CLOUDRUN_URL
  const serveUrl = process.env.REMOTION_CLOUDRUN_SERVE_URL

  if ((!serviceName && !directUrl) || !serveUrl) {
    return new Response(
      JSON.stringify({ error: 'Remotion Cloud Run is not configured. Set REMOTION_CLOUDRUN_URL (or REMOTION_CLOUDRUN_SERVICE_NAME) and REMOTION_CLOUDRUN_SERVE_URL.' }),
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

      // ── Convert OverlayConfig → RVE Overlay[] (same format the editor preview uses) ──
      const rveOverlays = overlayConfigToRVEOverlays(overlayConfig, videoUrl, durationInSeconds, 30)
      console.log(`[RenderVideo] Converted overlayConfig → ${rveOverlays.length} RVE overlays`)

      // ── Render via Cloud Run ──
      const remotionCompId = selectCompositionId(videoWidth, videoHeight)
      const region = (process.env.REMOTION_GCP_REGION || 'us-east1') as 'us-east1'

      await send({ type: 'phase', phase: 'Sending to Cloud Run...', progress: 0.05 })

      let result: Awaited<ReturnType<typeof renderMediaOnCloudrun>>
      try {
        await send({ type: 'phase', phase: 'Rendering video...', progress: 0.1 })
        console.log(`[RenderVideo] Rendering composition=${remotionCompId}, region=${region}, service=${serviceName || directUrl}, overlays=${rveOverlays.length}`)
        result = await renderMediaOnCloudrun({
          region,
          // Use direct URL when available — bypasses getServiceInfo() which
          // requires Cloud Run Admin API permissions we may not have.
          // Falls back to serviceName for service discovery.
          ...(directUrl
            ? { cloudRunUrl: directUrl }
            : { serviceName: serviceName! }),
          serveUrl,
          composition: remotionCompId,
          codec: 'h264',
          inputProps: {
            overlays: rveOverlays,
            durationInSeconds,
          },
          privacy: 'public',
          // Skip getOrCreateBucket — the bucket already exists but its
          // multi-region location (US) doesn't match us-east1, causing
          // the SDK to try creating a new bucket which fails.
          forceBucketName: 'remotioncloudrun-qt8g0b2rc1',
          updateRenderProgress: (progress: number) => {
            // Map 0-1 Cloud Run progress to 10-90% band
            const mapped = 0.1 + progress * 0.8
            send({ type: 'phase', phase: 'Rendering video...', progress: mapped })
          },
        })
      } catch (renderErr) {
        let msg: string
        if (renderErr instanceof Error) {
          msg = renderErr.message
          console.error('[RenderVideo] Cloud Run render Error:', renderErr.message, renderErr.stack)
        } else if (typeof renderErr === 'object' && renderErr !== null) {
          msg = JSON.stringify(renderErr, Object.getOwnPropertyNames(renderErr), 2)
          console.error('[RenderVideo] Cloud Run render error object:', msg)
        } else {
          msg = String(renderErr)
          console.error('[RenderVideo] Cloud Run render error:', msg)
        }
        await send({ type: 'error', message: `[Render] ${msg}` })
        return
      }

      if (result.type === 'crash') {
        await send({ type: 'error', message: `[Render] Cloud Run crashed: ${result.message}` })
        return
      }

      const renderedPublicUrl = result.publicUrl
      const fileSize = result.size

      if (!renderedPublicUrl) {
        await send({ type: 'error', message: '[Render] No public URL returned from Cloud Run' })
        return
      }

      console.log(`[RenderVideo] Cloud Run complete: size=${fileSize}`)

      // ── Download from Cloud Run → Upload to Supabase Storage ──
      await send({ type: 'phase', phase: 'Saving to storage...', progress: 0.9 })

      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const storagePath = `${cleanAccountId}/videos/rendered/${overlayId}.mp4`

      let videoResponse: Response
      try {
        videoResponse = await fetch(renderedPublicUrl)
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        await send({ type: 'error', message: `[Download] Failed to download rendered video: ${msg}` })
        return
      }

      if (!videoResponse.ok) {
        await send({ type: 'error', message: `[Download] Failed to download rendered video (HTTP ${videoResponse.status})` })
        return
      }

      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

      if (videoBuffer.length < 10000) {
        console.error(`[RenderVideo] Downloaded only ${videoBuffer.length} bytes (expected ${fileSize})`)
        await send({ type: 'error', message: `[Download] Rendered file is corrupt (${videoBuffer.length} bytes). Please try rendering again.` })
        return
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from('media')
        .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })

      if (uploadError) {
        const { error: retryError } = await supabaseAdmin.storage
          .from('media')
          .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true })
        if (retryError) {
          console.error('[RenderVideo] Supabase upload failed after retry:', retryError)
          await send({ type: 'error', message: `[Upload] Failed to save rendered video to storage` })
          return
        }
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('media')
        .getPublicUrl(storagePath)
      const renderedVideoUrl = publicUrlData.publicUrl

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
