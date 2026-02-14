import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List canvases or get a specific one
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const canvasId = searchParams.get('canvasId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get specific canvas
    if (canvasId) {
      const { data: canvas, error } = await supabase
        .from('video_concept_canvases')
        .select('*')
        .eq('id', canvasId)
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('[VideoCanvas] Get error:', error)
        return NextResponse.json({ error: 'Canvas not found' }, { status: 404 })
      }

      return NextResponse.json({ canvas })
    }

    // List all canvases for account
    if (!adAccountId) {
      return NextResponse.json({ error: 'Missing adAccountId' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    const { data: canvases, error } = await supabase
      .from('video_concept_canvases')
      .select('id, user_id, ad_account_id, product_url, product_knowledge, created_at, updated_at')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[VideoCanvas] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch canvases' }, { status: 500 })
    }

    // Fetch completed video counts per canvas in a single query
    const canvasIds = (canvases || []).map(c => c.id)
    let videoCounts: Record<string, number> = {}
    if (canvasIds.length > 0) {
      const { data: jobRows } = await supabase
        .from('video_generation_jobs')
        .select('canvas_id')
        .eq('user_id', userId)
        .in('canvas_id', canvasIds)
        .eq('status', 'complete')

      if (jobRows) {
        for (const row of jobRows) {
          if (row.canvas_id) {
            videoCounts[row.canvas_id] = (videoCounts[row.canvas_id] || 0) + 1
          }
        }
      }
    }

    const enrichedCanvases = (canvases || []).map(c => ({
      ...c,
      completed_video_count: videoCounts[c.id] || 0,
    }))

    return NextResponse.json({ canvases: enrichedCanvases })
  } catch (err) {
    console.error('[VideoCanvas] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch canvases' }, { status: 500 })
  }
}

// POST - Create a new canvas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, productUrl, productKnowledge, concepts } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    if (!productKnowledge || !concepts || concepts.length === 0) {
      return NextResponse.json({ error: 'Missing productKnowledge or concepts' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    const { data: canvas, error } = await supabase
      .from('video_concept_canvases')
      .insert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        product_url: productUrl || null,
        product_knowledge: productKnowledge,
        concepts,
      })
      .select()
      .single()

    if (error) {
      console.error('[VideoCanvas] Insert error:', error)
      return NextResponse.json({ error: 'Failed to save canvas' }, { status: 500 })
    }

    console.log('[VideoCanvas] Created canvas:', canvas.id)

    return NextResponse.json({ success: true, canvas })
  } catch (err) {
    console.error('[VideoCanvas] Error:', err)
    return NextResponse.json({ error: 'Failed to save canvas' }, { status: 500 })
  }
}

// PATCH - Update canvas concepts
export async function PATCH(request: NextRequest) {
  try {
    const { canvasId, userId, concepts } = await request.json()

    if (!canvasId || !userId || !concepts) {
      return NextResponse.json({ error: 'Missing canvasId, userId, or concepts' }, { status: 400 })
    }

    const { error } = await supabase
      .from('video_concept_canvases')
      .update({ concepts, updated_at: new Date().toISOString() })
      .eq('id', canvasId)
      .eq('user_id', userId)

    if (error) {
      console.error('[VideoCanvas] Patch error:', error)
      return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[VideoCanvas] Error:', err)
    return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 })
  }
}

// DELETE - Delete a canvas
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const canvasId = searchParams.get('canvasId')

    if (!userId || !canvasId) {
      return NextResponse.json({ error: 'Missing userId or canvasId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('video_concept_canvases')
      .delete()
      .eq('id', canvasId)
      .eq('user_id', userId)

    if (error) {
      console.error('[VideoCanvas] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete canvas' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[VideoCanvas] Error:', err)
    return NextResponse.json({ error: 'Failed to delete canvas' }, { status: 500 })
  }
}
