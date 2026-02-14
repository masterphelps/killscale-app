import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { videoJobId, compositionId, overlayConfig, userId } = await request.json()

    if (!overlayConfig || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: overlayConfig, userId' },
        { status: 400 }
      )
    }

    // Exactly one of videoJobId or compositionId must be provided
    if ((!videoJobId && !compositionId) || (videoJobId && compositionId)) {
      return NextResponse.json(
        { error: 'Provide exactly one of videoJobId or compositionId' },
        { status: 400 }
      )
    }

    if (compositionId) {
      // ── Composition mode ──
      const { data: comp, error: compError } = await supabaseAdmin
        .from('video_compositions')
        .select('id, user_id')
        .eq('id', compositionId)
        .single()

      if (compError || !comp) {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
      }
      if (comp.user_id !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Next version number
      const { data: maxVersionRow } = await supabaseAdmin
        .from('video_overlays')
        .select('version')
        .eq('composition_id', compositionId)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      const nextVersion = (maxVersionRow?.version ?? 0) + 1

      // Insert overlay version
      const { data: overlay, error: insertError } = await supabaseAdmin
        .from('video_overlays')
        .insert({
          composition_id: compositionId,
          video_job_id: null,
          user_id: userId,
          version: nextVersion,
          overlay_config: overlayConfig,
          render_status: 'saved',
        })
        .select('id, version')
        .single()

      if (insertError || !overlay) {
        console.error('Failed to insert composition overlay:', insertError)
        return NextResponse.json({ error: 'Failed to save overlay config' }, { status: 500 })
      }

      // Update the composition's overlay_config
      const { error: updateError } = await supabaseAdmin
        .from('video_compositions')
        .update({ overlay_config: overlayConfig, updated_at: new Date().toISOString() })
        .eq('id', compositionId)

      if (updateError) {
        console.error('Failed to update composition overlay_config:', updateError)
      }

      return NextResponse.json({
        overlayId: overlay.id,
        version: overlay.version,
        status: 'saved',
      })
    }

    // ── Single job mode (existing logic) ──
    const { data: job, error: jobError } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id, user_id')
      .eq('id', videoJobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Video job not found' }, { status: 404 })
    }

    if (job.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized: job does not belong to this user' }, { status: 403 })
    }

    // Calculate next version number
    const { data: maxVersionRow } = await supabaseAdmin
      .from('video_overlays')
      .select('version')
      .eq('video_job_id', videoJobId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = (maxVersionRow?.version ?? 0) + 1

    // Insert into video_overlays
    const { data: overlay, error: insertError } = await supabaseAdmin
      .from('video_overlays')
      .insert({
        video_job_id: videoJobId,
        user_id: userId,
        version: nextVersion,
        overlay_config: overlayConfig,
        render_status: 'saved',
      })
      .select('id, version')
      .single()

    if (insertError || !overlay) {
      console.error('Failed to insert overlay:', insertError)
      return NextResponse.json({ error: 'Failed to save overlay config' }, { status: 500 })
    }

    // Update the job's overlay_config with the latest
    const { error: updateError } = await supabaseAdmin
      .from('video_generation_jobs')
      .update({ overlay_config: overlayConfig })
      .eq('id', videoJobId)

    if (updateError) {
      console.error('Failed to update job overlay_config:', updateError)
    }

    return NextResponse.json({
      overlayId: overlay.id,
      version: overlay.version,
      status: 'saved',
    })
  } catch (err) {
    console.error('render-overlay error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
