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
import { readdir } from 'fs/promises'
import path from 'path'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Recursively scan a directory for all subdirectory paths */
async function getBundleDirs(dir: string, base = ''): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      const rel = base ? `${base}/${e.name}` : e.name
      result.push(rel)
      result.push(...await getBundleDirs(path.join(dir, e.name), rel))
    }
  }
  return result
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

      // ── Create overlay record with render_status = 'rendering' ──
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
          // Pre-create ALL subdirectories inside the sandbox
          // (workaround: sandbox.mkDir isn't recursive, addBundleToSandbox fails on nested dirs)
          await send({ type: 'phase', phase: 'Preparing bundle...', progress: 0.1 })
          const bundlePath = path.join(process.cwd(), '.remotion')
          const dirs = await getBundleDirs(bundlePath)
          console.log(`[RenderVideo] Pre-creating ${dirs.length} dirs in sandbox...`)
          // Create dirs in sorted order so parents come before children
          for (const d of dirs.sort()) {
            try {
              await sandbox.mkDir(`remotion-bundle/${d}`)
            } catch (mkdirErr) {
              console.error(`[RenderVideo] mkDir failed for remotion-bundle/${d}:`, JSON.stringify(mkdirErr))
              // Try runCommand as fallback
              await sandbox.runCommand('mkdir', ['-p', `/vercel/sandbox/remotion-bundle/${d}`])
            }
          }
          await send({ type: 'phase', phase: 'Uploading bundle to sandbox...', progress: 0.2 })
          await addBundleToSandbox({ sandbox, bundleDir: '.remotion' })
        }

        // ── Render video ──
        const remotionCompId = selectCompositionId(videoWidth, videoHeight)

        const { sandboxFilePath, contentType } = await renderMediaOnVercel({
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

        // ── Upload to Vercel Blob ──
        await send({ type: 'phase', phase: 'Uploading video...', progress: 1 })

        const { url: blobUrl, size } = await uploadToVercelBlob({
          sandbox,
          sandboxFilePath,
          contentType,
          blobToken,
          access: 'public',
        })

        // ── Download from Blob → Upload to Supabase Storage ──
        await send({ type: 'phase', phase: 'Saving to storage...', progress: 1 })

        const cleanAccountId = adAccountId.replace(/^act_/, '')
        const storagePath = `${userId}/${cleanAccountId}/videos/rendered/${overlayId}.mp4`

        const blobResponse = await fetch(blobUrl)
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
          await supabaseAdmin
            .from('video_overlays')
            .update({ render_status: 'failed' })
            .eq('id', overlayId)
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
        await supabaseAdmin
          .from('video_overlays')
          .update({ render_status: 'failed' })
          .eq('id', overlayId)
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
