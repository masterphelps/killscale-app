import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type EntityType = 'campaign' | 'adset' | 'ad'

interface CampaignData {
  id: string
  name: string
  status: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
  objective?: string
  special_ad_categories?: string[]
}

interface AdsetData {
  id: string
  name: string
  status: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
  campaign_id: string
  optimization_goal?: string
  billing_event?: string
}

interface AdData {
  id: string
  name: string
  status: string
  effective_status: string
  adset_id: string
  creative?: {
    id: string
  }
}

/**
 * Lightweight endpoint to sync a single entity from Meta.
 * Used after create/duplicate operations to get fresh data for immediate display.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, entityId, entityType } = await request.json() as {
      userId: string
      adAccountId: string
      entityId: string
      entityType: EntityType
    }

    if (!userId || !adAccountId || !entityId || !entityType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Build fields based on entity type
    let fields: string
    switch (entityType) {
      case 'campaign':
        fields = 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,special_ad_categories'
        break
      case 'adset':
        fields = 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,optimization_goal,billing_event'
        break
      case 'ad':
        fields = 'id,name,status,effective_status,adset_id,creative'
        break
      default:
        return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    // Fetch the entity from Meta
    const response = await fetch(
      `${META_GRAPH_URL}/${entityId}?fields=${fields}&access_token=${accessToken}`
    )
    const data = await response.json()

    if (data.error) {
      console.error('[sync-entity] Meta API error:', data.error)
      const errorMsg = data.error.error_user_msg || data.error.message || 'Failed to fetch entity'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Transform the response based on entity type
    let entity: Record<string, unknown>
    switch (entityType) {
      case 'campaign': {
        const campaign = data as CampaignData
        entity = {
          id: campaign.id,
          name: campaign.name,
          status: campaign.effective_status || campaign.status,
          dailyBudget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : null,
          lifetimeBudget: campaign.lifetime_budget ? parseInt(campaign.lifetime_budget) / 100 : null,
          objective: campaign.objective,
          specialAdCategories: campaign.special_ad_categories,
          // Determine budget type based on whether campaign has budget
          budgetType: (campaign.daily_budget || campaign.lifetime_budget) ? 'CBO' : 'ABO'
        }
        break
      }
      case 'adset': {
        const adset = data as AdsetData
        entity = {
          id: adset.id,
          name: adset.name,
          status: adset.effective_status || adset.status,
          dailyBudget: adset.daily_budget ? parseInt(adset.daily_budget) / 100 : null,
          lifetimeBudget: adset.lifetime_budget ? parseInt(adset.lifetime_budget) / 100 : null,
          campaignId: adset.campaign_id,
          optimizationGoal: adset.optimization_goal,
          billingEvent: adset.billing_event,
          // ABO ad sets have their own budget
          budgetType: (adset.daily_budget || adset.lifetime_budget) ? 'ABO' : null
        }
        break
      }
      case 'ad': {
        const ad = data as AdData
        entity = {
          id: ad.id,
          name: ad.name,
          status: ad.effective_status || ad.status,
          adsetId: ad.adset_id,
          creativeId: ad.creative?.id
        }
        break
      }
    }

    return NextResponse.json({
      success: true,
      entity,
      entityType
    })

  } catch (err) {
    console.error('[sync-entity] Error:', err)
    return NextResponse.json({ error: 'Failed to sync entity' }, { status: 500 })
  }
}
