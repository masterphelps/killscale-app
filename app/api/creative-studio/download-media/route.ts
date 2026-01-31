import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Downloads FULL images and videos from Meta into Supabase Storage.
 * Processes a batch per invocation — client polls until done.
 *
 * Images: fetch bytes from permanent CDN url, upload to Supabase Storage
 * Videos: call Meta API /{video_id}?fields=source to get expiring source URL,
 *         then fetch(source) to download the FULL video file, upload to Supabase Storage
 *
 * Storage path: {user_id}/{ad_account_id}/{media_type}/{media_hash}.{ext}
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, batchSize = 5, retryFailed = false } = await request.json() as {
      userId: string
      adAccountId: string
      batchSize?: number
      retryFailed?: boolean
    }

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Reset failed items back to pending so they get retried
    if (retryFailed) {
      const { count: resetCount } = await supabase
        .from('media_library')
        .update({ download_status: 'pending' }, { count: 'exact' })
        .eq('user_id', userId)
        .eq('ad_account_id', cleanAccountId)
        .eq('download_status', 'failed')

      if (resetCount && resetCount > 0) {
        console.log(`[DownloadMedia] Reset ${resetCount} failed items to pending for retry`)
      }
    }

    // Get Meta access token (needed for video source URLs)
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (!connection || new Date(connection.token_expires_at) <= new Date()) {
      return NextResponse.json({ error: 'No valid Meta connection' }, { status: 401 })
    }

    // Get total counts for progress
    const { count: totalCount } = await supabase
      .from('media_library')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)

    const { count: completeCount } = await supabase
      .from('media_library')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .eq('download_status', 'complete')

    // Fetch next batch of pending items
    const { data: pendingItems, error: fetchError } = await supabase
      .from('media_library')
      .select('id, media_hash, media_type, url, video_thumbnail_url, name')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .or('download_status.eq.pending,download_status.is.null')
      .limit(batchSize)

    if (fetchError) {
      console.error('[DownloadMedia] Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch pending media' }, { status: 500 })
    }

    const totalItems = totalCount || 0
    const completed = completeCount || 0

    if (!pendingItems || pendingItems.length === 0) {
      // Push storage_url values into ad_data for performance table
      await pushStorageUrlsToAdData(userId, cleanAccountId)

      return NextResponse.json({
        processed: 0,
        completed,
        remaining: 0,
        totalItems,
        done: true,
      })
    }

    let processed = 0
    let newlyCompleted = 0

    for (const item of pendingItems) {
      try {
        let sourceUrl: string | null = null
        let isVideoFile = false

        if (item.media_type === 'video') {
          // Videos: call Meta API to get the expiring source URL for the FULL video
          const videoId = item.media_hash
          if (!videoId) {
            await markFailed(item.id)
            processed++
            continue
          }

          try {
            const metaRes = await fetch(
              `${META_GRAPH_URL}/${videoId}?fields=source&access_token=${connection.access_token}`
            )
            const metaData = await metaRes.json()

            if (metaData.error) {
              console.error(`[DownloadMedia] Meta API error for video ${videoId}:`, metaData.error.message)
              await markFailed(item.id)
              processed++
              // Rate limit between Meta API calls
              await delay(500)
              continue
            }

            sourceUrl = metaData.source || null
            isVideoFile = true
          } catch (metaErr) {
            console.error(`[DownloadMedia] Meta fetch error for video ${videoId}:`, metaErr)
            await markFailed(item.id)
            processed++
            await delay(500)
            continue
          }

          // Rate limit: 500ms between video source fetches (Meta API)
          await delay(500)
        } else {
          // Images: use the permanent CDN URL directly
          sourceUrl = item.url
        }

        if (!sourceUrl) {
          await markFailed(item.id)
          processed++
          continue
        }

        // Download the file
        const fileRes = await fetch(sourceUrl)
        if (!fileRes.ok) {
          console.error(`[DownloadMedia] Failed to fetch ${item.media_hash}: ${fileRes.status}`)
          await markFailed(item.id)
          processed++
          continue
        }

        const fileBuffer = await fileRes.arrayBuffer()
        const fileBytes = new Uint8Array(fileBuffer)

        // Determine content type and extension
        const contentType = fileRes.headers.get('content-type') || ''
        const ext = getExtension(contentType, item.media_type, isVideoFile)
        const mimeType = getMimeType(contentType, item.media_type, isVideoFile)

        // Storage path: {user_id}/{account_id}/{type}/{hash}.{ext}
        const storagePath = `${userId}/${cleanAccountId}/${item.media_type}/${item.media_hash}.${ext}`

        // Upload to Supabase Storage (public bucket "media")
        const { error: uploadError } = await supabase
          .storage
          .from('media')
          .upload(storagePath, fileBytes, {
            contentType: mimeType,
            upsert: true,
          })

        if (uploadError) {
          console.error(`[DownloadMedia] Upload error for ${item.media_hash}:`, uploadError)
          await markFailed(item.id)
          processed++
          continue
        }

        // Get the public URL
        const { data: publicUrlData } = supabase
          .storage
          .from('media')
          .getPublicUrl(storagePath)

        const storageUrl = publicUrlData?.publicUrl || null

        // Update media_library row
        await supabase
          .from('media_library')
          .update({
            storage_path: storagePath,
            storage_url: storageUrl,
            download_status: 'complete',
            file_size_bytes: fileBytes.length,
          })
          .eq('id', item.id)

        processed++
        newlyCompleted++
        console.log(`[DownloadMedia] ${item.media_type} ${item.media_hash}: ${(fileBytes.length / 1024 / 1024).toFixed(1)}MB → ${storagePath}`)
      } catch (itemErr) {
        console.error(`[DownloadMedia] Error processing ${item.media_hash}:`, itemErr)
        await markFailed(item.id)
        processed++
      }

      // Small delay between downloads to be gentle on memory
      if (processed < pendingItems.length) {
        await delay(200)
      }
    }

    const remaining = Math.max(0, totalItems - (completed + newlyCompleted))
    const done = remaining === 0

    // If done, push storage_url values into ad_data
    if (done) {
      await pushStorageUrlsToAdData(userId, cleanAccountId)
    }

    return NextResponse.json({
      processed,
      completed: completed + newlyCompleted,
      remaining,
      totalItems,
      done,
    })
  } catch (err) {
    console.error('[DownloadMedia] Error:', err)
    return NextResponse.json({ error: 'Download media failed' }, { status: 500 })
  }
}

