import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Creative {
  type: 'image' | 'video'
  imageHash?: string
  videoId?: string
  thumbnailUrl?: string
  thumbnailHash?: string
  fileName: string
}

interface LocationTarget {
  type: 'city' | 'country'
  key?: string
  name?: string
  radius?: number
  countries?: string[]
}

interface TargetingOption {
  id: string
  name: string
  type: 'interest' | 'behavior'
}

interface CreateAdsetRequest {
  userId: string
  adAccountId: string
  campaignId: string
  pageId: string
  adsetName: string
  objective: 'leads' | 'conversions' | 'traffic'
  conversionEvent?: string
  formId?: string
  dailyBudget?: number  // Required for ABO, optional cap for CBO
  isCBO: boolean        // Whether the parent campaign is CBO
  hasSpendCap: boolean  // For CBO, whether to set spend cap
  specialAdCategory?: 'HOUSING' | 'CREDIT' | 'EMPLOYMENT' | null
  locationTarget: LocationTarget
  creatives: Creative[]
  primaryText: string
  headline: string
  description?: string
  websiteUrl: string
  urlTags?: string
  ctaType: string
  creativeEnhancements: boolean
  targetingMode?: 'broad' | 'custom'
  selectedInterests?: TargetingOption[]
  selectedBehaviors?: TargetingOption[]
  ageMin?: number
  ageMax?: number
}

