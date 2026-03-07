import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

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
  cities?: { key: string; name: string; radius: number }[]
}

interface PlacementConfig {
  mode: 'automatic' | 'manual'
  publisherPlatforms: string[]
  facebookPositions: string[]
  instagramPositions: string[]
  messengerPositions: string[]
  audienceNetworkPositions: string[]
}

interface TargetingOption {
  id: string
  name: string
  type: 'interest' | 'behavior'
}

interface CustomAudience {
  id: string
  name: string
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
  creativeMode?: 'separate' | 'carousel' // separate = N ads, carousel = 1 ad with N cards
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
  selectedCustomAudiences?: CustomAudience[]
  selectedExcludedAudiences?: CustomAudience[]
  ageMin?: number
  ageMax?: number
  // New Tier 1 fields
  gender?: 'male' | 'female'
  attributionWindow?: '7d_click' | '1d_click' | '1d_click_1d_view'
  placements?: PlacementConfig
  budgetMode?: 'daily' | 'lifetime'
  lifetimeBudget?: number
  startDate?: string
  endDate?: string
  bidStrategy?: string
  bidAmount?: number
  roasFloor?: number
  // Lead gen conversion location
  conversionLocation?: 'instant_form' | 'website' | 'messenger'
  optimizeForQuality?: boolean
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
      creativeMode,
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
      selectedCustomAudiences,
      selectedExcludedAudiences,
      ageMin,
      ageMax,
      gender,
      attributionWindow,
      placements,
      budgetMode,
      lifetimeBudget,
      startDate,
      endDate,
      bidStrategy: requestBidStrategy,
      bidAmount,
      roasFloor,
      conversionLocation,
      optimizeForQuality,
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

