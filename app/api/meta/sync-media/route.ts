import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

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
 * Syncs all images and videos from a Meta ad account's media library
 * into the media_library table, then pushes URLs into ad_data rows.
 *
 * Called fire-and-forget from the main sync process.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId } = await request.json() as {
      userId: string
      adAccountId: string
    }

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
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
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // ─── Step A: Fetch all images ───────────────────────────────────────────

    console.log(`[Media Sync] Fetching images for act_${cleanAdAccountId}`)
    const allImages: MetaImage[] = []

    let imagesUrl: string | null =
      `${META_GRAPH_URL}/act_${cleanAdAccountId}/adimages?fields=hash,name,url,width,height&limit=200&access_token=${accessToken}`

    while (imagesUrl) {
      const res: Response = await fetch(imagesUrl)
      const data = await res.json()

      if (data.error) {
        console.error('[Media Sync] Images fetch error:', data.error)
        break
      }

      if (data.data && Array.isArray(data.data)) {
        for (const img of data.data) {
          allImages.push({
            hash: img.hash,
            name: img.name || 'Untitled',
            url: img.url || '',
            width: img.width || 0,
            height: img.height || 0,
          })
        }
      }

      imagesUrl = data.paging?.next || null
      if (imagesUrl) {
        await delay(1000)
      }
    }

    console.log(`[Media Sync] Fetched ${allImages.length} images`)

    // ─── Step B: Fetch all videos (2s delay after images) ───────────────────

    await delay(2000)

    console.log(`[Media Sync] Fetching videos for act_${cleanAdAccountId}`)
    const allVideos: MetaVideo[] = []

    let videosUrl: string | null =
      `${META_GRAPH_URL}/act_${cleanAdAccountId}/advideos?fields=id,title,thumbnails,length&limit=100&access_token=${accessToken}`

    while (videosUrl) {
      const res: Response = await fetch(videosUrl)
      const data = await res.json()

      if (data.error) {
        console.error('[Media Sync] Videos fetch error:', data.error)
        break
      }

      if (data.data && Array.isArray(data.data)) {
        for (const vid of data.data) {
          allVideos.push({
            id: vid.id,
            title: vid.title || 'Untitled Video',
            thumbnails: vid.thumbnails,
            length: vid.length || 0,
          })
        }
      }

      videosUrl = data.paging?.next || null
      if (videosUrl) {
        await delay(1000)
      }
    }

    console.log(`[Media Sync] Fetched ${allVideos.length} videos`)

    // ─── Step C: Upsert to media_library ────────────────────────────────────

    const now = new Date().toISOString()

    // Map images to media_library rows
    const imageRows: MediaLibraryRow[] = allImages.map(img => ({
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

    // Map videos to media_library rows
    const videoRows: MediaLibraryRow[] = allVideos.map(vid => {
      // Sort thumbnails by width descending and take the best one
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

    const allRows = [...imageRows, ...videoRows]

    // Upsert in batches of 200
    let upsertErrors = 0
    for (let i = 0; i < allRows.length; i += 200) {
      const batch = allRows.slice(i, i + 200)
      const { error: upsertError } = await supabaseAdmin
        .from('media_library')
        .upsert(batch, { onConflict: 'user_id,ad_account_id,media_hash' })

      if (upsertError) {
        console.error('[Media Sync] Upsert error (batch starting at index ' + i + '):', upsertError)
        upsertErrors++
      }
    }

    console.log(`[Media Sync] Upserted ${allRows.length} media rows (${upsertErrors} batch errors)`)

    // ─── Step C2: Resolve video derivatives in ad_data ────────────────────
    // Meta assigns derivative video IDs per placement. The main sync stores
    // creative.video_id (derivative) as ad_data.media_hash for videos.
    // media_library has original IDs from advideos. We resolve derivatives
    // so Creative Studio can join ad_data performance to media_library items.
    let derivativesResolved = 0
    let derivativesTotal = 0

    if (allVideos.length > 0) {
      const originalVideoIds = new Set(allVideos.map(v => v.id))

      // Get unique video hashes from ad_data that aren't in media_library
      // Override PostgREST 1000-row default — need all rows to find unique hashes
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
          .filter(id => !originalVideoIds.has(id))

        derivativesTotal = uniqueDerivatives.length

        if (uniqueDerivatives.length > 0) {
          console.log(`[Media Sync] Resolving ${uniqueDerivatives.length} video derivatives to originals`)

          // Fetch metadata (title, duration) for each derivative via Meta Batch API
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
          // Normalize titles: lowercase, strip file extensions and Meta DCO prefixes
          const normalizeTitle = (t: string): string => {
            return t
              .toLowerCase()
              .trim()
              .replace(/\.(mp4|mov|avi|mkv|webm|m4v|wmv)$/i, '')
              .replace(/^auto_cropped_ar_\d+_x_\d+_dco_/i, '')
              .trim()
          }

          // Build lookup maps with both raw and normalized titles
          const rawTitleToOriginals = new Map<string, MetaVideo[]>()
          const normTitleToOriginals = new Map<string, MetaVideo[]>()
          for (const vid of allVideos) {
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
            // Try raw title first (exact match minus case)
            const raw = title.toLowerCase().trim()
            let candidates = rawTitleToOriginals.get(raw) || []
            if (candidates.length === 1) return candidates[0]
            if (candidates.length > 1 && duration > 0) {
              const durMatch = candidates.find(c => Math.abs(c.length - duration) < 1)
              if (durMatch) return durMatch
            }

            // Try normalized title (strip extension + DCO prefix)
            const norm = normalizeTitle(title)
            if (!norm) return null
            candidates = normTitleToOriginals.get(norm) || []
            if (candidates.length === 1) return candidates[0]
            if (candidates.length > 1 && duration > 0) {
              const durMatch = candidates.find(c => Math.abs(c.length - duration) < 1)
              if (durMatch) return durMatch
            }

            // Try substring: if derivative title contains an original's normalized title
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

          for (const [derivId, meta] of Object.entries(derivMeta)) {
            const title = (meta.title || '').trim()
            if (!title) continue // Can't match without a title

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
            } else {
              console.log(`[Media Sync] No match for derivative ${derivId} title="${title}" len=${meta.length}`)
            }
          }

          console.log(`[Media Sync] Resolved ${derivativesResolved}/${uniqueDerivatives.length} video derivatives`)
        }
      }
    }

    await delay(1000)

    // ─── Step D: Push URLs into ad_data ─────────────────────────────────────

    let imageUrlsUpdated = 0
    let videoThumbsUpdated = 0

    // Fetch all media_library rows for this user+account
    const { data: mediaRows, error: mediaFetchError } = await supabaseAdmin
      .from('media_library')
      .select('media_hash, media_type, url, video_thumbnail_url')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAdAccountId)

    if (mediaFetchError) {
      console.error('[Media Sync] Failed to fetch media_library rows:', mediaFetchError)
    }

    if (mediaRows && mediaRows.length > 0) {
      // Build lookups
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
      for (const [hash, url] of Array.from(imageLookup)) {
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
      }

      // Update video thumbnail URLs in ad_data
      for (const [hash, thumbUrl] of Array.from(videoLookup)) {
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
      }
    }

    console.log(`[Media Sync] Updated ad_data: ${imageUrlsUpdated} image URLs, ${videoThumbsUpdated} video thumbnails`)

    return NextResponse.json({
      success: true,
      imageCount: allImages.length,
      videoCount: allVideos.length,
      upsertedMedia: allRows.length,
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
