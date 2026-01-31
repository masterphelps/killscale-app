import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

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

// Process deletes sequentially to avoid rate limits and handle cascades properly
const DELAY_BETWEEN_DELETES_MS = 150

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const { userId, entities } = await request.json() as {
      userId: string
      entities: BulkEntity[]
    }

    if (!userId || !entities || !Array.isArray(entities) || entities.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Sort entities: campaigns first, then adsets, then ads
    // This ensures proper cascade order (children before parents would fail)
    // Actually, we want to delete in reverse order: ads first, then adsets, then campaigns
    // to avoid trying to delete something that's already gone due to cascade
    const sortedEntities = [...entities].sort((a, b) => {
      const order = { ad: 0, adset: 1, campaign: 2 }
      return order[a.entityType] - order[b.entityType]
    })

    // Process sequentially for deletes (more destructive, want to be careful)
    for (let i = 0; i < sortedEntities.length; i++) {
      const entity = sortedEntities[i]

      try {
        // Delete via Meta API - set status to DELETED
        const metaUrl = `${META_GRAPH_URL}/${entity.entityId}`

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
          // Check if already deleted
          if (result.error.code === 100 && result.error.error_subcode === 33) {
            // Entity doesn't exist or already deleted - treat as success
            results.push({
              entityId: entity.entityId,
              name: entity.name,
              success: true
            })
            succeeded++
          } else {
            results.push({
              entityId: entity.entityId,
              name: entity.name,
              success: false,
              error: result.error.message || 'Meta API error'
            })
            failed++
          }
        } else {
          // Success - clean up local database
          switch (entity.entityType) {
            case 'campaign':
              // Delete from campaign_creations if exists
              await supabase
                .from('campaign_creations')
                .delete()
                .eq('campaign_id', entity.entityId)

              // Delete related ad_data
              await supabase
                .from('ad_data')
                .delete()
                .eq('user_id', userId)
                .eq('campaign_id', entity.entityId)
              break

            case 'adset':
              // Delete related ad_data
              await supabase
                .from('ad_data')
                .delete()
                .eq('user_id', userId)
                .eq('adset_id', entity.entityId)
              break

            case 'ad':
              // Delete specific ad_data
              await supabase
                .from('ad_data')
                .delete()
                .eq('user_id', userId)
                .eq('ad_id', entity.entityId)
              break
          }

          results.push({
            entityId: entity.entityId,
            name: entity.name,
            success: true
          })
          succeeded++
        }
      } catch (err) {
        results.push({
          entityId: entity.entityId,
          name: entity.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
        failed++
      }

      // Delay between deletes (except for last one)
      if (i < sortedEntities.length - 1) {
        await delay(DELAY_BETWEEN_DELETES_MS)
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
    console.error('Bulk delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
