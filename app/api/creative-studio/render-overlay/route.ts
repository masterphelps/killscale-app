import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { videoJobId, overlayConfig, userId } = await request.json()

    if (!videoJobId || !overlayConfig || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: videoJobId, overlayConfig, userId' },
        { status: 400 }
      )
    }

    // Verify the job exists and belongs to the user
    const { data: job, error: jobError } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id, user_id')
      .eq('id', videoJobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Video job not found' },
        { status: 404 }
      )
    }

    if (job.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized: job does not belong to this user' },
        { status: 403 }
      )
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
      return NextResponse.json(
        { error: 'Failed to save overlay config' },
        { status: 500 }
      )
    }

    // Update the job's overlay_config with the latest
    const { error: updateError } = await supabaseAdmin
      .from('video_generation_jobs')
      .update({ overlay_config: overlayConfig })
      .eq('id', videoJobId)

    if (updateError) {
      console.error('Failed to update job overlay_config:', updateError)
      // Non-fatal: overlay was saved, just log the warning
    }

    return NextResponse.json({
      overlayId: overlay.id,
      version: overlay.version,
      status: 'saved',
    })
  } catch (err) {
    console.error('render-overlay error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
