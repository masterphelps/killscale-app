import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoJobId = searchParams.get('videoJobId')
    const userId = searchParams.get('userId')

    if (!videoJobId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params: videoJobId, userId' },
        { status: 400 }
      )
    }

    // Verify the job belongs to the user
    const { data: job, error: jobError } = await supabaseAdmin
      .from('video_generation_jobs')
      .select('id')
      .eq('id', videoJobId)
      .eq('user_id', userId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found or does not belong to user' },
        { status: 404 }
      )
    }

    // Fetch all overlay versions for this job, newest first
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('video_overlays')
      .select('id, version, overlay_config, render_status, created_at')
      .eq('video_job_id', videoJobId)
      .order('version', { ascending: false })

    if (versionsError) {
      console.error('Error fetching overlay versions:', versionsError)
      return NextResponse.json(
        { error: 'Failed to fetch overlay versions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ versions: versions || [] })
  } catch (error) {
    console.error('Overlay versions error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
