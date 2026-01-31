import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EntityType = 'campaign' | 'adset' | 'ad'

export async function POST(request: NextRequest) {
  try {
    const { userId, entityId, entityType } = await request.json() as {
      userId: string
      entityId: string
      entityType: EntityType
    }

    if (!userId || !entityId || !entityType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['campaign', 'adset', 'ad'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Delete entity on Meta by setting status to DELETED
    // Note: This is permanent and cascades to children (campaigns delete all adsets/ads, adsets delete all ads)
    const metaUrl = `${META_GRAPH_URL}/${entityId}`

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'DELETED',
        access_token: accessToken
      })
    })

    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)

      // Check for already deleted error
      if (result.error.code === 2635) {
        return NextResponse.json({
          error: 'This item has already been deleted'
        }, { status: 400 })
      }

      return NextResponse.json({
        error: result.error.message || 'Failed to delete on Meta'
      }, { status: 400 })
    }

    // Remove from local database
    // For campaigns: delete all ads in that campaign
    // For adsets: delete all ads in that adset
    // For ads: delete just that ad

    console.log('[Delete] Removing from ad_data:', { entityType, entityId, userId })

    let deleteError = null
    let deleteCount = 0
    switch (entityType) {
      case 'campaign':
        // First count how many rows will be deleted
        const { count: campCount } = await supabase
          .from('ad_data')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('campaign_id', entityId)
        console.log('[Delete] Found', campCount, 'rows to delete for campaign', entityId)

        const { error: campErr } = await supabase
          .from('ad_data')
          .delete()
          .eq('user_id', userId)
          .eq('campaign_id', entityId)
        deleteError = campErr
        deleteCount = campCount || 0
        break
      case 'adset':
        const { error: adsetErr } = await supabase
          .from('ad_data')
          .delete()
          .eq('user_id', userId)
          .eq('adset_id', entityId)
        deleteError = adsetErr
        break
      case 'ad':
        const { error: adErr } = await supabase
          .from('ad_data')
          .delete()
          .eq('user_id', userId)
          .eq('ad_id', entityId)
        deleteError = adErr
        break
    }

    if (deleteError) {
      console.error('[Delete] Failed to delete from ad_data:', deleteError)
      // Don't fail the request - Meta delete succeeded, just local cleanup failed
    } else {
      console.log('[Delete] Successfully deleted', deleteCount, 'rows from ad_data')
    }

    // Also remove from campaign_creations if it was a KillScale-created campaign
    if (entityType === 'campaign') {
      await supabase
        .from('campaign_creations')
        .delete()
        .eq('user_id', userId)
        .eq('campaign_id', entityId)
    }

    return NextResponse.json({
      success: true,
      message: `${entityType} deleted successfully`
    })

  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
