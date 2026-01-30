import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface StarredMediaItem {
  id: string
  userId: string
  workspaceId: string | null
  adAccountId: string
  mediaHash: string
  mediaType: string
  thumbnailUrl: string | null
  mediaName: string | null
  starredAt: string
}

// GET - List starred media for a user/account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const workspaceId = searchParams.get('workspaceId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters: userId and adAccountId' }, { status: 400 })
    }

    let query = supabase
      .from('starred_media')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .order('starred_at', { ascending: false })

    // Optionally filter by workspace
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching starred media:', error)
      return NextResponse.json({ error: 'Failed to fetch starred media' }, { status: 500 })
    }

    // Transform to camelCase
    const starred: StarredMediaItem[] = (data || []).map(item => ({
      id: item.id,
      userId: item.user_id,
      workspaceId: item.workspace_id,
      adAccountId: item.ad_account_id,
      mediaHash: item.media_hash,
      mediaType: item.media_type,
      thumbnailUrl: item.thumbnail_url,
      mediaName: item.media_name,
      starredAt: item.starred_at
    }))

    return NextResponse.json({ starred })

  } catch (err) {
    console.error('Starred media GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch starred media' }, { status: 500 })
  }
}

// POST - Star a media item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      adAccountId,
      workspaceId,
      mediaHash,
      mediaType,
      thumbnailUrl,
      mediaName
    } = body

    if (!userId || !adAccountId || !mediaHash || !mediaType) {
      return NextResponse.json({
        error: 'Missing required fields: userId, adAccountId, mediaHash, and mediaType'
      }, { status: 400 })
    }

    // Check if already starred
    const { data: existing } = await supabase
      .from('starred_media')
      .select('id')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .eq('media_hash', mediaHash)
      .single()

    if (existing) {
      // Already starred - return existing record
      return NextResponse.json({
        success: true,
        message: 'Media already starred',
        isNew: false
      })
    }

    // Insert new starred media
    const { data, error } = await supabase
      .from('starred_media')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        workspace_id: workspaceId || null,
        media_hash: mediaHash,
        media_type: mediaType,
        thumbnail_url: thumbnailUrl || null,
        media_name: mediaName || null,
        starred_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'Media already starred',
          isNew: false
        })
      }
      console.error('Error starring media:', error)
      return NextResponse.json({ error: 'Failed to star media' }, { status: 500 })
    }

    const starred: StarredMediaItem = {
      id: data.id,
      userId: data.user_id,
      workspaceId: data.workspace_id,
      adAccountId: data.ad_account_id,
      mediaHash: data.media_hash,
      mediaType: data.media_type,
      thumbnailUrl: data.thumbnail_url,
      mediaName: data.media_name,
      starredAt: data.starred_at
    }

    return NextResponse.json({
      success: true,
      starred,
      isNew: true,
      message: 'Media starred successfully'
    })

  } catch (err) {
    console.error('Starred media POST error:', err)
    return NextResponse.json({ error: 'Failed to star media' }, { status: 500 })
  }
}

// DELETE - Unstar a media item
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, mediaHash, mediaHashes } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({
        error: 'Missing required fields: userId and adAccountId'
      }, { status: 400 })
    }

    // Support both single mediaHash and array of mediaHashes
    const hashesToDelete = mediaHashes || (mediaHash ? [mediaHash] : [])

    if (hashesToDelete.length === 0) {
      return NextResponse.json({ error: 'No media hash(es) provided' }, { status: 400 })
    }

    const { error, count } = await supabase
      .from('starred_media')
      .delete()
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .in('media_hash', hashesToDelete)

    if (error) {
      console.error('Error unstarring media:', error)
      return NextResponse.json({ error: 'Failed to unstar media' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: count || hashesToDelete.length,
      message: `Unstarred ${count || hashesToDelete.length} media item(s)`
    })

  } catch (err) {
    console.error('Starred media DELETE error:', err)
    return NextResponse.json({ error: 'Failed to unstar media' }, { status: 500 })
  }
}
