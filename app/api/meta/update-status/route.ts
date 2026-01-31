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
    
    // Update status on Meta
    // The API endpoint is the same for campaigns, adsets, and ads
    const metaUrl = `${META_GRAPH_URL}/${entityId}`
    
    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: status,
        access_token: accessToken
      })
    })
    
    const result = await response.json()
    
    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({ 
        error: result.error.message || 'Failed to update status on Meta'
      }, { status: 400 })
    }
    
    // Update local database to reflect the change
    // Determine which column to update based on entity type
    let updateColumn: string
    let idColumn: string
    
    switch (entityType) {
      case 'campaign':
        updateColumn = 'campaign_status'
        idColumn = 'campaign_id'
        break
      case 'adset':
        updateColumn = 'adset_status'
        idColumn = 'adset_id'
        break
      case 'ad':
        updateColumn = 'status'
        idColumn = 'ad_id'
        break
    }
    
    // Update the status in ad_data table
    const { error: updateError } = await supabase
      .from('ad_data')
      .update({ [updateColumn]: status })
      .eq('user_id', userId)
      .eq(idColumn, entityId)
    
    if (updateError) {
      console.error('Database update error:', updateError)
      // Don't fail the request - Meta update succeeded, just log the DB error
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
