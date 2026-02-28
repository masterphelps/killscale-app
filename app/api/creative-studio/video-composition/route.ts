import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — Create a new composition
export async function POST(request: Request) {
  try {
    const { userId, canvasId, adAccountId, sourceJobIds, sourceLibraryIds, overlayConfig, title, name, thumbnailUrl, durationSeconds } = await request.json()

    if (!userId || !adAccountId || !overlayConfig) {
      console.log('[video-composition POST] missing fields:', { userId: !!userId, adAccountId: !!adAccountId, overlayConfig: !!overlayConfig })
      return NextResponse.json(
        { error: 'Missing required fields: userId, adAccountId, overlayConfig' },
        { status: 400 }
      )
    }

    // sourceJobIds or sourceLibraryIds are optional — compositions can be
    // created from direct video URLs where the source is in the overlayConfig

    const { data, error } = await supabaseAdmin
      .from('video_compositions')
      .insert({
        user_id: userId,
        canvas_id: canvasId || null,
        ad_account_id: adAccountId,
        source_job_ids: sourceJobIds || [],
        source_library_ids: sourceLibraryIds || null,
        overlay_config: overlayConfig,
        title: title || null,
        name: name || null,
        thumbnail_url: thumbnailUrl || null,
        duration_seconds: durationSeconds || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create composition:', error)
      return NextResponse.json({ error: 'Failed to create composition' }, { status: 500 })
    }

    return NextResponse.json({ compositionId: data.id })
  } catch (err) {
    console.error('video-composition POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET — List compositions for a canvas, or fetch a single composition
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const canvasId = searchParams.get('canvasId')
    const compositionId = searchParams.get('compositionId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Single composition fetch
    if (compositionId) {
      const { data, error } = await supabaseAdmin
        .from('video_compositions')
        .select('*')
        .eq('id', compositionId)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
      }

      return NextResponse.json({
        composition: {
          id: data.id,
          canvasId: data.canvas_id,
          sourceJobIds: data.source_job_ids,
          sourceLibraryIds: data.source_library_ids,
          overlayConfig: data.overlay_config,
          title: data.title,
          name: data.name,
          thumbnailUrl: data.thumbnail_url,
          durationSeconds: data.duration_seconds,
          createdAt: data.created_at,
          adAccountId: data.ad_account_id,
        },
      })
    }

    // List ALL compositions for a user+account (Projects tab)
    const adAccountId = searchParams.get('adAccountId')
    if (adAccountId && !canvasId) {
      const { data, error } = await supabaseAdmin
        .from('video_compositions')
        .select('*')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch compositions:', error)
        return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 })
      }

      // Fetch thumbnails from source jobs for display
      const allJobIds = (data || []).flatMap((c: any) => c.source_job_ids || []).filter(Boolean)
      const jobThumbnails = new Map<string, string>()
      if (allJobIds.length > 0) {
        const { data: jobs } = await supabaseAdmin
          .from('video_generation_jobs')
          .select('id, thumbnail_url')
          .in('id', Array.from(new Set(allJobIds)))
        if (jobs) {
          for (const j of jobs) {
            if (j.thumbnail_url) jobThumbnails.set(j.id, j.thumbnail_url)
          }
        }
      }

      // Also fetch latest rendered video URL per composition
      const compIds = (data || []).map((c: any) => c.id)
      const latestRenders = new Map<string, string>()
      if (compIds.length > 0) {
        const { data: overlays } = await supabaseAdmin
          .from('video_overlays')
          .select('composition_id, rendered_video_url, version')
          .in('composition_id', compIds)
          .eq('render_status', 'complete')
          .order('version', { ascending: false })
        if (overlays) {
          for (const o of overlays) {
            if (o.composition_id && o.rendered_video_url && !latestRenders.has(o.composition_id)) {
              latestRenders.set(o.composition_id, o.rendered_video_url)
            }
          }
        }
      }

      const compositions = (data || []).map((c: any) => {
        // Resolve thumbnail: composition's own → first source job's
        const firstJobId = c.source_job_ids?.[0]
        const thumbnailUrl = c.thumbnail_url || (firstJobId ? jobThumbnails.get(firstJobId) : null) || null
        return {
          id: c.id,
          canvasId: c.canvas_id,
          sourceJobIds: c.source_job_ids,
          sourceLibraryIds: c.source_library_ids,
          title: c.title,
          name: c.name,
          thumbnailUrl,
          renderedVideoUrl: latestRenders.get(c.id) || null,
          durationSeconds: c.duration_seconds,
          createdAt: c.created_at,
          adAccountId: c.ad_account_id,
        }
      })

      return NextResponse.json({ compositions })
    }

    // List compositions for a canvas
    if (!canvasId) {
      return NextResponse.json({ error: 'Missing canvasId or compositionId' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('video_compositions')
      .select('*')
      .eq('canvas_id', canvasId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch compositions:', error)
      return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 })
    }

    const compositions = (data || []).map((c: any) => ({
      id: c.id,
      canvasId: c.canvas_id,
      sourceJobIds: c.source_job_ids,
      sourceLibraryIds: c.source_library_ids,
      overlayConfig: c.overlay_config,
      title: c.title,
      name: c.name,
      thumbnailUrl: c.thumbnail_url,
      durationSeconds: c.duration_seconds,
      createdAt: c.created_at,
    }))

    return NextResponse.json({ compositions })
  } catch (err) {
    console.error('video-composition GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — Update a composition's overlay config or source jobs
export async function PATCH(request: Request) {
  try {
    const { compositionId, userId, overlayConfig, sourceJobIds, sourceLibraryIds, title, name, durationSeconds } = await request.json()

    if (!compositionId || !userId) {
      return NextResponse.json({ error: 'Missing compositionId and userId' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('video_compositions')
      .select('id')
      .eq('id', compositionId)
      .eq('user_id', userId)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (overlayConfig) updates.overlay_config = overlayConfig
    if (sourceJobIds) updates.source_job_ids = sourceJobIds
    if (sourceLibraryIds !== undefined) updates.source_library_ids = sourceLibraryIds
    if (title !== undefined) updates.title = title
    if (name !== undefined) updates.name = name
    if (durationSeconds !== undefined) updates.duration_seconds = durationSeconds

    const { error } = await supabaseAdmin
      .from('video_compositions')
      .update(updates)
      .eq('id', compositionId)

    if (error) {
      console.error('Failed to update composition:', error)
      return NextResponse.json({ error: 'Failed to update composition' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('video-composition PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — Remove a composition
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const compositionId = searchParams.get('compositionId')
    const userId = searchParams.get('userId')

    if (!compositionId || !userId) {
      return NextResponse.json({ error: 'Missing compositionId and userId' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('video_compositions')
      .select('id')
      .eq('id', compositionId)
      .eq('user_id', userId)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('video_compositions')
      .delete()
      .eq('id', compositionId)

    if (error) {
      console.error('Failed to delete composition:', error)
      return NextResponse.json({ error: 'Failed to delete composition' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('video-composition DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
