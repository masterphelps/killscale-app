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

interface AdsetTargetingOverride {
  sourceAdsetId: string
  customTargeting: CustomTargeting
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, sourceCampaignId, newName, copyStatus = 'PAUSED', adsetTargetingOverrides, campaignBudgetOverride, adsetBudgetOverrides } = await request.json() as {
      userId: string
      adAccountId: string
      sourceCampaignId: string
      newName?: string
      copyStatus?: 'PAUSED' | 'ACTIVE'
      adsetTargetingOverrides?: AdsetTargetingOverride[]
      campaignBudgetOverride?: number | null  // CBO daily budget in dollars
      adsetBudgetOverrides?: Array<{ sourceAdsetId: string; dailyBudget: number }>  // ABO per-adset daily budgets in dollars
    }

    // Build a map for quick lookup of per-adset targeting overrides
    const targetingOverrideMap = new Map<string, CustomTargeting>()
    if (adsetTargetingOverrides) {
      for (const override of adsetTargetingOverrides) {
        targetingOverrideMap.set(override.sourceAdsetId, override.customTargeting)
      }
    }

    // Build a map for per-adset budget overrides (ABO)
    const budgetOverrideMap = new Map<string, number>()
    if (adsetBudgetOverrides) {
      for (const override of adsetBudgetOverrides) {
        budgetOverrideMap.set(override.sourceAdsetId, override.dailyBudget)
      }
    }

    if (!userId || !adAccountId || !sourceCampaignId) {
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

    // 1. Fetch source campaign details
    const campaignRes = await fetch(
      `${META_GRAPH_URL}/${sourceCampaignId}?fields=name,objective,special_ad_categories,daily_budget,lifetime_budget,bid_strategy,buying_type&access_token=${accessToken}`
    )
    const campaignData = await campaignRes.json()

    if (campaignData.error) {
      console.error('[duplicate-campaign] Failed to fetch source campaign:', campaignData.error)
      // Use user-friendly message if available, otherwise fall back to generic message
      const errorMsg = campaignData.error.error_user_msg || campaignData.error.message || 'Failed to fetch source campaign'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 2. Create new campaign
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const campaignName = newName || `${campaignData.name} - Copy`

    const createCampaignBody: Record<string, any> = {
      name: campaignName,
      objective: campaignData.objective,
      status: copyStatus,
      special_ad_categories: campaignData.special_ad_categories || [],
      access_token: accessToken
    }

    // Include buying_type (required for certain campaign types)
    if (campaignData.buying_type) {
      createCampaignBody.buying_type = campaignData.buying_type
    }

    // Copy budget if CBO — use override if provided, otherwise copy source
    if (campaignBudgetOverride != null) {
      // User set a custom budget (in dollars) — Meta API expects cents
      createCampaignBody.daily_budget = Math.round(campaignBudgetOverride * 100)
    } else if (campaignData.daily_budget) {
      createCampaignBody.daily_budget = campaignData.daily_budget
    }
    if (campaignData.lifetime_budget && campaignBudgetOverride == null) {
      createCampaignBody.lifetime_budget = campaignData.lifetime_budget
    }
    if (campaignData.bid_strategy) {
      createCampaignBody.bid_strategy = campaignData.bid_strategy
    }

    // For ABO campaigns (no campaign budget), Meta requires is_adset_budget_sharing_enabled
    // This allows ad sets to share up to 20% of budget for optimization
    const isABO = !campaignData.daily_budget && !campaignData.lifetime_budget
    if (isABO) {
      // Default to false (no budget sharing) to preserve original campaign behavior
      createCampaignBody.is_adset_budget_sharing_enabled = false
    }

    const newCampaignRes = await fetch(
      `${META_GRAPH_URL}/${formattedAccountId}/campaigns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createCampaignBody)
      }
    )
    const newCampaignData = await newCampaignRes.json()

    if (newCampaignData.error) {
      console.error('[duplicate-campaign] Failed to create campaign:', {
        error: newCampaignData.error,
        sentBody: { ...createCampaignBody, access_token: '[REDACTED]' }
      })
      const errorMsg = newCampaignData.error.error_user_msg || newCampaignData.error.message || 'Failed to create campaign'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const newCampaignId = newCampaignData.id
    let adsetsCopied = 0
    let adsCopied = 0

    // 3. Fetch and duplicate ad sets
    await delay(100)
    const adsetsRes = await fetch(
      `${META_GRAPH_URL}/${sourceCampaignId}/adsets?fields=name,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,promoted_object,bid_strategy,bid_amount&limit=100&access_token=${accessToken}`
    )
    const adsetsData = await adsetsRes.json()

    if (adsetsData.data && adsetsData.data.length > 0) {
      for (const adset of adsetsData.data) {
        await delay(100)

        // Build targeting - check for per-adset override, otherwise copy from source
        let targeting = adset.targeting
        const adsetOverride = targetingOverrideMap.get(adset.id)
        if (adsetOverride) {
          targeting = {
            geo_locations: adsetOverride.locationType === 'city' && adsetOverride.locationKey
              ? {
                  cities: [{
                    key: adsetOverride.locationKey,
                    radius: adsetOverride.locationRadius || 25,
                    distance_unit: 'mile'
                  }]
                }
              : {
                  countries: adsetOverride.countries || ['US']
                },
            age_min: adsetOverride.ageMin || 18,
            age_max: adsetOverride.ageMax || 65
          }

          // Add detailed targeting if custom mode
          if (adsetOverride.targetingMode === 'custom') {
            const flexibleSpecEntry: Record<string, unknown> = {}

            if (adsetOverride.interests && adsetOverride.interests.length > 0) {
              flexibleSpecEntry.interests = adsetOverride.interests.map(i => ({
                id: i.id,
                name: i.name
              }))
            }

            if (adsetOverride.behaviors && adsetOverride.behaviors.length > 0) {
              flexibleSpecEntry.behaviors = adsetOverride.behaviors.map(b => ({
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
          campaign_id: newCampaignId,
          name: adset.name,
          optimization_goal: adset.optimization_goal,
          billing_event: adset.billing_event,
          targeting,
          status: copyStatus,
          access_token: accessToken
        }

        // Use budget override if provided, otherwise copy source
        const adsetBudgetOverride = budgetOverrideMap.get(adset.id)
        if (adsetBudgetOverride != null) {
          createAdsetBody.daily_budget = Math.round(adsetBudgetOverride * 100)
        } else if (adset.daily_budget) {
          createAdsetBody.daily_budget = adset.daily_budget
        }
        if (adset.lifetime_budget && adsetBudgetOverride == null) {
          createAdsetBody.lifetime_budget = adset.lifetime_budget
        }
        if (adset.promoted_object) {
          createAdsetBody.promoted_object = adset.promoted_object
        }
        if (adset.bid_strategy) {
          createAdsetBody.bid_strategy = adset.bid_strategy
        }
        if (adset.bid_amount) {
          createAdsetBody.bid_amount = adset.bid_amount
        }

        try {
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
            const msg = newAdsetData.error.error_user_msg || newAdsetData.error.message
            errors.push(`Ad set "${adset.name}": ${msg}`)
            continue
          }

          const newAdsetId = newAdsetData.id
          adsetsCopied++

          // 4. Fetch and duplicate ads for this ad set
          await delay(100)
          const adsRes = await fetch(
            `${META_GRAPH_URL}/${adset.id}/ads?fields=name,creative&limit=100&access_token=${accessToken}`
          )
          const adsData = await adsRes.json()

          if (adsData.data && adsData.data.length > 0) {
            for (const ad of adsData.data) {
              await delay(100)

              // Create new ad using existing creative
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
                  const msg = newAdData.error.error_user_msg || newAdData.error.message
                  errors.push(`Ad "${ad.name}": ${msg}`)
                  continue
                }

                adsCopied++
              } catch (adErr) {
                errors.push(`Ad "${ad.name}": ${adErr instanceof Error ? adErr.message : 'Unknown error'}`)
              }
            }
          }
        } catch (adsetErr) {
          errors.push(`Ad set "${adset.name}": ${adsetErr instanceof Error ? adsetErr.message : 'Unknown error'}`)
        }
      }
    }

    // 5. Log to campaign_creations
    await supabase
      .from('campaign_creations')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        campaign_id: newCampaignId,
        budget_type: campaignData.daily_budget ? 'cbo' : 'abo',
        daily_budget: campaignData.daily_budget ? campaignData.daily_budget / 100 : 0,
        status: copyStatus,
        source_campaign_id: sourceCampaignId,
        is_duplicate: true
      })

    return NextResponse.json({
      success: true,
      newCampaignId,
      newCampaignName: campaignName,
      adsetsCopied,
      adsCopied,
      errors: errors.length > 0 ? errors : undefined,
      needsSync: true  // Tells frontend to auto-sync for immediate display
    })

  } catch (err) {
    console.error('Duplicate campaign error:', err)
    return NextResponse.json({ error: 'Failed to duplicate campaign' }, { status: 500 })
  }
}