const OPTIMIZATION_GOAL_MAP = {
  leads: 'LEAD_GENERATION',
  conversions: 'OFFSITE_CONVERSIONS',
  traffic: 'LINK_CLICKS'
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateAdsetRequest = await request.json()

    const {
      userId,
      adAccountId,
      campaignId,
      pageId,
      adsetName,
      objective,
      conversionEvent,
      formId,
      dailyBudget,
      isCBO,
      hasSpendCap,
      specialAdCategory,
      locationTarget,
      creatives,
      primaryText,
      headline,
      description,
      websiteUrl,
      urlTags,
      ctaType,
      creativeEnhancements,
      targetingMode,
      selectedInterests,
      selectedBehaviors,
      ageMin,
      ageMax
    } = body

    // Validate required fields
    if (!userId || !adAccountId || !campaignId || !pageId || !adsetName || !objective) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'At least one creative is required' }, { status: 400 })
    }

    // ABO requires budget, CBO with spend cap requires budget
    if (!isCBO && !dailyBudget) {
      return NextResponse.json({ error: 'Daily budget required for ABO campaigns' }, { status: 400 })
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Check subscription - check both Stripe and admin-granted subscriptions
    const [stripeResult, adminResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('admin_granted_subscriptions')
        .select('plan, expires_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    const stripeSub = stripeResult.data
    const adminSub = adminResult.data

    // Check if admin-granted subscription is valid
    const now = new Date()
    const adminSubValid = adminSub && adminSub.is_active && new Date(adminSub.expires_at) > now

    // Determine effective plan (admin-granted takes precedence)
    let planLower = ''
    if (adminSubValid) {
      planLower = adminSub.plan?.toLowerCase() || ''
    } else if (stripeSub && (stripeSub.status === 'active' || stripeSub.status === 'trialing')) {
      planLower = stripeSub.plan?.toLowerCase() || ''
    }

    if (!planLower || !['launch', 'scale', 'pro', 'agency'].includes(planLower)) {
      return NextResponse.json({
        error: 'Ad set creation requires a paid plan',
        upgradeRequired: true
      }, { status: 403 })
    }

    // Get Meta connection
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
    const adIds: string[] = []

    // For conversion campaigns, get pixel ID
    let pixelId: string | null = null
    if (objective === 'conversions') {
      const pixelsResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
      )
      const pixelsResult = await pixelsResponse.json()

      if (pixelsResult.error || !pixelsResult.data || pixelsResult.data.length === 0) {
        return NextResponse.json({
          error: 'No Facebook Pixel found. Conversion campaigns require a pixel.'
        }, { status: 400 })
      }
      pixelId = pixelsResult.data[0].id
    }

    // ========== Create Ad Set ==========
    const targeting: Record<string, unknown> = {
      geo_locations: locationTarget.type === 'city' && locationTarget.key
        ? {
            cities: [{
              key: locationTarget.key,
              radius: locationTarget.radius || 25,
              distance_unit: 'mile'
            }]
          }
        : {
            countries: locationTarget.countries || ['US']
          },
      // Age targeting (Meta supports 18-65, where 65 means 65+)
      age_min: ageMin || 18,
      age_max: ageMax || 65
    }

    // Add detailed targeting if custom mode
    if (targetingMode === 'custom') {
      const flexibleSpecEntry: Record<string, unknown> = {}

      if (selectedInterests && selectedInterests.length > 0) {
        flexibleSpecEntry.interests = selectedInterests.map(i => ({
          id: i.id,
          name: i.name
        }))
      }

      if (selectedBehaviors && selectedBehaviors.length > 0) {
        flexibleSpecEntry.behaviors = selectedBehaviors.map(b => ({
          id: b.id,
          name: b.name
        }))
      }

      if (Object.keys(flexibleSpecEntry).length > 0) {
        targeting.flexible_spec = [flexibleSpecEntry]
      }
    }

    const adsetPayload: Record<string, unknown> = {
      name: adsetName,
      campaign_id: campaignId,
      status: 'PAUSED',
      targeting,
      optimization_goal: OPTIMIZATION_GOAL_MAP[objective],
      billing_event: 'IMPRESSIONS',
      access_token: accessToken
    }

    // Add promoted_object for conversion campaigns
    if (objective === 'conversions' && pixelId) {
      adsetPayload.promoted_object = {
        pixel_id: pixelId,
        custom_event_type: conversionEvent || 'PURCHASE'
      }
    }

    // Add promoted_object for lead generation campaigns
    if (objective === 'leads' && formId) {
      adsetPayload.promoted_object = {
        page_id: pageId,
        lead_gen_form_id: formId
      }
    }

    // Add budget - required for ABO, optional cap for CBO
    if (!isCBO && dailyBudget) {
      // ABO: budget at ad set level
      adsetPayload.daily_budget = Math.round(dailyBudget * 100)
      // Meta requires this field for ABO ad sets
      adsetPayload.is_adset_budget_sharing_enabled = false
      // ABO adsets need a bid strategy - use lowest cost (highest volume)
      adsetPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
    } else if (isCBO && hasSpendCap && dailyBudget) {
      // CBO with spend cap
      adsetPayload.daily_spend_cap = Math.round(dailyBudget * 100)
    }

    const adsetResponse = await fetch(
      `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adsets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adsetPayload)
      }
    )

    const adsetResult = await adsetResponse.json()

    if (adsetResult.error) {
      console.error('Ad set creation error:', adsetResult.error)
      return NextResponse.json({
        error: adsetResult.error.message || 'Failed to create ad set'
      }, { status: 400 })
    }

    const adsetId = adsetResult.id

    // ========== Create Ads ==========
    for (let i = 0; i < creatives.length; i++) {
      const creative = creatives[i]

      let objectStorySpec: Record<string, unknown>

      if (creative.type === 'video' && creative.videoId) {
        const videoData: Record<string, unknown> = {
          video_id: creative.videoId,
          message: primaryText,
          title: headline,
          link_description: description || undefined
        }

        if (objective === 'leads' && formId) {
          videoData.call_to_action = {
            type: ctaType,
            value: { lead_gen_form_id: formId }
          }
        } else {
          let ctaLink = websiteUrl
          if (urlTags) {
            const separator = websiteUrl.includes('?') ? '&' : '?'
            ctaLink = `${websiteUrl}${separator}${urlTags}`
          }
          videoData.call_to_action = {
            type: ctaType,
            value: { link: ctaLink }
          }
        }

        if (creative.thumbnailHash) {
          videoData.image_hash = creative.thumbnailHash
        } else if (creative.thumbnailUrl) {
          videoData.image_url = creative.thumbnailUrl
        }

        objectStorySpec = {
          page_id: pageId,
          video_data: videoData
        }
      } else {
        const linkData: Record<string, unknown> = {
          link: websiteUrl,
          message: primaryText,
          name: headline
        }

        if (objective === 'leads' && formId) {
          linkData.call_to_action = {
            type: ctaType,
            value: { lead_gen_form_id: formId }
          }
        } else {
          let ctaLink = websiteUrl
          if (urlTags) {
            const separator = websiteUrl.includes('?') ? '&' : '?'
            ctaLink = `${websiteUrl}${separator}${urlTags}`
          }
          linkData.call_to_action = {
            type: ctaType,
            value: { link: ctaLink }
          }
        }

        if (description) {
          linkData.description = description
        }

        if (creative.imageHash) {
          linkData.image_hash = creative.imageHash
        }

        objectStorySpec = {
          page_id: pageId,
          link_data: linkData
        }
      }

      const creativePayload: Record<string, unknown> = {
        name: `${adsetName} - Creative ${i + 1}`,
        object_story_spec: objectStorySpec,
        access_token: accessToken
      }

      const creativeResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creativePayload)
        }
      )

      const creativeResult = await creativeResponse.json()

      if (creativeResult.error) {
        console.error('Creative creation error:', creativeResult.error)
        continue
      }

      const adPayload: Record<string, unknown> = {
        name: `${adsetName} - Ad ${i + 1}`,
        adset_id: adsetId,
        creative: { creative_id: creativeResult.id },
        status: 'PAUSED',
        access_token: accessToken
      }

      const adResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/ads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adPayload)
        }
      )

      const adResult = await adResponse.json()

      if (adResult.error) {
        console.error('Ad creation error:', adResult.error)
        continue
      }

      adIds.push(adResult.id)
    }

    if (adIds.length === 0) {
      return NextResponse.json({
        error: 'Failed to create any ads. Check your creatives and try again.'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      campaignId,
      adsetId,
      adIds,
      adsCreated: adIds.length,
      status: 'PAUSED'
    })

  } catch (err) {
    console.error('Create ad set error:', err)
    return NextResponse.json({ error: 'Failed to create ad set' }, { status: 500 })
  }
}
