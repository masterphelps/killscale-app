import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EntityType = 'campaign' | 'adset'
type BudgetType = 'daily' | 'lifetime'

interface BulkEntity {
  entityId: string
  entityType: EntityType
  name?: string
  currentBudget: number
  budgetType: BudgetType
}

interface BulkResult {
  entityId: string
  name?: string
  oldBudget: number
  newBudget: number
  success: boolean
  error?: string
}

// Rate limit: process in batches with delays
const BATCH_SIZE = 5
const BATCH_DELAY_MS = 200

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, entities, scalePercentage } = await request.json() as {
      userId: string
      adAccountId: string
      entities: BulkEntity[]
      scalePercentage: number
    }

    if (!userId || !adAccountId || !entities || !Array.isArray(entities) || entities.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof scalePercentage !== 'number' || scalePercentage === 0) {
      return NextResponse.json({ error: 'Invalid scale percentage' }, { status: 400 })
    }

    // Validate all entity types
    for (const entity of entities) {
      if (!['campaign', 'adset'].includes(entity.entityType)) {
        return NextResponse.json({ error: `Invalid entity type: ${entity.entityType}` }, { status: 400 })
      }
      if (!['daily', 'lifetime'].includes(entity.budgetType)) {
        return NextResponse.json({ error: `Invalid budget type: ${entity.budgetType}` }, { status: 400 })
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
    let totalOldBudget = 0
    let totalNewBudget = 0

    const multiplier = 1 + (scalePercentage / 100)

    // Process in batches
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE)

      // Process batch in parallel
      const batchPromises = batch.map(async (entity) => {
        const newBudget = Math.round(entity.currentBudget * multiplier * 100) / 100
        // Meta API expects budget in cents
        const newBudgetCents = Math.round(newBudget * 100)

        try {
          const metaUrl = `https://graph.facebook.com/v18.0/${entity.entityId}`

          const budgetField = entity.budgetType === 'daily' ? 'daily_budget' : 'lifetime_budget'

          const response = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              [budgetField]: newBudgetCents,
              access_token: accessToken
            })
          })

          const result = await response.json()

          if (result.error) {
            return {
              entityId: entity.entityId,
              name: entity.name,
              oldBudget: entity.currentBudget,
              newBudget: entity.currentBudget, // Unchanged on error
              success: false,
              error: result.error.message || 'Meta API error'
            }
          }

          // Log the budget change
          await supabase
            .from('budget_changes')
            .insert({
              user_id: userId,
              ad_account_id: adAccountId,
              entity_type: entity.entityType,
              entity_id: entity.entityId,
              old_budget: entity.currentBudget,
              new_budget: newBudget,
              changed_at: new Date().toISOString()
            })

          return {
            entityId: entity.entityId,
            name: entity.name,
            oldBudget: entity.currentBudget,
            newBudget,
            success: true
          }
        } catch (err) {
          return {
            entityId: entity.entityId,
            name: entity.name,
            oldBudget: entity.currentBudget,
            newBudget: entity.currentBudget,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Update counts and totals
      for (const result of batchResults) {
        totalOldBudget += result.oldBudget
        if (result.success) {
          succeeded++
          totalNewBudget += result.newBudget
        } else {
          failed++
          totalNewBudget += result.oldBudget // Unchanged
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
      results,
      totalOldBudget,
      totalNewBudget
    })

  } catch (err) {
    console.error('Bulk budget scale error:', err)
    return NextResponse.json({ error: 'Failed to scale budgets' }, { status: 500 })
  }
}
