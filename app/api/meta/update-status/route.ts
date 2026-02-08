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
    const { userId, entityId, entityType, status } = await request.json() as {
      userId: string
      entityId: string
      entityType: EntityType
      status: 'ACTIVE' | 'PAUSED'
    }
    
    if (!userId || !entityId || !entityType || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    if (!['campaign', 'adset', 'ad'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }
    
    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
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

    // Helper to update a single entity on Meta
    const updateOnMeta = async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`${META_GRAPH_URL}/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, access_token: accessToken })
        })
        const data = await res.json()
        if (data.error) {
          // Don't fail the whole operation — some children may be in states that can't be changed
          console.warn(`[update-status] Meta API warning for ${id}:`, data.error.message)
          return false
        }
        return true
      } catch (err) {
        console.warn(`[update-status] Failed to update ${id}:`, err)
        return false
      }
    }

    // 1. Update the primary entity on Meta
    const primaryRes = await fetch(`${META_GRAPH_URL}/${entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, access_token: accessToken })
    })
    const primaryResult = await primaryRes.json()

    if (primaryResult.error) {
      console.error('Meta API error:', primaryResult.error)
      return NextResponse.json({
        error: primaryResult.error.message || 'Failed to update status on Meta'
      }, { status: 400 })
    }

    // 2. Cascade to children on Meta API
    // When activating/pausing a campaign → also update all its ad sets and ads
    // When activating/pausing an ad set → also update all its ads
    if (entityType === 'campaign') {
      const { data: children } = await supabase
        .from('ad_data')
        .select('adset_id, ad_id')
        .eq('user_id', userId)
        .eq('campaign_id', entityId)

      if (children && children.length > 0) {
        const adsetIds = Array.from(new Set(children.map(c => c.adset_id).filter(Boolean)))
        const adIds = Array.from(new Set(children.map(c => c.ad_id).filter(Boolean)))

        // Update ad sets first, then ads, with delays to avoid rate limits
        for (const id of adsetIds) {
          await updateOnMeta(id)
          if (adsetIds.length + adIds.length > 3) await new Promise(r => setTimeout(r, 300))
        }
        for (const id of adIds) {
          await updateOnMeta(id)
          if (adsetIds.length + adIds.length > 3) await new Promise(r => setTimeout(r, 300))
        }
        console.log(`[update-status] Cascaded ${status} to ${adsetIds.length} adsets + ${adIds.length} ads in campaign ${entityId}`)
      }

    } else if (entityType === 'adset') {
      const { data: children } = await supabase
        .from('ad_data')
        .select('ad_id')
        .eq('user_id', userId)
        .eq('adset_id', entityId)

      if (children && children.length > 0) {
        const adIds = Array.from(new Set(children.map(c => c.ad_id).filter(Boolean)))
        for (const id of adIds) {
          await updateOnMeta(id)
          if (adIds.length > 3) await new Promise(r => setTimeout(r, 300))
        }
        console.log(`[update-status] Cascaded ${status} to ${adIds.length} ads in adset ${entityId}`)
      }
    }

    // 3. Update local database to match what we told Meta
    if (entityType === 'campaign') {
      await supabase.from('ad_data')
        .update({ campaign_status: status, adset_status: status, status: status })
        .eq('user_id', userId)
        .eq('campaign_id', entityId)

    } else if (entityType === 'adset') {
      await supabase.from('ad_data')
        .update({ adset_status: status, status: status })
        .eq('user_id', userId)
        .eq('adset_id', entityId)

    } else {
      await supabase.from('ad_data')
        .update({ status: status })
        .eq('user_id', userId)
        .eq('ad_id', entityId)
    }
    
    return NextResponse.json({ 
      success: true,
      message: `${entityType} ${status === 'PAUSED' ? 'paused' : 'activated'} successfully`
    })
    
  } catch (err) {
    console.error('Update status error:', err)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
