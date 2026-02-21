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
    const sessionId = searchParams.get('sessionId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get specific session
    if (sessionId) {
      const { data: session, error } = await supabase
        .from('image_editor_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('[ImageEditorSession] Get error:', error)
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      return NextResponse.json({ session })
    }

    // List all sessions for user
    const { data: sessions, error } = await supabase
      .from('image_editor_sessions')
      .select('id, user_id, workspace_id, source_type, source_id, original_image_url, versions, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[ImageEditorSession] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (err) {
    console.error('[ImageEditorSession] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, workspaceId, sourceType, sourceId, originalImageUrl } = body

    if (!userId || !originalImageUrl) {
      return NextResponse.json({ error: 'Missing userId or originalImageUrl' }, { status: 400 })
    }

    const { data: session, error } = await supabase
      .from('image_editor_sessions')
      .insert({
        user_id: userId,
        workspace_id: workspaceId || null,
        source_type: sourceType || 'upload',
        source_id: sourceId || null,
        original_image_url: originalImageUrl,
        versions: [],
        detected_text: [],
      })
      .select()
      .single()

    if (error) {
      console.error('[ImageEditorSession] Insert error:', error)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    console.log('[ImageEditorSession] Created session:', session.id)
    return NextResponse.json({ success: true, session })
  } catch (err) {
    console.error('[ImageEditorSession] Error:', err)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}

// PATCH - Update a session
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, sessionId, versions, detectedText } = body

    if (!userId || !sessionId) {
      return NextResponse.json({ error: 'Missing userId or sessionId' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (versions !== undefined) {
      updateData.versions = versions
    }
    if (detectedText !== undefined) {
      updateData.detected_text = detectedText
    }

    const { data: session, error } = await supabase
      .from('image_editor_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('[ImageEditorSession] Update error:', error)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({ success: true, session })
  } catch (err) {
    console.error('[ImageEditorSession] Error:', err)
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
      .from('image_editor_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[ImageEditorSession] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ImageEditorSession] Error:', err)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
