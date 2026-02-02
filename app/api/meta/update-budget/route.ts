import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EntityType = 'campaign' | 'adset'
type BudgetType = 'daily' | 'lifetime'

export async function POST(request: NextRequest) {
  try {
    const { userId, entityId, entityType, budget, budgetType, oldBudget, adAccountId } = await request.json() as {
      userId: string
      entityId: string
      entityType: EntityType
      budget: number
      budgetType: BudgetType
      oldBudget?: number
      adAccountId?: string
    }

    if (!userId || !entityId || !entityType || !budget || !budgetType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['campaign', 'adset'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    if (!['daily', 'lifetime'].includes(budgetType)) {
      return NextResponse.json({ error: 'Invalid budget type' }, { status: 400 })
    }

    if (budget <= 0) {
      return NextResponse.json({ error: 'Budget must be greater than 0' }, { status: 400 })
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

    // Convert budget to cents (Meta API expects cents)
    const budgetInCents = Math.round(budget * 100)

    // Build the update payload
    // When changing budget type, we need to clear the other type
    const updatePayload: Record<string, string | number> = {
      access_token: accessToken,
    }

    if (budgetType === 'daily') {
      updatePayload.daily_budget = budgetInCents
      // Note: Can't set lifetime_budget to 0 to clear it, so we just set daily
    } else {
      updatePayload.lifetime_budget = budgetInCents
    }

    // Update budget on Meta
    const metaUrl = `${META_GRAPH_URL}/${entityId}`

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload)
    })

    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to update budget on Meta'
      }, { status: 400 })
    }

    // Update local database to reflect the change
    const updateData: Record<string, number | null> = {}

    if (entityType === 'campaign') {
      if (budgetType === 'daily') {
        updateData.campaign_daily_budget = budget
        updateData.campaign_lifetime_budget = null
      } else {
        updateData.campaign_lifetime_budget = budget
        updateData.campaign_daily_budget = null
      }

      const { error: dbError, count } = await supabase
        .from('ad_data')
        .update(updateData)
        .eq('user_id', userId)
        .eq('campaign_id', entityId)

      console.log(`[update-budget] Updated campaign ${entityId}: ${count ?? '?'} rows, budget=${budget} ${budgetType}`, dbError || '')
    } else {
      if (budgetType === 'daily') {
        updateData.adset_daily_budget = budget
        updateData.adset_lifetime_budget = null
      } else {
        updateData.adset_lifetime_budget = budget
        updateData.adset_daily_budget = null
      }

      const { error: dbError, count } = await supabase
        .from('ad_data')
        .update(updateData)
        .eq('user_id', userId)
        .eq('adset_id', entityId)

      console.log(`[update-budget] Updated adset ${entityId}: ${count ?? '?'} rows, budget=${budget} ${budgetType}`, dbError || '')
    }

    // Log the budget change for cooldown tracking
    if (oldBudget !== undefined && adAccountId) {
      const { error: logError } = await supabase
        .from('budget_changes')
        .insert({
          user_id: userId,
          ad_account_id: adAccountId,
          entity_type: entityType,
          entity_id: entityId,
          old_budget: oldBudget,
          new_budget: budget
        })

      if (logError) {
        // Log but don't fail the request
        console.error('Failed to log budget change:', logError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Budget updated to $${budget} ${budgetType === 'daily' ? 'per day' : 'lifetime'}`
    })

  } catch (err) {
    console.error('Update budget error:', err)
    return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 })
  }
}
