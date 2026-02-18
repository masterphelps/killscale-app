import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

const COOLDOWN_HOURS = 24

interface MetaImage {
  hash: string
  name: string
  url: string
  width: number
  height: number
}

interface MetaVideo {
  id: string
  title: string
  thumbnails?: {
    data: Array<{ uri: string; width: number; height: number }>
  }
  length: number
}

interface MediaLibraryRow {
  user_id: string
  ad_account_id: string
  media_hash: string
  media_type: 'image' | 'video'
  name: string
  url?: string
  video_thumbnail_url?: string
  width?: number
  height?: number
  synced_at: string
}

/**
 * Delta sync: fetches only NEW images/videos from Meta ad account media library.
 *
 * Params:
 *   - userId, adAccountId: required
 *   - force: boolean (default false). When false, enforces 24h cooldown.
 *     Main sync passes force=false; Creative Suite manual sync passes force=true.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, force = false } = await request.json() as {
      userId: string
      adAccountId: string
      force?: boolean
    }

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // ─── Cooldown check (auto-trigger only) ──────────────────────────────
    if (!force) {
      const { data: syncLog } = await supabaseAdmin
        .from('media_sync_log')
        .select('synced_at')
        .eq('user_id', userId)
        .eq('ad_account_id', cleanAdAccountId)
        .single()

      if (syncLog?.synced_at) {
        const lastSync = new Date(syncLog.synced_at)
        const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
        if (hoursSince < COOLDOWN_HOURS) {
          console.log(`[Media Sync] Skipped — cooldown active (${hoursSince.toFixed(1)}h since last sync)`)
          return NextResponse.json({ skipped: true, reason: 'cooldown', hoursSinceLastSync: hoursSince })
        }
      }
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      console.error('[Media Sync] Meta account not connected for user:', userId)
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      console.error('[Media Sync] Token expired for user:', userId)
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // ─── Get existing media hashes from media_library ──────────────────
    const { data: existingImages } = await supabaseAdmin
      .from('media_library')
      .select('media_hash')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAdAccountId)
      .eq('media_type', 'image')
      .limit(50000)

    const { data: existingVideos } = await supabaseAdmin
      .from('media_library')
      .select('media_hash')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAdAccountId)
      .eq('media_type', 'video')
      .limit(50000)

    const existingImageHashes = new Set((existingImages || []).map(r => r.media_hash))
    const existingVideoIds = new Set((existingVideos || []).map(r => r.media_hash))

    // ─── Step A: Lightweight image inventory ───────────────────────────
    console.log(`[Media Sync] Fetching image inventory for act_${cleanAdAccountId}`)
    const allImageHashes: string[] = []

    let imagesUrl: string | null =
      `${META_GRAPH_URL}/act_${cleanAdAccountId}/adimages?fields=hash&limit=500&access_token=${accessToken}`

    while (imagesUrl) {
      const res: Response = await fetch(imagesUrl)
      const data = await res.json()

      if (data.error) {
        console.error('[Media Sync] Images inventory error:', data.error)
        break
      }

      if (data.data && Array.isArray(data.data)) {
        for (const img of data.data) {
          if (img.hash) allImageHashes.push(img.hash)
        }
      }

      imagesUrl = data.paging?.next || null
      if (imagesUrl) await delay(500)
    }

    // Compute new image hashes
    const newImageHashes = allImageHashes.filter(h => !existingImageHashes.has(h))
    console.log(`[Media Sync] Image inventory: ${allImageHashes.length} total, ${newImageHashes.length} new`)

    // ─── Step A2: Fetch full details for new images only ───────────────
    const newImages: MetaImage[] = []

    if (newImageHashes.length > 0) {
      // Use Batch API to fetch full details for new images (batches of 50)
      for (let i = 0; i < newImageHashes.length; i += 50) {
        const batch = newImageHashes.slice(i, i + 50)
        const batchReqs = batch.map(hash => ({
          method: 'GET',
          relative_url: `act_${cleanAdAccountId}/adimages?fields=hash,name,url,width,height&hashes=${JSON.stringify([hash])}`
        }))

        try {
          const batchRes = await fetch(
            `${META_GRAPH_URL}/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${accessToken}&include_headers=false`,
            { method: 'POST' }
          )
          const batchData = await batchRes.json()

          if (Array.isArray(batchData)) {
            for (const resp of batchData) {
              if (resp.code === 200) {
                try {
                  const body = JSON.parse(resp.body)
                  if (body.data && Array.isArray(body.data)) {
                    for (const img of body.data) {
                      newImages.push({
                        hash: img.hash,
                        name: img.name || 'Untitled',
                        url: img.url || '',
                        width: img.width || 0,
                        height: img.height || 0,
                      })
                    }
                  }
                } catch { /* skip parse errors */ }
              }
            }
          }
        } catch (err) {
          console.error('[Media Sync] Batch image fetch error:', err)
        }

        if (i + 50 < newImageHashes.length) await delay(1000)
      }

      console.log(`[Media Sync] Fetched full details for ${newImages.length} new images`)
    }

    // ─── Step B: Lightweight video inventory ───────────────────────────
    await delay(1000)

    console.log(`[Media Sync] Fetching video inventory for act_${cleanAdAccountId}`)
    const allVideoIds: string[] = []

    let videosUrl: string | null =
      `${META_GRAPH_URL}/act_${cleanAdAccountId}/advideos?fields=id&limit=500&access_token=${accessToken}`

    while (videosUrl) {
      const res: Response = await fetch(videosUrl)
      const data = await res.json()

      if (data.error) {
        console.error('[Media Sync] Videos inventory error:', data.error)
        break
      }

      if (data.data && Array.isArray(data.data)) {
        for (const vid of data.data) {
          if (vid.id) allVideoIds.push(vid.id)
        }
      }

      videosUrl = data.paging?.next || null
      if (videosUrl) await delay(500)
    }

    // Compute new video IDs
    const newVideoIds = allVideoIds.filter(id => !existingVideoIds.has(id))
    console.log(`[Media Sync] Video inventory: ${allVideoIds.length} total, ${newVideoIds.length} new`)

    // ─── Step B2: Fetch full details for new videos only ───────────────
    const newVideos: MetaVideo[] = []

    if (newVideoIds.length > 0) {
      for (let i = 0; i < newVideoIds.length; i += 50) {
        const batch = newVideoIds.slice(i, i + 50)
        const batchReqs = batch.map(id => ({
          method: 'GET',
          relative_url: `${id}?fields=id,title,thumbnails,length`
        }))

        try {
          const batchRes = await fetch(
            `${META_GRAPH_URL}/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${accessToken}&include_headers=false`,
            { method: 'POST' }
          )
          const batchData = await batchRes.json()

          if (Array.isArray(batchData)) {
            for (const resp of batchData) {
              if (resp.code === 200) {
                try {
                  const body = JSON.parse(resp.body)
                  newVideos.push({
                    id: body.id,
                    title: body.title || 'Untitled Video',
                    thumbnails: body.thumbnails,
                    length: body.length || 0,
                  })
                } catch { /* skip parse errors */ }
              }
            }
          }
        } catch (err) {
          console.error('[Media Sync] Batch video fetch error:', err)
        }

        if (i + 50 < newVideoIds.length) await delay(1000)
      }

      console.log(`[Media Sync] Fetched full details for ${newVideos.length} new videos`)
    }

    // ─── Step C: Upsert only new items to media_library ────────────────
    const now = new Date().toISOString()

    const imageRows: MediaLibraryRow[] = newImages.map(img => ({
      user_id: userId,
      ad_account_id: cleanAdAccountId,
      media_hash: img.hash,
      media_type: 'image' as const,
      name: img.name,
      url: img.url,
      width: img.width,
      height: img.height,
      synced_at: now,
    }))

    const videoRows: MediaLibraryRow[] = newVideos.map(vid => {
      let bestThumbUri = ''
      let bestThumbWidth = 0
      let bestThumbHeight = 0

      if (vid.thumbnails?.data && vid.thumbnails.data.length > 0) {
        const sorted = [...vid.thumbnails.data].sort(
          (a, b) => (b.width || 0) - (a.width || 0)
        )
        bestThumbUri = sorted[0].uri || ''
        bestThumbWidth = sorted[0].width || 0
        bestThumbHeight = sorted[0].height || 0
      }

      return {
        user_id: userId,
        ad_account_id: cleanAdAccountId,
        media_hash: vid.id,
        media_type: 'video' as const,
        name: vid.title || 'Untitled Video',
        video_thumbnail_url: bestThumbUri,
        width: bestThumbWidth,
        height: bestThumbHeight,
        synced_at: now,
      }
    })

    const allNewRows = [...imageRows, ...videoRows]
    let upsertErrors = 0

    if (allNewRows.length > 0) {
      for (let i = 0; i < allNewRows.length; i += 200) {
        const batch = allNewRows.slice(i, i + 200)
        const { error: upsertError } = await supabaseAdmin
          .from('media_library')
          .upsert(batch, { onConflict: 'user_id,ad_account_id,media_hash' })

        if (upsertError) {
          console.error('[Media Sync] Upsert error (batch starting at index ' + i + '):', upsertError)
          upsertErrors++
        }
      }

      console.log(`[Media Sync] Upserted ${allNewRows.length} new media rows (${upsertErrors} batch errors)`)
    } else {
      console.log('[Media Sync] No new media to upsert')
    }

    // ─── Step C2: Resolve video derivatives in ad_data ─────────────────
    // Only run if there are new videos OR if force=true (manual sync)
    let derivativesResolved = 0
    let derivativesTotal = 0

    const shouldResolveDerivatives = newVideos.length > 0 || force
    // Build full video set: existing + new for derivative matching
    const allOriginalVideoIds = new Set(Array.from(existingVideoIds).concat(newVideos.map(v => v.id)))

    if (shouldResolveDerivatives && allOriginalVideoIds.size > 0) {
      // Get unique video hashes from ad_data that aren't in media_library
      const { data: adVideoRows } = await supabaseAdmin
        .from('ad_data')
        .select('media_hash')
        .eq('user_id', userId)
        .eq('ad_account_id', `act_${cleanAdAccountId}`)
        .eq('media_type', 'video')
        .not('media_hash', 'is', null)
        .limit(50000)

      if (adVideoRows && adVideoRows.length > 0) {
        const uniqueDerivatives = Array.from(new Set(adVideoRows.map(r => r.media_hash)))
          .filter(id => !allOriginalVideoIds.has(id))

        derivativesTotal = uniqueDerivatives.length

        if (uniqueDerivatives.length > 0) {
          console.log(`[Media Sync] Resolving ${uniqueDerivatives.length} video derivatives to originals`)

          // We need ALL original videos for title matching, not just new ones
          // Fetch titles for all originals from media_library
          const { data: allOrigRows } = await supabaseAdmin
            .from('media_library')
            .select('media_hash, name')
            .eq('user_id', userId)
            .eq('ad_account_id', cleanAdAccountId)
            .eq('media_type', 'video')
            .limit(50000)

          // Build a combined video list for matching (library rows + newly fetched)
          const allVideosForMatching: MetaVideo[] = []

          // Add existing library videos (we only have name, not length — use 0)
          if (allOrigRows) {
            for (const row of allOrigRows) {
              // Don't add duplicates of newly fetched videos
              if (!newVideoIds.includes(row.media_hash)) {
                allVideosForMatching.push({
                  id: row.media_hash,
                  title: row.name || 'Untitled Video',
                  length: 0,
                })
              }
            }
          }
          // Add newly fetched videos (have full metadata)
          allVideosForMatching.push(...newVideos)

          // Fetch metadata for derivatives via Meta Batch API
          const derivMeta: Record<string, { title: string; length: number }> = {}

          for (let i = 0; i < uniqueDerivatives.length; i += 50) {
            const batch = uniqueDerivatives.slice(i, i + 50)
            const batchReqs = batch.map(id => ({
              method: 'GET',
              relative_url: `${id}?fields=id,title,length`
            }))

            try {
              const batchRes = await fetch(
                `${META_GRAPH_URL}/?batch=${encodeURIComponent(JSON.stringify(batchReqs))}&access_token=${accessToken}&include_headers=false`,
                { method: 'POST' }
              )
              const batchData = await batchRes.json()

              if (Array.isArray(batchData)) {
                for (const resp of batchData) {
                  if (resp.code === 200) {
                    try {
                      const body = JSON.parse(resp.body)
                      derivMeta[body.id] = {
                        title: body.title || '',
                        length: parseFloat(body.length) || 0
                      }
                    } catch { /* skip parse errors */ }
                  }
                }
              }
            } catch (err) {
              console.error('[Media Sync] Batch derivative fetch error:', err)
            }

            if (i + 50 < uniqueDerivatives.length) await delay(1000)
          }

          // Match derivatives to originals by title + duration
          const normalizeTitle = (t: string): string => {
            return t
              .toLowerCase()
              .trim()
              .replace(/\.(mp4|mov|avi|mkv|webm|m4v|wmv)$/i, '')
              .replace(/^auto_cropped_ar_\d+_x_\d+_dco_/i, '')
              .trim()
          }

          const rawTitleToOriginals = new Map<string, MetaVideo[]>()
          const normTitleToOriginals = new Map<string, MetaVideo[]>()
          for (const vid of allVideosForMatching) {
            const raw = (vid.title || '').toLowerCase().trim()
            const norm = normalizeTitle(vid.title || '')
            if (raw) {
              if (!rawTitleToOriginals.has(raw)) rawTitleToOriginals.set(raw, [])
              rawTitleToOriginals.get(raw)!.push(vid)
            }
            if (norm) {
              if (!normTitleToOriginals.has(norm)) normTitleToOriginals.set(norm, [])
              normTitleToOriginals.get(norm)!.push(vid)
            }
          }

          const findMatch = (title: string, duration: number): MetaVideo | null => {
            const raw = title.toLowerCase().trim()
            let candidates = rawTitleToOriginals.get(raw) || []
            if (candidates.length === 1) return candidates[0]
            if (candidates.length > 1 && duration > 0) {
              const durMatch = candidates.find(c => Math.abs(c.length - duration) < 1)
              if (durMatch) return durMatch
            }

            const norm = normalizeTitle(title)
            if (!norm) return null
            candidates = normTitleToOriginals.get(norm) || []
            if (candidates.length === 1) return candidates[0]
            if (candidates.length > 1 && duration > 0) {
              const durMatch = candidates.find(c => Math.abs(c.length - duration) < 1)
              if (durMatch) return durMatch
            }

            for (const [origNorm, vids] of Array.from(normTitleToOriginals)) {
              if (norm.includes(origNorm) || origNorm.includes(norm)) {
                if (vids.length === 1) return vids[0]
                if (vids.length > 1 && duration > 0) {
                  const durMatch = vids.find(c => Math.abs(c.length - duration) < 1)
                  if (durMatch) return durMatch
                }
              }
            }

            return null
          }

          const derivEntries = Object.entries(derivMeta)
          for (let di = 0; di < derivEntries.length; di++) {
            const [derivId, meta] = derivEntries[di]
            const title = (meta.title || '').trim()
            if (!title) continue

            const match = findMatch(title, meta.length)

            if (match) {
              const { error: updateErr } = await supabaseAdmin
                .from('ad_data')
                .update({ media_hash: match.id })
                .eq('user_id', userId)
                .eq('ad_account_id', `act_${cleanAdAccountId}`)
                .eq('media_hash', derivId)

              if (!updateErr) derivativesResolved++
              else console.error(`[Media Sync] Failed to update derivative ${derivId}:`, updateErr)
            }

            if ((di + 1) % 10 === 0) await delay(200)
          }

          console.log(`[Media Sync] Resolved ${derivativesResolved}/${uniqueDerivatives.length} video derivatives`)
        }
      }
    } else if (!shouldResolveDerivatives) {
      console.log('[Media Sync] Skipping derivative resolution (no new videos and not forced)')
    }

    await delay(500)

    // ─── Step D: Push URLs into ad_data (only for new media) ──────────
    let imageUrlsUpdated = 0
    let videoThumbsUpdated = 0

    if (allNewRows.length > 0 || force) {
      // When force=true, push all media URLs (full refresh)
      // When delta, only push newly synced hashes
      const hashesToPush = force
        ? null // null = push all
        : new Set([...newImages.map(i => i.hash), ...newVideos.map(v => v.id)])

      // Fetch relevant media_library rows
      let mediaQuery = supabaseAdmin
        .from('media_library')
        .select('media_hash, media_type, url, video_thumbnail_url')
        .eq('user_id', userId)
        .eq('ad_account_id', cleanAdAccountId)

      if (hashesToPush) {
        // Only fetch the new hashes
        mediaQuery = mediaQuery.in('media_hash', Array.from(hashesToPush))
      }

      const { data: mediaRows, error: mediaFetchError } = await mediaQuery

      if (mediaFetchError) {
        console.error('[Media Sync] Failed to fetch media_library rows:', mediaFetchError)
      }

      if (mediaRows && mediaRows.length > 0) {
        const imageLookup = new Map<string, string>()
        const videoLookup = new Map<string, string>()

        for (const row of mediaRows) {
          if (row.media_type === 'image' && row.url) {
            imageLookup.set(row.media_hash, row.url)
          }
          if (row.media_type === 'video' && row.video_thumbnail_url) {
            videoLookup.set(row.media_hash, row.video_thumbnail_url)
          }
        }

        // Update image URLs in ad_data
        const imageEntries = Array.from(imageLookup)
        for (let i = 0; i < imageEntries.length; i++) {
          const [hash, url] = imageEntries[i]
          const { error: updateError, count } = await supabaseAdmin
            .from('ad_data')
            .update({ image_url: url }, { count: 'exact' })
            .eq('user_id', userId)
            .eq('ad_account_id', `act_${cleanAdAccountId}`)
            .eq('media_hash', hash)

          if (updateError) {
            console.error(`[Media Sync] Failed to update image_url for hash ${hash}:`, updateError)
          } else {
            imageUrlsUpdated += count || 0
          }

          if ((i + 1) % 10 === 0) await delay(200)
        }

        // Update video thumbnail URLs in ad_data
        const videoEntries = Array.from(videoLookup)
        for (let i = 0; i < videoEntries.length; i++) {
          const [hash, thumbUrl] = videoEntries[i]
          const { error: updateError, count } = await supabaseAdmin
            .from('ad_data')
            .update({ thumbnail_url: thumbUrl }, { count: 'exact' })
            .eq('user_id', userId)
            .eq('ad_account_id', `act_${cleanAdAccountId}`)
            .eq('media_hash', hash)

          if (updateError) {
            console.error(`[Media Sync] Failed to update thumbnail_url for hash ${hash}:`, updateError)
          } else {
            videoThumbsUpdated += count || 0
          }

          if ((i + 1) % 10 === 0) await delay(200)
        }
      }
    } else {
      console.log('[Media Sync] No new media — skipping ad_data URL push')
    }

    console.log(`[Media Sync] Updated ad_data: ${imageUrlsUpdated} image URLs, ${videoThumbsUpdated} video thumbnails`)

    // ─── Step E: Update sync log ──────────────────────────────────────
    const { error: logError } = await supabaseAdmin
      .from('media_sync_log')
      .upsert({
        user_id: userId,
        ad_account_id: cleanAdAccountId,
        synced_at: now,
        image_count: allImageHashes.length,
        video_count: allVideoIds.length,
        new_images: newImages.length,
        new_videos: newVideos.length,
      }, { onConflict: 'user_id,ad_account_id' })

    if (logError) {
      console.error('[Media Sync] Failed to update sync log:', logError)
    }

    console.log(`[Media Sync] Delta: ${newImages.length} new images, ${newVideos.length} new videos out of ${allImageHashes.length + allVideoIds.length} total`)

    return NextResponse.json({
      success: true,
      imageCount: allImageHashes.length,
      videoCount: allVideoIds.length,
      newImages: newImages.length,
      newVideos: newVideos.length,
      upsertedMedia: allNewRows.length,
      derivativesResolved,
      derivativesTotal,
      updatedAds: {
        imageUrls: imageUrlsUpdated,
        videoThumbnails: videoThumbsUpdated,
      },
    })
  } catch (err) {
    console.error('[Media Sync] Error:', err)
    return NextResponse.json({ error: 'Media sync failed' }, { status: 500 })
  }
}