async function markFailed(id: string) {
  await supabase
    .from('media_library')
    .update({ download_status: 'failed' })
    .eq('id', id)
}

/**
 * Push storage_url from media_library into matching ad_data rows.
 * This enables the performance table to use stored URLs.
 */
async function pushStorageUrlsToAdData(userId: string, cleanAccountId: string) {
  try {
    const { data: mediaRows } = await supabase
      .from('media_library')
      .select('media_hash, storage_url')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .eq('download_status', 'complete')
      .not('storage_url', 'is', null)

    if (!mediaRows || mediaRows.length === 0) return

    let updated = 0
    for (const row of mediaRows) {
      const { count } = await supabase
        .from('ad_data')
        .update({ storage_url: row.storage_url }, { count: 'exact' })
        .eq('user_id', userId)
        .eq('ad_account_id', `act_${cleanAccountId}`)
        .eq('media_hash', row.media_hash)

      updated += count || 0
    }

    console.log(`[DownloadMedia] Pushed storage_url to ${updated} ad_data rows`)

    // Second pass: fix video derivatives by linking via creative_id
    // Meta assigns derivative video IDs per placement — the same creative can have
    // multiple media_hash values across ad_data rows. Only originals exist in
    // media_library, so derivative rows get null storage_url from the first pass.
    // Fix by copying storage_url from sibling rows with the same creative_id.
    const { data: missingRows } = await supabase
      .from('ad_data')
      .select('id, creative_id, media_hash')
      .eq('user_id', userId)
      .eq('ad_account_id', `act_${cleanAccountId}`)
      .is('storage_url', null)
      .not('media_hash', 'is', null)
      .eq('media_type', 'video')

    if (missingRows && missingRows.length > 0) {
      const creativeIds = Array.from(new Set(missingRows.map(r => r.creative_id).filter(Boolean)))

      if (creativeIds.length > 0) {
        const { data: matchedRows } = await supabase
          .from('ad_data')
          .select('creative_id, storage_url')
          .eq('user_id', userId)
          .eq('ad_account_id', `act_${cleanAccountId}`)
          .in('creative_id', creativeIds)
          .not('storage_url', 'is', null)

        if (matchedRows && matchedRows.length > 0) {
          const creativeStorageMap = new Map(matchedRows.map(r => [r.creative_id, r.storage_url]))

          let derivativeUpdated = 0
          for (const row of missingRows) {
            const storageUrl = creativeStorageMap.get(row.creative_id)
            if (storageUrl) {
              await supabase
                .from('ad_data')
                .update({ storage_url: storageUrl })
                .eq('id', row.id)
              derivativeUpdated++
            }
          }

          if (derivativeUpdated > 0) {
            console.log(`[DownloadMedia] Fixed ${derivativeUpdated} derivative video rows via creative_id fallback`)
          }
        }
      }
    }
  } catch (err) {
    console.error('[DownloadMedia] Failed to push storage_url to ad_data:', err)
  }
}

function getExtension(contentType: string, mediaType: string, isVideoFile: boolean): string {
  if (isVideoFile) {
    if (contentType.includes('mp4')) return 'mp4'
    if (contentType.includes('webm')) return 'webm'
    if (contentType.includes('quicktime') || contentType.includes('mov')) return 'mov'
    return 'mp4' // default video extension
  }
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return mediaType === 'video' ? 'mp4' : 'jpg'
}

function getMimeType(contentType: string, mediaType: string, isVideoFile: boolean): string {
  // Use the actual content-type if it looks valid
  if (contentType && (contentType.startsWith('image/') || contentType.startsWith('video/'))) {
    return contentType.split(';')[0].trim()
  }
  // Fallback
  return isVideoFile || mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
}
