import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EntityType = 'campaign' | 'adset' | 'ad'

interface BulkEntity {
  entityId: string
  entityType: EntityType
  name?: string
}

interface BulkResult {
  entityId: string
  name?: string
  success: boolean
  error?: string
}

// Rate limit: process in batches with delays
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 100

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const { userId, entities, status } = await request.json() as {
      userId: string
      entities: BulkEntity[]
      status: 'ACTIVE' | 'PAUSED'
    }

    if (!userId || !entities || !Array.isArray(entities) || entities.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Validate all entity types
    for (const entity of entities) {
      if (!['campaign', 'adset', 'ad'].includes(entity.entityType)) {
        return NextResponse.json({ error: `Invalid entity type: ${entity.entityType}` }, { status: 400 })
      }
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
    const results: BulkResult[] = []
    let succeeded = 0
    let failed = 0

    // Process in batches
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE)

      // Process batch in parallel
      const batchPromises = batch.map(async (entity) => {
        try {
          const metaUrl = `https://graph.facebook.com/v18.0/${entity.entityId}`

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
            return {
              entityId: entity.entityId,
              name: entity.name,
              success: false,
              error: result.error.message || 'Meta API error'
            }
          }

          // Update local database
          let updateColumn: string
          let idColumn: string

          switch (entity.entityType) {
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

          // Update the status in ad_data table (don't fail if DB update fails)
          await supabase
            .from('ad_data')
            .update({ [updateColumn]: status })
            .eq('user_id', userId)
            .eq(idColumn, entity.entityId)

          return {
            entityId: entity.entityId,
            name: entity.name,
            success: true
          }
        } catch (err) {
          return {
            entityId: entity.entityId,
            name: entity.name,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Update counts
      for (const result of batchResults) {
        if (result.success) {
          succeeded++
        } else {
          failed++
        }
      }

      // Delay between batches (except for last batch)
      if (i + BATCH_SIZE < entities.length) {
        await delay(BATCH_DELAY_MS)
      }
    }

    return NextResponse.json({
      success: failed === 0,
      total: entities.length,
      succeeded,
      failed,
      results
    })

  } catch (err) {
    console.error('Bulk update status error:', err)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
