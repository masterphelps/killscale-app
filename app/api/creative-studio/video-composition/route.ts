import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — Create a new composition
export async function POST(request: Request) {
  try {
    const { userId, canvasId, adAccountId, sourceJobIds, overlayConfig, title, thumbnailUrl, durationSeconds } = await request.json()

    if (!userId || !canvasId || !adAccountId || !sourceJobIds?.length || !overlayConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, canvasId, adAccountId, sourceJobIds, overlayConfig' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('video_compositions')
      .insert({
        user_id: userId,
        canvas_id: canvasId,
        ad_account_id: adAccountId,
        source_job_ids: sourceJobIds,
        overlay_config: overlayConfig,
        title: title || null,
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
          overlayConfig: data.overlay_config,
          title: data.title,
          thumbnailUrl: data.thumbnail_url,
          durationSeconds: data.duration_seconds,
          createdAt: data.created_at,
          adAccountId: data.ad_account_id,
        },
      })
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
      overlayConfig: c.overlay_config,
      title: c.title,
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
    const { compositionId, userId, overlayConfig, sourceJobIds, title, durationSeconds } = await request.json()

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
    if (title !== undefined) updates.title = title
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