    // For conversion campaigns or leads+website, get pixel ID
    let pixelId: string | null = null
    if (objective === 'conversions' || (objective === 'leads' && conversionLocation === 'website')) {
      const pixelsResponse = await fetch(
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
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
    // Build geo_locations from location target
    let geoLocations: Record<string, unknown>
    if (locationTarget.type === 'city') {
      if (locationTarget.cities && locationTarget.cities.length > 0) {
        geoLocations = {
          cities: locationTarget.cities.map(c => ({
            key: c.key,
            radius: c.radius || 25,
            distance_unit: 'mile'
          }))
        }
      } else if (locationTarget.key) {
        geoLocations = {
          cities: [{
            key: locationTarget.key,
            radius: locationTarget.radius || 25,
            distance_unit: 'mile'
          }]
        }
      } else {
        geoLocations = { countries: ['US'] }
      }
    } else {
      geoLocations = { countries: locationTarget.countries || ['US'] }
    }

    const targeting: Record<string, unknown> = {
      geo_locations: geoLocations,
      age_min: ageMin || 18,
      age_max: ageMax || 65
    }

    // Gender targeting
    if (gender === 'male') {
      targeting.genders = [1]
    } else if (gender === 'female') {
      targeting.genders = [2]
    }

    // Manual placements
    if (placements && placements.mode === 'manual' && placements.publisherPlatforms.length > 0) {
      targeting.publisher_platforms = placements.publisherPlatforms
      if (placements.facebookPositions.length > 0) targeting.facebook_positions = placements.facebookPositions
      if (placements.instagramPositions.length > 0) targeting.instagram_positions = placements.instagramPositions
      if (placements.messengerPositions.length > 0) targeting.messenger_positions = placements.messengerPositions
      if (placements.audienceNetworkPositions.length > 0) targeting.audience_network_positions = placements.audienceNetworkPositions
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

      // Custom audiences are top-level targeting fields (NOT in flexible_spec)
      if (selectedCustomAudiences && selectedCustomAudiences.length > 0) {
        targeting.custom_audiences = selectedCustomAudiences.map(ca => ({ id: ca.id }))
      }
      if (selectedExcludedAudiences && selectedExcludedAudiences.length > 0) {
        targeting.excluded_custom_audiences = selectedExcludedAudiences.map(ea => ({ id: ea.id }))
      }
    }

    const adsetPayload: Record<string, unknown> = {
      name: adsetName,
      campaign_id: campaignId,
      status: 'PAUSED',
      targeting,
      optimization_goal: (objective === 'leads' && optimizeForQuality) ? 'QUALITY_LEAD' : OPTIMIZATION_GOAL_MAP[objective],
      billing_event: 'IMPRESSIONS',
      access_token: accessToken
    }

    // Add destination_type for lead gen campaigns
    if (objective === 'leads') {
      const DESTINATION_MAP: Record<string, string> = { instant_form: 'on_ad', website: 'website', messenger: 'messenger' }
      adsetPayload.destination_type = DESTINATION_MAP[conversionLocation || 'instant_form']
    }

    // Add promoted_object for conversion campaigns
    if (objective === 'conversions' && pixelId) {
      adsetPayload.promoted_object = {
        pixel_id: pixelId,
        custom_event_type: conversionEvent || 'PURCHASE'
      }
    }

    // Add promoted_object for lead generation campaigns
    if (objective === 'leads') {
      if (conversionLocation === 'website' && pixelId) {
        adsetPayload.promoted_object = {
          pixel_id: pixelId,
          custom_event_type: 'LEAD'
        }
      } else if (conversionLocation === 'messenger') {
        adsetPayload.promoted_object = {
          page_id: pageId
        }
      } else if (formId) {
        adsetPayload.promoted_object = {
          page_id: pageId,
          lead_gen_form_id: formId
        }
      }
    }

    // Add budget - required for ABO, optional cap for CBO
    if (!isCBO && dailyBudget) {
      if (budgetMode === 'lifetime' && lifetimeBudget) {
        adsetPayload.lifetime_budget = Math.round(lifetimeBudget * 100)
      } else {
        adsetPayload.daily_budget = Math.round(dailyBudget * 100)
      }
      adsetPayload.is_adset_budget_sharing_enabled = false
      adsetPayload.bid_strategy = requestBidStrategy || 'LOWEST_COST_WITHOUT_CAP'
    } else if (isCBO && hasSpendCap && dailyBudget) {
      adsetPayload.daily_spend_cap = Math.round(dailyBudget * 100)
    }

    // Bid amount for Cost Cap / Bid Cap
    if ((requestBidStrategy === 'COST_CAP' || requestBidStrategy === 'BID_CAP') && bidAmount) {
      adsetPayload.bid_amount = Math.round(bidAmount * 100)
    }

    // Minimum ROAS floor
    if (requestBidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && roasFloor) {
      adsetPayload.roas_average_floor = roasFloor
    }

    // Campaign scheduling
    if (startDate) adsetPayload.start_time = new Date(startDate).toISOString()
    if (endDate) adsetPayload.end_time = new Date(endDate).toISOString()

    // Attribution window
    if (attributionWindow && attributionWindow !== '7d_click') {
      const specs: Record<string, { event_type: string; window_days: number }[]> = {
        '1d_click': [{ event_type: 'CLICK_THROUGH', window_days: 1 }],
        '1d_click_1d_view': [
          { event_type: 'CLICK_THROUGH', window_days: 1 },
          { event_type: 'VIEW_THROUGH', window_days: 1 },
        ],
      }
      adsetPayload.attribution_spec = specs[attributionWindow]
    }

    // Instagram actor ID for Instagram placements
    if (placements && placements.mode === 'manual' && placements.publisherPlatforms.includes('instagram')) {
      try {
        const igRes = await fetch(
          `${META_GRAPH_URL}/${pageId}/instagram_accounts?fields=id&access_token=${accessToken}`
        )
        const igData = await igRes.json()
        if (igData.data && igData.data.length > 0) {
          adsetPayload.instagram_actor_id = igData.data[0].id
        }
      } catch (err) {
        console.error('Failed to fetch Instagram account:', err)
      }
    }

    const adsetResponse = await fetch(
      `${META_GRAPH_URL}/act_${cleanAdAccountId}/adsets`,
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
    if (creativeMode === 'carousel' && creatives.length >= 2) {
      // ========== CAROUSEL: Create single ad with multiple cards ==========
      const carouselCards = creatives.map((creative) => ({
        image_hash: creative.imageHash,
        link: websiteUrl,
        name: headline,
        description: description || undefined
      }))

      let ctaLink = websiteUrl
      if (urlTags) {
        const separator = websiteUrl.includes('?') ? '&' : '?'
        ctaLink = `${websiteUrl}${separator}${urlTags}`
      }

      const carouselStorySpec: Record<string, unknown> = {
        page_id: pageId,
        link_data: {
          link: websiteUrl,
          message: primaryText,
          child_attachments: carouselCards,
          call_to_action: (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger')
            ? { type: ctaType, value: { lead_gen_form_id: formId } }
            : { type: ctaType, value: { link: ctaLink } }
        }
      }

      const carouselCreativePayload: Record<string, unknown> = {
        name: `${adsetName} - Carousel`,
        object_story_spec: carouselStorySpec,
        access_token: accessToken
      }

      const creativeResponse = await fetch(
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(carouselCreativePayload)
        }
      )

      const creativeResult = await creativeResponse.json()
      if (creativeResult.error) {
        console.error('Carousel creative creation error:', creativeResult.error)
        return NextResponse.json({
          error: creativeResult.error.message || 'Failed to create carousel creative',
          details: creativeResult.error.error_user_msg
        }, { status: 400 })
      }

      const adPayload: Record<string, unknown> = {
        name: `${adsetName} - Carousel Ad`,
        adset_id: adsetId,
        creative: { creative_id: creativeResult.id },
        status: 'PAUSED',
        access_token: accessToken
      }

      const adResponse = await fetch(
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/ads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adPayload)
        }
      )

      const adResult = await adResponse.json()
      if (adResult.error) {
        console.error('Carousel ad creation error:', adResult.error)
        return NextResponse.json({
          error: adResult.error.message || 'Failed to create carousel ad'
        }, { status: 400 })
      }

      adIds.push(adResult.id)
    } else {
      // ========== SEPARATE: Create individual ads ==========
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

        if (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger') {
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
        } else if (creative.thumbnailUrl && !creative.thumbnailUrl.match(/\.(mp4|mov|avi|webm)(\?|$)/i)) {
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

        if (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger') {
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
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/adcreatives`,
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
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/ads`,
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
    } // End of else block (separate ads)

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
