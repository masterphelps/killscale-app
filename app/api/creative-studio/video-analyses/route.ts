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

    // Build query - include full analysis and script_suggestions for detail view
    let query = supabase
      .from('video_analysis')
      .select('id, media_hash, status, analysis, script_suggestions, transcript, analyzed_at, created_at, error_message', { count: 'exact' })
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

    const { data: mediaItems } = await supabase
      .from('media_library')
      .select('media_hash, name, video_thumbnail_url, storage_url')
      .eq('user_id', userId)
      .eq('ad_account_id', strippedAccountId)
      .in('media_hash', mediaHashes)

    const mediaMap = new Map(mediaItems?.map(m => [m.media_hash, m]) || [])

    // Format response - include full analysis for detail view
    const formattedAnalyses = analyses?.map(a => {
      const media = mediaMap.get(a.media_hash)
      const overallScore = a.analysis?.overallScore ?? null

      return {
        id: a.id,
        mediaHash: a.media_hash,
        videoName: media?.name || 'Untitled Video',
        thumbnailUrl: media?.video_thumbnail_url || media?.storage_url || null,
        storageUrl: media?.storage_url || null,
        overallScore,
        status: a.status,
        analysis: a.analysis,
        scriptSuggestions: a.script_suggestions,
        transcript: a.transcript,
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
