import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Creates a lightweight video_generation_job record for Oracle-generated overlays.
 * This allows the video editor to load the job via ?jobId= (the standard pattern)
 * instead of relying on fragile client-side data transfer (localStorage/window globals).
 */
export async function POST(request: Request) {
  try {
    const { userId, adAccountId, videoUrl, overlayConfig, durationSeconds } = await request.json()

    if (!userId || !videoUrl || !overlayConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, videoUrl, overlayConfig' },
        { status: 400 }
      )
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('video_generation_jobs')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId || 'oracle',
        prompt: 'Oracle overlay generation',
        video_style: 'oracle',
        duration_seconds: durationSeconds || 10,
        overlay_config: overlayConfig,
        status: 'complete',
        raw_video_url: videoUrl,
        credit_cost: 0,
        provider: 'oracle',
      })
      .select('id')
      .single()

    if (jobError || !job) {
      console.error('[CreateOverlayJob] Insert failed:', jobError)
      return NextResponse.json(
        { error: 'Failed to create job record' },
        { status: 500 }
      )
    }

    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    console.error('[CreateOverlayJob] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
