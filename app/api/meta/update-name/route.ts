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
    const { userId, entityId, entityType, name } = await request.json() as {
      userId: string
      entityId: string
      entityType: EntityType
      name: string
    }

    if (!userId || !entityId || !entityType || !name) {
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

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Update name on Meta
    const metaUrl = `${META_GRAPH_URL}/${entityId}`

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        access_token: accessToken
      })
    })

    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to update name'
      }, { status: 400 })
    }

    // Update local database
    let nameColumn: string
    let idColumn: string

    switch (entityType) {
      case 'campaign':
        nameColumn = 'campaign_name'
        idColumn = 'campaign_id'
        break
      case 'adset':
        nameColumn = 'adset_name'
        idColumn = 'adset_id'
        break
      case 'ad':
        nameColumn = 'ad_name'
        idColumn = 'ad_id'
        break
    }

    await supabase
      .from('ad_data')
      .update({ [nameColumn]: name })
      .eq('user_id', userId)
      .eq(idColumn, entityId)

    return NextResponse.json({
      success: true,
      message: `${entityType} renamed successfully`
    })

  } catch (err) {
    console.error('Update name error:', err)
    return NextResponse.json({ error: 'Failed to update name' }, { status: 500 })
  }
}
