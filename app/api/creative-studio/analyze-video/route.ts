import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeVideo, buildPerformanceContext } from '@/lib/gemini'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, mediaHash } = await request.json()

    if (!userId || !adAccountId || !mediaHash) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // 1. Validate subscription (Pro tier only)
    // Must check both subscriptions AND admin_granted_subscriptions (same as lib/subscription.tsx)
    const [stripeResult, adminResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('admin_granted_subscriptions')
        .select('plan, expires_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    const stripeSub = stripeResult.data
    const adminSub = adminResult.data

    // Check admin-granted subscription first (takes precedence)
    const now = new Date()
    const adminSubValid = adminSub && adminSub.is_active && new Date(adminSub.expires_at) > now

    let plan: string | null = null
    let isActive = false

    if (adminSubValid) {
      plan = adminSub.plan
      isActive = true
    } else if (stripeSub) {
      plan = stripeSub.plan
      // Check if trialing and not expired
      if (stripeSub.status === 'trialing' && stripeSub.current_period_end) {
        const trialEnd = new Date(stripeSub.current_period_end)
        isActive = trialEnd > now
      } else {
        isActive = stripeSub.status === 'active' || stripeSub.status === 'trialing'
      }
    }

    // Case-insensitive check for Pro or Scale
    const planLower = plan?.toLowerCase()
    const isPro = planLower === 'pro' || planLower === 'scale'

    console.log('[Analyze Video] Subscription check:', {
      plan,
      planLower,
      stripeStatus: stripeSub?.status,
      adminSubValid,
      isActive,
      isPro
    })

    if (!isPro || !isActive) {
      return NextResponse.json(
        { error: 'Video analysis requires Pro plan' },
        { status: 403 }
      )
    }

    // 2. Check cache
    const { data: existing } = await supabase
      .from('video_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('media_hash', mediaHash)
      .single()

    if (existing?.status === 'complete') {
      return NextResponse.json({
        analysis: existing.analysis,
        transcript: existing.transcript,
        scriptSuggestions: existing.script_suggestions,
        cached: true,
        analyzedAt: existing.analyzed_at
      })
    }

    // 3. Get video URL from media_library
    const strippedAccountId = adAccountId.replace(/^act_/, '')
    const { data: media } = await supabase
      .from('media_library')
      .select('storage_url, url, video_thumbnail_url, media_type')
      .eq('user_id', userId)
      .eq('ad_account_id', strippedAccountId)
      .eq('media_hash', mediaHash)
      .single()

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    if (media.media_type !== 'video') {
      return NextResponse.json({ error: 'Only videos can be analyzed' }, { status: 400 })
    }

    const videoUrl = media.storage_url || media.url
    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL not available' }, { status: 404 })
    }

    // 4. Mark as processing (upsert)
    await supabase
      .from('video_analysis')
      .upsert({
        user_id: userId,
        ad_account_id: adAccountId,
        media_hash: mediaHash,
        status: 'processing',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,ad_account_id,media_hash'
      })

    try {
      // 5. Get performance context (optional enrichment)
      const { data: perfData } = await supabase
        .from('ad_data')
        .select('spend, revenue, impressions, clicks, video_views, video_thruplay')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('media_hash', mediaHash)
        .limit(1000)

      const performanceContext = perfData && perfData.length > 0
        ? buildPerformanceContext(perfData)
        : undefined

      // 6. Call Gemini
      const { analysis, scripts } = await analyzeVideo(videoUrl, performanceContext)

      // 7. Store results
      const now = new Date().toISOString()
      await supabase
        .from('video_analysis')
        .update({
          transcript: analysis.transcript,
          analysis: analysis,
          script_suggestions: scripts,
          status: 'complete',
          analyzed_at: now,
          updated_at: now,
          error_message: null
        })
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('media_hash', mediaHash)

      return NextResponse.json({
        analysis,
        transcript: analysis.transcript,
        scriptSuggestions: scripts,
        cached: false,
        analyzedAt: now
      })

    } catch (err) {
      console.error('Video analysis error:', err)

      // Update status to error
      await supabase
        .from('video_analysis')
        .update({
          status: 'error',
          error_message: err instanceof Error ? err.message : 'Unknown error',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('media_hash', mediaHash)

      return NextResponse.json(
        { error: 'Analysis failed', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    }

  } catch (err) {
    console.error('Analyze video endpoint error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - Check analysis status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const mediaHash = searchParams.get('mediaHash')

    if (!userId || !adAccountId || !mediaHash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const { data: analysis } = await supabase
      .from('video_analysis')
      .select('status, analysis, transcript, script_suggestions, analyzed_at, error_message')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('media_hash', mediaHash)
      .single()

    if (!analysis) {
      return NextResponse.json({ status: 'none' })
    }

    return NextResponse.json({
      status: analysis.status,
      analysis: analysis.analysis,
      transcript: analysis.transcript,
      scriptSuggestions: analysis.script_suggestions,
      analyzedAt: analysis.analyzed_at,
      errorMessage: analysis.error_message
    })

  } catch (err) {
    console.error('Get analysis status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
