import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface NewAdsetConfig {
  name: string
  campaignId: string
  dailyBudget?: number
  copyTargetingFrom?: string
}

interface Destination {
  type: 'existing' | 'new'
  adsetId?: string
  newAdsetConfig?: NewAdsetConfig
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      adAccountId,
      sourceAdIds,
      destinations,
      preserveUtm = true,
      copyStatus = 'PAUSED'
    } = await request.json() as {
      userId: string
      adAccountId: string
      sourceAdIds: string[]
      destinations: Destination[]
      preserveUtm?: boolean
      copyStatus?: 'PAUSED' | 'ACTIVE'
    }

    if (!userId || !adAccountId || !sourceAdIds || !destinations) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (sourceAdIds.length === 0 || destinations.length === 0) {
      return NextResponse.json({ error: 'No ads or destinations specified' }, { status: 400 })
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
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

    // Results tracking
    const results: Array<{
      destinationType: 'existing' | 'new'
      destinationAdsetId: string
      adsCreated: string[]
      errors: string[]
    }> = []
    let totalAdsCreated = 0
    let totalAdsetsCreated = 0

    // 1. First, fetch source ads' creative info
    const sourceAdsData: Map<string, { name: string; creativeId: string }> = new Map()

    for (const adId of sourceAdIds) {
      await delay(50)
      try {
        const adRes = await fetch(
          `https://graph.facebook.com/v18.0/${adId}?fields=name,creative&access_token=${accessToken}`
        )
        const adData = await adRes.json()
        if (!adData.error && adData.creative) {
          sourceAdsData.set(adId, {
            name: adData.name,
            creativeId: adData.creative.id
          })
        }
      } catch (err) {
        console.error(`Failed to fetch ad ${adId}:`, err)
      }
    }

    // 2. Process each destination
    for (const dest of destinations) {
      const destResult: typeof results[0] = {
        destinationType: dest.type,
        destinationAdsetId: '',
        adsCreated: [],
        errors: []
      }

      let targetAdsetId: string

      // Create new adset if needed
      if (dest.type === 'new' && dest.newAdsetConfig) {
        await delay(100)

        // Fetch targeting from source adset if specified
        let targeting: any = {
          geo_locations: { countries: ['US'] }
        }

        if (dest.newAdsetConfig.copyTargetingFrom) {
          try {
            const targetingRes = await fetch(
              `https://graph.facebook.com/v18.0/${dest.newAdsetConfig.copyTargetingFrom}?fields=targeting,optimization_goal,billing_event,promoted_object&access_token=${accessToken}`
            )
            const targetingData = await targetingRes.json()
            if (!targetingData.error) {
              targeting = targetingData.targeting
            }
          } catch (err) {
            console.error('Failed to fetch targeting:', err)
          }
        }

        // Create the new adset
        try {
          const createAdsetBody: Record<string, any> = {
            campaign_id: dest.newAdsetConfig.campaignId,
            name: dest.newAdsetConfig.name,
            targeting,
            optimization_goal: 'OFFSITE_CONVERSIONS',
            billing_event: 'IMPRESSIONS',
            status: copyStatus,
            access_token: accessToken
          }

          if (dest.newAdsetConfig.dailyBudget) {
            createAdsetBody.daily_budget = Math.round(dest.newAdsetConfig.dailyBudget * 100)
          }

          const newAdsetRes = await fetch(
            `https://graph.facebook.com/v18.0/${formattedAccountId}/adsets`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createAdsetBody)
            }
          )
          const newAdsetData = await newAdsetRes.json()

          if (newAdsetData.error) {
            destResult.errors.push(`Failed to create adset: ${newAdsetData.error.message}`)
            results.push(destResult)
            continue
          }

          targetAdsetId = newAdsetData.id
          destResult.destinationAdsetId = targetAdsetId
          totalAdsetsCreated++
        } catch (err) {
          destResult.errors.push(`Failed to create adset: ${err instanceof Error ? err.message : 'Unknown error'}`)
          results.push(destResult)
          continue
        }
      } else {
        targetAdsetId = dest.adsetId!
        destResult.destinationAdsetId = targetAdsetId
      }

      // 3. Copy each ad to this destination
      const sourceAdsArray = Array.from(sourceAdsData.entries())
      for (const [sourceAdId, adInfo] of sourceAdsArray) {
        await delay(100)

        try {
          const createAdBody: Record<string, any> = {
            adset_id: targetAdsetId,
            name: adInfo.name,
            creative: { creative_id: adInfo.creativeId },
            status: copyStatus,
            access_token: accessToken
          }

          const newAdRes = await fetch(
            `https://graph.facebook.com/v18.0/${formattedAccountId}/ads`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createAdBody)
            }
          )
          const newAdData = await newAdRes.json()

          if (newAdData.error) {
            destResult.errors.push(`Ad "${adInfo.name}": ${newAdData.error.message}`)
          } else {
            destResult.adsCreated.push(newAdData.id)
            totalAdsCreated++
          }
        } catch (err) {
          destResult.errors.push(`Ad "${adInfo.name}": ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      results.push(destResult)
    }

    return NextResponse.json({
      success: true,
      adsCreated: totalAdsCreated,
      adsetsCreated: totalAdsetsCreated,
      results
    })

  } catch (err) {
    console.error('Copy ads error:', err)
    return NextResponse.json({ error: 'Failed to copy ads' }, { status: 500 })
  }
}
