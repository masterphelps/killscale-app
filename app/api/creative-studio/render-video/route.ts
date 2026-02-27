import {
  addBundleToSandbox,
  createSandbox,
  renderMediaOnVercel,
  uploadToVercelBlob,
} from '@remotion/vercel'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { restoreSnapshot } from './restore-snapshot'
import { bundleRemotionProject, formatSSE, type RenderProgress } from './helpers'
import type { OverlayConfig } from '@/remotion/types'
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  if (!process.env.VERCEL) {
    return new Response(
      JSON.stringify({ error: 'Video export requires Vercel Sandbox and is only available in production. Deploy to Vercel to use this feature.' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    return new Response(
      JSON.stringify({ error: 'BLOB_READ_WRITE_TOKEN is not set. Create a Vercel Blob store and connect it to your project.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
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
        durationInSeconds = job.duration_seconds || 10
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
        durationInSeconds = comp.duration_seconds || durationInSeconds
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

      // ── Create sandbox ──
      await send({ type: 'phase', phase: 'Creating render environment...', progress: 0 })

      let sandbox: Awaited<ReturnType<typeof createSandbox>>
      let needsBundle = false

      if (process.env.VERCEL) {
        try {
          await send({ type: 'phase', phase: 'Restoring snapshot...', progress: 0.05 })
          sandbox = await restoreSnapshot()
          await send({ type: 'phase', phase: 'Snapshot restored', progress: 0.15 })
        } catch (snapshotErr) {
          const snapshotMsg = snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)
          await send({ type: 'phase', phase: `No snapshot (${snapshotMsg.slice(0, 80)}), creating fresh sandbox...`, progress: 0.05 })
          console.log('[RenderVideo] Snapshot restore failed:', snapshotMsg)
          sandbox = await createSandbox({
            onProgress: async ({ progress, message }) => {
              await send({ type: 'phase', phase: message, progress })
            },
          })
          needsBundle = true
        }
      } else {
        sandbox = await createSandbox({
          onProgress: async ({ progress, message }) => {
            await send({
              type: 'phase',
              phase: message,
              progress,
              subtitle: 'This is only needed during development.',
            })
          },
        })
        needsBundle = true
      }

      try {
        if (needsBundle) {
          // In dev, bundle at runtime. On Vercel, use pre-built bundle from build step.
          if (!process.env.VERCEL) {
            bundleRemotionProject('.remotion')
          }
          await send({ type: 'phase', phase: 'Uploading bundle to sandbox...', progress: 0.15 })
          await sandbox.mkDir('remotion-bundle')
          await addBundleToSandbox({ sandbox, bundleDir: '.remotion' })
        }

        // ── Render video ──
        const remotionCompId = selectCompositionId(videoWidth, videoHeight)
        await send({ type: 'phase', phase: 'Rendering video...', progress: 0.25 })

        let sandboxFilePath: string
        let renderContentType: string
        try {
          const result = await renderMediaOnVercel({
            sandbox,
            compositionId: remotionCompId,
            inputProps: {
              videoUrl,
              durationInSeconds,
              overlayConfig,
            },
            onProgress: async (update) => {
              switch (update.stage) {
                case 'opening-browser':
                  await send({ type: 'phase', phase: 'Opening browser...', progress: update.overallProgress })
                  break
                case 'selecting-composition':
                  await send({ type: 'phase', phase: 'Selecting composition...', progress: update.overallProgress })
                  break
                case 'render-progress':
                  await send({ type: 'phase', phase: 'Rendering video...', progress: update.overallProgress })
                  break
                default:
                  break
              }
            },
          })
          sandboxFilePath = result.sandboxFilePath
          renderContentType = result.contentType
        } catch (renderErr) {
          const msg = renderErr instanceof Error ? renderErr.message : String(renderErr)
          await send({ type: 'error', message: `[Render] ${msg}` })
          return
        }

        // ── Upload to Vercel Blob ──
        await send({ type: 'phase', phase: 'Uploading to blob...', progress: 0.9 })

        let blobUrl: string
        let size: number
        try {
          const blobResult = await uploadToVercelBlob({
            sandbox,
            sandboxFilePath,
            contentType: renderContentType,
            blobToken,
            access: 'public',
          })
          blobUrl = blobResult.url
          size = blobResult.size
        } catch (blobErr) {
          const msg = blobErr instanceof Error ? blobErr.message : String(blobErr)
          await send({ type: 'error', message: `[BlobUpload] ${msg}` })
          return
        }

        // ── Download from Blob → Upload to Supabase Storage ──
        await send({ type: 'phase', phase: 'Saving to storage...', progress: 0.95 })

        const cleanAccountId = adAccountId.replace(/^act_/, '')
        const storagePath = `${cleanAccountId}/videos/rendered/${overlayId}.mp4`

        let blobResponse: Response
        try {
          blobResponse = await fetch(blobUrl)
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          await send({ type: 'error', message: `[BlobDownload] fetch failed: ${msg} url=${blobUrl}` })
          return
        }

        if (!blobResponse.ok) {
          // Blob download failed — still save with blob URL directly
          console.error(`[RenderVideo] Blob download failed: ${blobResponse.status} from ${blobUrl}`)
          await supabaseAdmin
            .from('video_overlays')
            .update({ render_status: 'complete', rendered_video_url: blobUrl })
            .eq('id', overlayId)
          await send({ type: 'done', url: blobUrl, size })
          return
        }

        const videoBuffer = Buffer.from(await blobResponse.arrayBuffer())

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
        const renderedVideoUrl = publicUrlData?.publicUrl || blobUrl

        // ── Update overlay record ──
        await supabaseAdmin
          .from('video_overlays')
          .update({
            render_status: 'complete',
            rendered_video_url: renderedVideoUrl,
          })
          .eq('id', overlayId)

        await send({ type: 'done', url: renderedVideoUrl, size })
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
        await sandbox?.stop().catch(() => {})
        await writer.close()
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errDetail = JSON.stringify(err, Object.getOwnPropertyNames(err as object))
      console.error('[RenderVideo] Setup failed:', errDetail)
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
      await writer.close().catch(() => {})
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
