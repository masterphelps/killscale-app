import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface TargetingOption {
  id: string
  name: string
}

interface CustomTargeting {
  locationType: 'city' | 'country'
  locationKey?: string
  locationName?: string
  locationRadius?: number
  countries?: string[]
  ageMin: number
  ageMax: number
  targetingMode: 'broad' | 'custom'
  interests?: TargetingOption[]
  behaviors?: TargetingOption[]
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, sourceAdsetId, targetCampaignId, newName, copyStatus = 'PAUSED', customTargeting } = await request.json() as {
      userId: string
      adAccountId: string
      sourceAdsetId: string
      targetCampaignId?: string // If not provided, use same campaign
      newName?: string
      copyStatus?: 'PAUSED' | 'ACTIVE'
      customTargeting?: CustomTargeting
    }

    if (!userId || !adAccountId || !sourceAdsetId) {
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
    const errors: string[] = []

    // 1. Fetch source ad set details
    const adsetRes = await fetch(
      `${META_GRAPH_URL}/${sourceAdsetId}?fields=name,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,promoted_object,bid_strategy,bid_amount&access_token=${accessToken}`
    )
    const adsetData = await adsetRes.json()

    if (adsetData.error) {
      return NextResponse.json({ error: adsetData.error.message }, { status: 400 })
    }

    // 2. Create new ad set
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const adsetName = newName || `${adsetData.name} - Copy`
    const campaignId = targetCampaignId || adsetData.campaign_id

    // Build targeting - use custom targeting if provided, otherwise copy from source
    let targeting = adsetData.targeting
    if (customTargeting) {
      targeting = {
        geo_locations: customTargeting.locationType === 'city' && customTargeting.locationKey
          ? {
              cities: [{
                key: customTargeting.locationKey,
                radius: customTargeting.locationRadius || 25,
                distance_unit: 'mile'
              }]
            }
          : {
              countries: customTargeting.countries || ['US']
            },
        age_min: customTargeting.ageMin || 18,
        age_max: customTargeting.ageMax || 65
      }

      // Add detailed targeting if custom mode
      if (customTargeting.targetingMode === 'custom') {
        const flexibleSpecEntry: Record<string, unknown> = {}

        if (customTargeting.interests && customTargeting.interests.length > 0) {
          flexibleSpecEntry.interests = customTargeting.interests.map(i => ({
            id: i.id,
            name: i.name
          }))
        }

        if (customTargeting.behaviors && customTargeting.behaviors.length > 0) {
          flexibleSpecEntry.behaviors = customTargeting.behaviors.map(b => ({
            id: b.id,
            name: b.name
          }))
        }

        if (Object.keys(flexibleSpecEntry).length > 0) {
          targeting.flexible_spec = [flexibleSpecEntry]
        }
      }
    }

    const createAdsetBody: Record<string, any> = {
      campaign_id: campaignId,
      name: adsetName,
      optimization_goal: adsetData.optimization_goal,
      billing_event: adsetData.billing_event,
      targeting,
      status: copyStatus,
      access_token: accessToken
    }

    if (adsetData.daily_budget) {
      createAdsetBody.daily_budget = adsetData.daily_budget
      // Meta requires this field for ABO ad sets
      createAdsetBody.is_adset_budget_sharing_enabled = false
    }
    if (adsetData.lifetime_budget) {
      createAdsetBody.lifetime_budget = adsetData.lifetime_budget
      // Meta requires this field for ABO ad sets
      createAdsetBody.is_adset_budget_sharing_enabled = false
    }
    if (adsetData.promoted_object) {
      createAdsetBody.promoted_object = adsetData.promoted_object
    }
    if (adsetData.bid_strategy) {
      createAdsetBody.bid_strategy = adsetData.bid_strategy
    }
    if (adsetData.bid_amount) {
      createAdsetBody.bid_amount = adsetData.bid_amount
    }

    const newAdsetRes = await fetch(
      `${META_GRAPH_URL}/${formattedAccountId}/adsets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createAdsetBody)
      }
    )
    const newAdsetData = await newAdsetRes.json()

    if (newAdsetData.error) {
      return NextResponse.json({ error: newAdsetData.error.message }, { status: 400 })
    }

    const newAdsetId = newAdsetData.id
    let adsCopied = 0

    // 3. Fetch and duplicate ads
    await delay(100)
    const adsRes = await fetch(
      `${META_GRAPH_URL}/${sourceAdsetId}/ads?fields=name,creative&limit=100&access_token=${accessToken}`
    )
    const adsData = await adsRes.json()

    if (adsData.data && adsData.data.length > 0) {
      for (const ad of adsData.data) {
        await delay(100)

        try {
          const newAdRes = await fetch(
            `${META_GRAPH_URL}/${formattedAccountId}/ads`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                adset_id: newAdsetId,
                name: ad.name,
                creative: { creative_id: ad.creative.id },
                status: copyStatus,
                access_token: accessToken
              })
            }
          )
          const newAdData = await newAdRes.json()

          if (newAdData.error) {
            errors.push(`Ad "${ad.name}": ${newAdData.error.message}`)
            continue
          }

          adsCopied++
        } catch (adErr) {
          errors.push(`Ad "${ad.name}": ${adErr instanceof Error ? adErr.message : 'Unknown error'}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      newAdsetId,
      newAdsetName: adsetName,
      adsCopied,
      errors: errors.length > 0 ? errors : undefined,
      needsSync: true  // Tells frontend to auto-sync for immediate display
    })

  } catch (err) {
    console.error('Duplicate adset error:', err)
    return NextResponse.json({ error: 'Failed to duplicate ad set' }, { status: 500 })
  }
}
