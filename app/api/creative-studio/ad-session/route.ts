import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all sessions or get a specific session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const sessionId = searchParams.get('sessionId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get specific session
    if (sessionId) {
      const { data: session, error } = await supabase
        .from('ad_studio_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('[AdSession] Get error:', error)
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      return NextResponse.json({ session })
    }

    // List all sessions for account
    if (!adAccountId) {
      return NextResponse.json({ error: 'Missing adAccountId' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    const { data: sessions, error } = await supabase
      .from('ad_studio_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[AdSession] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (err) {
    console.error('[AdSession] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      adAccountId,
      productUrl,
      productInfo,
      competitorCompany,
      competitorAd,
      generatedAds,
      imageStyle,
    } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    if (!generatedAds || generatedAds.length === 0) {
      return NextResponse.json({ error: 'No generated ads to save' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    const { data: session, error } = await supabase
      .from('ad_studio_sessions')
      .insert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        product_url: productUrl,
        product_info: productInfo,
        competitor_company: competitorCompany,
        competitor_ad: competitorAd,
        generated_ads: generatedAds,
        image_style: imageStyle,
        status: 'complete',
      })
      .select()
      .single()

    if (error) {
      console.error('[AdSession] Insert error:', error)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    console.log('[AdSession] Created session:', session.id)

    return NextResponse.json({ success: true, session })
  } catch (err) {
    console.error('[AdSession] Error:', err)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}

// PATCH - Update a session (e.g., add generated images)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, sessionId, generatedImages } = body

    if (!userId || !sessionId) {
      return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (generatedImages !== undefined) {
      updateData.generated_images = generatedImages
    }

    const { data: session, error } = await supabase
      .from('ad_studio_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('[AdSession] Update error:', error)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({ success: true, session })
  } catch (err) {
    console.error('[AdSession] Error:', err)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}

// DELETE - Delete a session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const sessionId = searchParams.get('sessionId')

    if (!userId || !sessionId) {
      return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ad_studio_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[AdSession] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[AdSession] Error:', err)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
