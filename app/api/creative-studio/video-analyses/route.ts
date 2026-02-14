import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all video analyses for a user/account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const status = searchParams.get('status') // optional filter
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!userId || !adAccountId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, adAccountId' },
        { status: 400 }
      )
    }

    // List query: only fetch columns needed for cards (NOT full JSONB)
    // Full analysis/script_suggestions/transcript fetched on-demand via detail endpoint
    let query = supabase
      .from('video_analysis')
      .select('id, media_hash, status, analyzed_at, created_at, error_message', { count: 'exact' })
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: analyses, error, count } = await query

    if (error) {
      console.error('Error fetching video analyses:', error)
      return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
    }

    // Get media info for each analysis
    const mediaHashes = analyses?.map(a => a.media_hash) || []
    const strippedAccountId = adAccountId.replace(/^act_/, '')

    // Try media_library first
    const { data: mediaItems } = await supabase
      .from('media_library')
      .select('media_hash, name, video_thumbnail_url, storage_url')
      .eq('user_id', userId)
      .eq('ad_account_id', strippedAccountId)
      .in('media_hash', mediaHashes)

    const mediaMap = new Map(mediaItems?.map(m => [m.media_hash, m]) || [])

    // For hashes not found in media_library, try ad_data (by media_hash and video_id)
    // Prioritize rows that have storage_url (the actual Supabase video)
    const missingHashes = mediaHashes.filter(h => !mediaMap.has(h))
    if (missingHashes.length > 0) {
      // Try by media_hash — prefer rows with storage_url
      const { data: adRows } = await supabase
        .from('ad_data')
        .select('media_hash, ad_name, thumbnail_url, storage_url')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .in('media_hash', missingHashes)
        .order('storage_url', { ascending: false, nullsFirst: false })
        .limit(200)

      if (adRows) {
        for (const row of adRows) {
          if (row.media_hash && !mediaMap.has(row.media_hash)) {
            mediaMap.set(row.media_hash, {
              media_hash: row.media_hash,
              name: row.ad_name || 'Untitled Video',
              video_thumbnail_url: null,
              storage_url: row.storage_url || null,
            })
          } else if (row.media_hash && row.storage_url && mediaMap.has(row.media_hash)) {
            // Upgrade: if we already have an entry but without storage_url, use this one
            const existing = mediaMap.get(row.media_hash)
            if (existing && !existing.storage_url) {
              existing.storage_url = row.storage_url
            }
          }
        }
      }

      // Still missing or have no storage_url? Try by video_id (mediaHash might be a video_id)
      const stillMissing = missingHashes.filter(h => !mediaMap.has(h) || !mediaMap.get(h)?.storage_url)
      if (stillMissing.length > 0) {
        const { data: vidRows } = await supabase
          .from('ad_data')
          .select('video_id, ad_name, thumbnail_url, storage_url')
          .eq('user_id', userId)
          .eq('ad_account_id', adAccountId)
          .in('video_id', stillMissing)
          .order('storage_url', { ascending: false, nullsFirst: false })
          .limit(200)

        if (vidRows) {
          for (const row of vidRows) {
            if (row.video_id && row.storage_url) {
              const existing = mediaMap.get(row.video_id)
              if (!existing) {
                mediaMap.set(row.video_id, {
                  media_hash: row.video_id,
                  name: row.ad_name || 'Untitled Video',
                  video_thumbnail_url: null,
                  storage_url: row.storage_url,
                })
              } else if (!existing.storage_url) {
                // Upgrade: had entry from media_hash lookup but with null storage_url
                existing.storage_url = row.storage_url
                if (!existing.name || existing.name === 'Untitled Video') {
                  existing.name = row.ad_name || existing.name
                }
              }
            }
          }
        }
      }
    }

    // Format response - list view only (no full analysis/scripts/transcript)
    const formattedAnalyses = analyses?.map(a => {
      const media = mediaMap.get(a.media_hash)
      const overallScore = null // Fetched on detail view only now

      return {
        id: a.id,
        mediaHash: a.media_hash,
        videoName: media?.name || 'Untitled Video',
        thumbnailUrl: media?.storage_url || media?.video_thumbnail_url || null,
        storageUrl: media?.storage_url || null,
        overallScore,
        status: a.status,
        analyzedAt: a.analyzed_at,
        createdAt: a.created_at,
        errorMessage: a.error_message
      }
    }) || []

    return NextResponse.json({
      analyses: formattedAnalyses,
      total: count || 0
    })

  } catch (err) {
    console.error('Video analyses list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove a video analysis
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const analysisId = searchParams.get('analysisId')

    if (!userId || !analysisId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, analysisId' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('video_analysis')
      .delete()
      .eq('id', analysisId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting video analysis:', error)
      return NextResponse.json({ error: 'Failed to delete analysis' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Video analysis delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
