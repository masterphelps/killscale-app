import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all oracle sessions or get a specific session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const sessionId = searchParams.get('sessionId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get specific session (full data including messages/context)
    if (sessionId) {
      const { data: session, error } = await supabase
        .from('oracle_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('[OracleSession] Get error:', error)
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      return NextResponse.json({ session })
    }

    // List sessions (lightweight — exclude messages/context)
    let query = supabase
      .from('oracle_chat_sessions')
      .select('id, title, highest_tier, status, generated_assets, created_at, updated_at')
      .eq('user_id', userId)

    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    }

    const { data: sessions, error } = await query
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[OracleSession] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (err) {
    console.error('[OracleSession] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST - Create a new oracle session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      adAccountId,
      title,
      messages,
      context,
      highestTier,
    } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('oracle_chat_sessions')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        title: title || 'New Chat',
        messages: messages || [],
        context: context || {},
        highest_tier: highestTier || 'sonnet',
        generated_assets: [],
        status: 'active',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[OracleSession] Insert error:', error)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    console.log('[OracleSession] Created session:', data.id)

    return NextResponse.json({ sessionId: data.id })
  } catch (err) {
    console.error('[OracleSession] Error:', err)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}

// PATCH - Update an oracle session
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, userId, messages, context, generatedAssets, highestTier, status, title } = body

    if (!userId || !sessionId) {
      return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (messages !== undefined) updateData.messages = messages
    if (context !== undefined) updateData.context = context
    if (generatedAssets !== undefined) updateData.generated_assets = generatedAssets
    if (highestTier !== undefined) updateData.highest_tier = highestTier
    if (status !== undefined) updateData.status = status
    if (title !== undefined) updateData.title = title

    const { error } = await supabase
      .from('oracle_chat_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[OracleSession] Update error:', error)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[OracleSession] Error:', err)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}

// DELETE - Delete an oracle session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const sessionId = searchParams.get('sessionId')

    if (!userId || !sessionId) {
      return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('oracle_chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[OracleSession] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[OracleSession] Error:', err)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
