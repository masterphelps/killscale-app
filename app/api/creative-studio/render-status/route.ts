import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const overlayId = searchParams.get('overlayId')
    const userId = searchParams.get('userId')

    if (!overlayId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params: overlayId, userId' },
        { status: 400 }
      )
    }

    const { data: overlay, error } = await supabaseAdmin
      .from('video_overlays')
      .select('id, render_status, rendered_video_url, version')
      .eq('id', overlayId)
      .eq('user_id', userId)
      .single()

    if (error || !overlay) {
      return NextResponse.json(
        { error: 'Overlay not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      overlayId: overlay.id,
      renderStatus: overlay.render_status,
      renderedVideoUrl: overlay.rendered_video_url,
      version: overlay.version,
    })
  } catch (err) {
    console.error('render-status error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
