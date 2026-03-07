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
  thumbnailUrl?: string  // Auto-generated thumbnail URL for videos
  thumbnailHash?: string // Uploaded thumbnail image hash (more reliable)
  fileName: string
}

interface LocationTarget {
  type: 'city' | 'country'
  key?: string
  name?: string
  radius?: number
  countries?: string[]
  // Multiple cities support
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

interface CreateCampaignRequest {
  userId: string
  adAccountId: string
  pageId: string
  budgetType: 'cbo' | 'abo'
  existingCampaignId?: string // For ABO "add to existing"
  campaignName: string
  adsetName?: string
  objective: 'leads' | 'conversions' | 'traffic'
  conversionEvent?: string // The specific pixel event (PURCHASE, COMPLETE_REGISTRATION, LEAD, etc.)
  formId?: string // Lead form ID for lead generation campaigns
  dailyBudget: number
  specialAdCategory?: 'HOUSING' | 'CREDIT' | 'EMPLOYMENT' | null
  locationTarget: LocationTarget
  creatives: Creative[]
  creativeMode?: 'separate' | 'carousel' // separate = N ads, carousel = 1 ad with N cards
  primaryText: string
  headline: string
  description?: string
  websiteUrl: string
  urlTags?: string  // URL parameters for tracking (Meta substitutes {{ad.id}} etc.)
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
  // Performance Set specific fields
  isPerformanceSet?: boolean
  existingCreativeIds?: { adId: string; adName: string; creativeId: string }[]
}

// Map our objectives to Meta's
const OBJECTIVE_MAP = {
  leads: 'OUTCOME_LEADS',
  conversions: 'OUTCOME_SALES',
  traffic: 'OUTCOME_TRAFFIC'
}

const OPTIMIZATION_GOAL_MAP = {
  leads: 'LEAD_GENERATION',
  conversions: 'OFFSITE_CONVERSIONS',
  traffic: 'LINK_CLICKS'
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateCampaignRequest = await request.json()

    const {
      userId,
      adAccountId,
      pageId,
      budgetType,
      existingCampaignId,
      campaignName,
      adsetName,
      objective,
      conversionEvent,
      formId,
      dailyBudget,
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
      isPerformanceSet,
      existingCreativeIds
    } = body

    // Validate required fields
    if (!userId || !adAccountId || !pageId || !campaignName || !objective || !dailyBudget) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Performance Set uses existing creative IDs, regular campaigns need new creatives
    if (isPerformanceSet) {
      if (!existingCreativeIds || existingCreativeIds.length === 0) {
        return NextResponse.json({ error: 'Performance Set requires at least one existing creative' }, { status: 400 })
      }
    } else if (creatives.length === 0) {
      return NextResponse.json({ error: 'At least one creative is required' }, { status: 400 })
    }

    // Strip 'act_' prefix if already present (avoid act_act_ issue)
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
        error: 'Campaign creation requires a paid plan',
        upgradeRequired: true
      }, { status: 403 })
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
    const budgetCents = Math.round(dailyBudget * 100)

    let campaignId: string
    let adsetId: string
    const adIds: string[] = []

    // Build special ad categories array
    const specialAdCategories = specialAdCategory ? [specialAdCategory] : []

    // For conversion campaigns or leads+website, we need a pixel ID
    let pixelId: string | null = null
    if (objective === 'conversions' || (objective === 'leads' && conversionLocation === 'website')) {
      // Fetch available pixels for this ad account
      const pixelsResponse = await fetch(
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
      )
      const pixelsResult = await pixelsResponse.json()

      if (pixelsResult.error) {
        console.error('Failed to fetch pixels:', pixelsResult.error)
        return NextResponse.json({
          error: 'Failed to fetch Facebook Pixel. Please ensure you have a pixel set up for this ad account.'
        }, { status: 400 })
      }

      if (!pixelsResult.data || pixelsResult.data.length === 0) {
        return NextResponse.json({
          error: 'No Facebook Pixel found for this ad account. Conversion campaigns require a pixel.'
        }, { status: 400 })
      }

      // Use the first available pixel
      pixelId = pixelsResult.data[0].id
    }

    // ========== STEP 1: Create or use existing campaign ==========
    if (budgetType === 'abo' && existingCampaignId) {
      // Use existing campaign
      campaignId = existingCampaignId
    } else {
      // Create new campaign
      const campaignPayload: Record<string, unknown> = {
        name: campaignName,
        objective: OBJECTIVE_MAP[objective],
        status: 'PAUSED',
        special_ad_categories: specialAdCategories,
        access_token: accessToken
      }

      // Add budget at campaign level for CBO
      if (budgetType === 'cbo') {
        if (budgetMode === 'lifetime' && lifetimeBudget) {
          campaignPayload.lifetime_budget = Math.round(lifetimeBudget * 100)
        } else {
          campaignPayload.daily_budget = budgetCents
        }
        campaignPayload.bid_strategy = requestBidStrategy || 'LOWEST_COST_WITHOUT_CAP'
        // Cost Cap and Bid Cap need bid_amount at adset level (handled below)
      } else {
        // ABO campaigns require this field at campaign level
        campaignPayload.is_adset_budget_sharing_enabled = false
      }

      const campaignResponse = await fetch(
        `${META_GRAPH_URL}/act_${cleanAdAccountId}/campaigns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campaignPayload)
        }
      )

      const campaignResult = await campaignResponse.json()

      if (campaignResult.error) {
        console.error('Campaign creation error:', campaignResult.error)
        return NextResponse.json({
          error: campaignResult.error.message || 'Failed to create campaign'
        }, { status: 400 })
      }

      campaignId = campaignResult.id
    }

    // ========== STEP 2: Create ad set ==========
    // Build geo_locations from location target
    let geoLocations: Record<string, unknown>
    if (locationTarget.type === 'city') {
      // Support both single city (legacy) and multiple cities
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
      // Age targeting (Meta supports 18-65, where 65 means 65+)
      age_min: ageMin || 18,
      age_max: ageMax || 65
    }

    // Gender targeting: 1 = male, 2 = female, omit for all
    if (gender === 'male') {
      targeting.genders = [1]
    } else if (gender === 'female') {
      targeting.genders = [2]
    }

    // Manual placements
    if (placements && placements.mode === 'manual' && placements.publisherPlatforms.length > 0) {
      targeting.publisher_platforms = placements.publisherPlatforms
      if (placements.facebookPositions.length > 0) {
        targeting.facebook_positions = placements.facebookPositions
      }
      if (placements.instagramPositions.length > 0) {
        targeting.instagram_positions = placements.instagramPositions
      }
      if (placements.messengerPositions.length > 0) {
        targeting.messenger_positions = placements.messengerPositions
      }
      if (placements.audienceNetworkPositions.length > 0) {
        targeting.audience_network_positions = placements.audienceNetworkPositions
      }
    }

    // Add detailed targeting (flexible_spec) if custom mode
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
        console.log('Custom targeting applied:', JSON.stringify(targeting.flexible_spec))
      }

      // Custom audiences are top-level targeting fields (NOT in flexible_spec)
      if (selectedCustomAudiences && selectedCustomAudiences.length > 0) {
        targeting.custom_audiences = selectedCustomAudiences.map(ca => ({ id: ca.id }))
      }
      if (selectedExcludedAudiences && selectedExcludedAudiences.length > 0) {
        targeting.excluded_custom_audiences = selectedExcludedAudiences.map(ea => ({ id: ea.id }))
      }
    }

    // Ad set suffix based on creative enhancement setting
    // -ks = KillScale Recommended (no enhancements)
    // -ap = Meta Advantage+ (with enhancements)
    const adsetSuffix = creativeEnhancements ? '-ap' : '-ks'

    const adsetPayload: Record<string, unknown> = {
      name: adsetName || `${campaignName}${adsetSuffix}`,
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

    // Add promoted_object for conversion campaigns (requires pixel + event)
    if (objective === 'conversions' && pixelId) {
      adsetPayload.promoted_object = {
        pixel_id: pixelId,
        custom_event_type: conversionEvent || 'PURCHASE'
      }
    }

    // Add promoted_object for lead generation campaigns
    if (objective === 'leads') {
      if (conversionLocation === 'website' && pixelId) {
        // Website leads: use pixel
        adsetPayload.promoted_object = {
          pixel_id: pixelId,
          custom_event_type: 'LEAD'
        }
      } else if (conversionLocation === 'messenger') {
        // Messenger leads: use page
        adsetPayload.promoted_object = {
          page_id: pageId
        }
      } else if (formId) {
        // Instant Form leads: use page + form (default)
        adsetPayload.promoted_object = {
          page_id: pageId,
          lead_gen_form_id: formId
        }
      }
    }

    // Add budget at ad set level for ABO
    if (budgetType === 'abo') {
      if (budgetMode === 'lifetime' && lifetimeBudget) {
        adsetPayload.lifetime_budget = Math.round(lifetimeBudget * 100)
      } else {
        adsetPayload.daily_budget = budgetCents
      }
      // ABO adsets need a bid strategy
      adsetPayload.bid_strategy = requestBidStrategy || 'LOWEST_COST_WITHOUT_CAP'
    }

    // Bid amount for Cost Cap / Bid Cap (always on adset level)
    if ((requestBidStrategy === 'COST_CAP' || requestBidStrategy === 'BID_CAP') && bidAmount) {
      adsetPayload.bid_amount = Math.round(bidAmount * 100)
    }

    // Minimum ROAS floor
    if (requestBidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && roasFloor) {
      adsetPayload.roas_average_floor = roasFloor
    }

    // Campaign scheduling
    if (startDate) {
      adsetPayload.start_time = new Date(startDate).toISOString()
    }
    if (endDate) {
      adsetPayload.end_time = new Date(endDate).toISOString()
    }

    // Attribution window
    if (attributionWindow && attributionWindow !== '7d_click') {
      const ATTRIBUTION_SPECS: Record<string, { event_type: string; window_days: number }[]> = {
        '1d_click': [{ event_type: 'CLICK_THROUGH', window_days: 1 }],
        '1d_click_1d_view': [
          { event_type: 'CLICK_THROUGH', window_days: 1 },
          { event_type: 'VIEW_THROUGH', window_days: 1 },
        ],
      }
      adsetPayload.attribution_spec = ATTRIBUTION_SPECS[attributionWindow]
    }

    // Instagram actor ID for Instagram placements
    if (placements && placements.mode === 'manual' && placements.publisherPlatforms.includes('instagram')) {
      // Fetch Instagram account linked to this page
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

    // Meta requires this field when not using campaign budget (ABO or when campaign has no budget)
    // Always set it to false when there's no CBO budget to be safe
    if (budgetType === 'abo' || !adsetPayload.daily_spend_cap) {
      adsetPayload.is_adset_budget_sharing_enabled = false
    }

    console.log('[create-campaign v2] Creating adset with payload:', JSON.stringify(adsetPayload, null, 2))

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
      console.error('Ad set payload was:', JSON.stringify(adsetPayload, null, 2))
      return NextResponse.json({
        error: adsetResult.error.message || 'Failed to create ad set',
        details: adsetResult.error.error_user_msg || adsetResult.error.error_subcode
      }, { status: 400 })
    }

    adsetId = adsetResult.id

    // ========== STEP 3: Create ads ==========

    if (isPerformanceSet && existingCreativeIds && existingCreativeIds.length > 0) {
      // ========== PERFORMANCE SET: Create ads using existing creative IDs ==========
      console.log(`Creating Performance Set with ${existingCreativeIds.length} existing creatives`)

      // Rate limiting delay helper
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

      for (let i = 0; i < existingCreativeIds.length; i++) {
        const { adId: sourceAdId, adName, creativeId } = existingCreativeIds[i]

        // Create ad using existing creative_id (no need to create new creative)
        const adPayload: Record<string, unknown> = {
          name: adName,  // Keep the original ad name
          adset_id: adsetId,
          creative: { creative_id: creativeId },
          status: 'PAUSED',
          access_token: accessToken
        }

        console.log(`Creating ad ${i + 1}/${existingCreativeIds.length}: ${adName} with creative ${creativeId}`)

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
          console.error(`Ad creation error for ${adName}:`, adResult.error)
          continue
        }

        adIds.push(adResult.id)

        // Add delay between ad creation calls to avoid rate limiting (not after last one)
        if (i < existingCreativeIds.length - 1) {
          await delay(100)
        }
      }
    } else if (creativeMode === 'carousel' && creatives.length >= 2) {
      // ========== CAROUSEL: Create single ad with multiple cards ==========
      // Carousel ads require images only (no videos)
      const carouselCards = creatives.map((creative) => ({
        image_hash: creative.imageHash,
        link: websiteUrl,
        name: headline,  // Meta uses 'name' for card title in carousel
        description: description || undefined
      }))

      const carouselStorySpec: Record<string, unknown> = {
        page_id: pageId,
        link_data: {
          link: websiteUrl,
          message: primaryText,
          child_attachments: carouselCards,
          call_to_action: (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger')
            ? { type: ctaType, value: { lead_gen_form_id: formId } }
            : { type: ctaType, value: { link: websiteUrl } }
        }
      }

      const carouselCreativePayload: Record<string, unknown> = {
        name: `${campaignName} - Carousel`,
        object_story_spec: carouselStorySpec,
        access_token: accessToken
      }

      console.log('[create-campaign] Creating carousel creative with payload:', JSON.stringify(carouselCreativePayload, null, 2))

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
        console.error('[create-campaign] Carousel creative creation error:', creativeResult.error)
        return NextResponse.json({
          error: creativeResult.error.message || 'Failed to create carousel creative',
          details: creativeResult.error.error_user_msg
        }, { status: 400 })
      }

      // Create single carousel ad
      const adPayload: Record<string, unknown> = {
        name: `${campaignName} - Carousel Ad`,
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
        console.error('[create-campaign] Carousel ad creation error:', adResult.error)
        return NextResponse.json({
          error: adResult.error.message || 'Failed to create carousel ad'
        }, { status: 400 })
      }

      adIds.push(adResult.id)

      // UTM update for carousel ad
      if (urlTags && adResult.id) {
        try {
          const actualUrlTags = urlTags
            .replace('{{ad.id}}', adResult.id)
            .replace('{{campaign.name}}', campaignName.replace(/\s+/g, '_'))

          console.log(`[create-campaign] Updating carousel ad ${adResult.id} with UTM: ${actualUrlTags}`)

          // Fetch the creative we just created
          const creativeUrl = `${META_GRAPH_URL}/${creativeResult.id}?fields=id,name,object_story_spec&access_token=${accessToken}`
          const creativeResponse = await fetch(creativeUrl)
          const creativeData = await creativeResponse.json()

          if (creativeData.error || !creativeData.object_story_spec) {
            console.error('[create-campaign] Failed to fetch carousel creative for UTM update:', creativeData.error)
          } else {
            const newObjectStorySpec = { ...creativeData.object_story_spec }

            // Update carousel link_data CTA with UTM
            if (newObjectStorySpec.link_data) {
              const baseLink = newObjectStorySpec.link_data.call_to_action?.value?.link || websiteUrl
              const cleanBaseLink = baseLink.split('?')[0]
              newObjectStorySpec.link_data.call_to_action = {
                ...newObjectStorySpec.link_data.call_to_action,
                value: { link: `${cleanBaseLink}?${actualUrlTags}` }
              }

              // Also update child_attachments links
              if (newObjectStorySpec.link_data.child_attachments) {
                newObjectStorySpec.link_data.child_attachments = newObjectStorySpec.link_data.child_attachments.map(
                  (card: Record<string, unknown>) => ({
                    ...card,
                    link: `${(card.link as string || websiteUrl).split('?')[0]}?${actualUrlTags}`
                  })
                )
              }
            }

            // Create new creative with UTM
            const newCreativeResponse = await fetch(
              `${META_GRAPH_URL}/act_${cleanAdAccountId}/adcreatives`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: `${campaignName} - Carousel (with UTM)`,
                  object_story_spec: newObjectStorySpec,
                  access_token: accessToken
                })
              }
            )

            const newCreativeResult = await newCreativeResponse.json()

            if (newCreativeResult.error) {
              console.error('[create-campaign] Failed to create UTM carousel creative:', newCreativeResult.error)
            } else {
              // Update ad to use new creative with UTM
              const updateAdResponse = await fetch(
                `${META_GRAPH_URL}/${adResult.id}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    creative: { creative_id: newCreativeResult.id },
                    access_token: accessToken
                  })
                }
              )

              const updateAdResult = await updateAdResponse.json()
              if (updateAdResult.error) {
                console.error('[create-campaign] Failed to update carousel ad with UTM creative:', updateAdResult.error)
              } else {
                console.log(`[create-campaign] Successfully updated carousel ad ${adResult.id} with UTM tracking`)
              }
            }
          }
        } catch (utmError) {
          console.error('[create-campaign] Error updating carousel UTM:', utmError)
        }
      }
    } else {
      // ========== SEPARATE: Create new ad creatives and ads ==========
      for (let i = 0; i < creatives.length; i++) {
      const creative = creatives[i]

      // Build creative payload - different structure for images vs videos
      let objectStorySpec: Record<string, unknown>

      if (creative.type === 'video' && creative.videoId) {
        // VIDEO: Use video_data structure
        const videoData: Record<string, unknown> = {
          video_id: creative.videoId,
          message: primaryText,
          title: headline,
          link_description: description || undefined
        }

        // Build CTA - different for lead forms vs website/messenger
        if (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger') {
          videoData.call_to_action = {
            type: ctaType,
            value: { lead_gen_form_id: formId }
          }
        } else {
          // Don't embed UTM here - will be added via post-creation update with actual ad ID
          videoData.call_to_action = {
            type: ctaType,
            value: { link: websiteUrl }
          }
        }

        // Add thumbnail - prefer image_hash (uploaded thumbnail) over image_url
        // Safety: never pass a video URL as image_url — Meta rejects non-image URLs
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
        // IMAGE: Use link_data structure
        const linkData: Record<string, unknown> = {
          link: websiteUrl,
          message: primaryText,
          name: headline
        }

        // Build CTA - different for lead forms vs website/messenger
        if (objective === 'leads' && formId && conversionLocation !== 'website' && conversionLocation !== 'messenger') {
          linkData.call_to_action = {
            type: ctaType,
            value: { lead_gen_form_id: formId }
          }
        } else {
          // Don't embed UTM here - will be added via post-creation update with actual ad ID
          linkData.call_to_action = {
            type: ctaType,
            value: { link: websiteUrl }
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

      // Build creative payload - url_tags must be at creative level, NOT inside link_data
      const creativePayload: Record<string, unknown> = {
        name: `${campaignName} - Creative ${i + 1}`,
        object_story_spec: objectStorySpec,
        access_token: accessToken
      }

      // NOTE: url_tags is write-only in Meta API - can't be detected later
      // UTMs are now embedded in CTA link for both image and video ads

      // Log creative details for debugging
      console.log(`Creating creative ${i + 1}:`, {
        type: creative.type,
        imageHash: creative.imageHash,
        videoId: creative.videoId,
        thumbnailHash: creative.thumbnailHash || 'none',
        thumbnailUrl: creative.thumbnailUrl ? 'present' : 'missing',
        fileName: creative.fileName,
        urlTags: urlTags || 'NOT SET',
        hasUrlTags: !!creativePayload.url_tags,
        objective: objective
      })

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
        console.error('Creative payload was:', JSON.stringify(creativePayload, null, 2))
        // Return error instead of silently continuing
        return NextResponse.json({
          error: creativeResult.error.message || 'Failed to create creative',
          details: creativeResult.error.error_user_msg || creativeResult.error.error_subcode
        }, { status: 400 })
      }

      // Create ad using this creative
      const adPayload: Record<string, unknown> = {
        name: `${campaignName} - Ad ${i + 1}`,
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

      // ========== Post-creation: Update ad with correct UTM using actual ad ID ==========
      if (urlTags && adResult.id) {
        try {
          // Replace template variables with actual values
          const actualUrlTags = urlTags
            .replace('{{ad.id}}', adResult.id)
            .replace('{{campaign.name}}', campaignName.replace(/\s+/g, '_'))

          console.log(`[create-campaign] Updating ad ${adResult.id} with UTM: ${actualUrlTags}`)

          // Fetch the creative we just created to get its full spec
          const creativeUrl = `${META_GRAPH_URL}/${creativeResult.id}?fields=id,name,object_story_spec&access_token=${accessToken}`
          const creativeResponse = await fetch(creativeUrl)
          const creativeData = await creativeResponse.json()

          if (creativeData.error || !creativeData.object_story_spec) {
            console.error('[create-campaign] Failed to fetch creative for UTM update:', creativeData.error)
          } else {
            // Build new creative with UTM in the CTA link
            const newObjectStorySpec = { ...creativeData.object_story_spec }

            if (newObjectStorySpec.link_data) {
              // IMAGE ADS: Update CTA link with UTM
              const baseLink = newObjectStorySpec.link_data.call_to_action?.value?.link || websiteUrl
              const cleanBaseLink = baseLink.split('?')[0]
              newObjectStorySpec.link_data.call_to_action = {
                ...newObjectStorySpec.link_data.call_to_action,
                value: { link: `${cleanBaseLink}?${actualUrlTags}` }
              }
            } else if (newObjectStorySpec.video_data) {
              // VIDEO ADS: Update CTA link with UTM
              const baseLink = newObjectStorySpec.video_data.call_to_action?.value?.link || websiteUrl
              const cleanBaseLink = baseLink.split('?')[0]
              newObjectStorySpec.video_data.call_to_action = {
                ...newObjectStorySpec.video_data.call_to_action,
                value: { link: `${cleanBaseLink}?${actualUrlTags}` }
              }
              // Remove duplicate image fields
              if (newObjectStorySpec.video_data.image_url && newObjectStorySpec.video_data.image_hash) {
                delete newObjectStorySpec.video_data.image_url
              }
            }

            // Create new creative with UTM
            const newCreativeResponse = await fetch(
              `${META_GRAPH_URL}/act_${cleanAdAccountId}/adcreatives`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: `${campaignName} - Creative ${i + 1} (with UTM)`,
                  object_story_spec: newObjectStorySpec,
                  access_token: accessToken
                })
              }
            )

            const newCreativeResult = await newCreativeResponse.json()

            if (newCreativeResult.error) {
              console.error('[create-campaign] Failed to create UTM creative:', newCreativeResult.error)
            } else {
              // Update ad to use new creative with UTM
              const updateAdResponse = await fetch(
                `${META_GRAPH_URL}/${adResult.id}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    creative: { creative_id: newCreativeResult.id },
                    access_token: accessToken
                  })
                }
              )

              const updateAdResult = await updateAdResponse.json()
              if (updateAdResult.error) {
                console.error('[create-campaign] Failed to update ad with UTM creative:', updateAdResult.error)
              } else {
                console.log(`[create-campaign] Successfully updated ad ${adResult.id} with UTM tracking`)
              }
            }
          }
        } catch (utmError) {
          console.error('[create-campaign] Error updating UTM:', utmError)
          // Don't fail the whole operation - ad was created, just UTM update failed
        }
      }
      }
    } // End of else block (regular creative creation)

    if (adIds.length === 0) {
      return NextResponse.json({
        error: 'Failed to create any ads. Check your creatives and try again.'
      }, { status: 400 })
    }

    // ========== STEP 4: Log to campaign_creations table ==========
    const { error: insertError } = await supabase
      .from('campaign_creations')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        page_id: pageId,
        campaign_id: campaignId,
        campaign_name: campaignName,
        adset_id: adsetId,
        ad_ids: adIds,
        objective,
        budget_type: budgetType,
        daily_budget: dailyBudget,
        special_ad_category: specialAdCategory,
        location_targeting: locationTarget,
        creative_enhancements: creativeEnhancements,
        status: 'PAUSED'
      })

    if (insertError) {
      console.error('Database insert error:', insertError)
      // Don't fail - the campaign was created successfully on Meta
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
    console.error('Create campaign error:', err)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
