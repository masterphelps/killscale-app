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
}

interface TargetingOption {
  id: string
  name: string
  type: 'interest' | 'behavior'
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
  dailyBudget: number
  specialAdCategory?: 'HOUSING' | 'CREDIT' | 'EMPLOYMENT' | null
  locationTarget: LocationTarget
  creatives: Creative[]
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
      dailyBudget,
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
      selectedBehaviors
    } = body

    // Validate required fields
    if (!userId || !adAccountId || !pageId || !campaignName || !objective || !dailyBudget) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'At least one creative is required' }, { status: 400 })
    }

    // Strip 'act_' prefix if already present (avoid act_act_ issue)
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Check subscription - Pro or Agency only
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .single()

    const planLower = subscription?.plan?.toLowerCase() || ''
    if (!subscription || !['pro', 'agency'].includes(planLower)) {
      return NextResponse.json({
        error: 'Campaign creation requires Pro or Agency plan',
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

    // For conversion campaigns, we need a pixel ID
    let pixelId: string | null = null
    if (objective === 'conversions') {
      // Fetch available pixels for this ad account
      const pixelsResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adspixels?fields=id,name&access_token=${accessToken}`
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
        campaignPayload.daily_budget = budgetCents
        campaignPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
      }

      const campaignResponse = await fetch(
        `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/campaigns`,
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
      optimization_goal: OPTIMIZATION_GOAL_MAP[objective],
      billing_event: 'IMPRESSIONS',
      access_token: accessToken
    }

    // Add promoted_object for conversion campaigns (requires pixel + event)
    if (objective === 'conversions' && pixelId) {
      adsetPayload.promoted_object = {
        pixel_id: pixelId,
        custom_event_type: conversionEvent || 'PURCHASE'  // Use selected event or default to PURCHASE
      }
    }

    // Add budget at ad set level for ABO
    if (budgetType === 'abo') {
      adsetPayload.daily_budget = budgetCents
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

    adsetId = adsetResult.id

    // ========== STEP 3: Create ad creatives and ads ==========
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
          link_description: description || undefined,
          call_to_action: {
            type: ctaType,
            value: { link: websiteUrl }
          }
        }

        // Add thumbnail - required by Meta for video ads
        // Prefer image_hash (uploaded thumbnail) over image_url (Meta auto-generated)
        if (creative.thumbnailHash) {
          videoData.image_hash = creative.thumbnailHash
        } else if (creative.thumbnailUrl) {
          videoData.image_url = creative.thumbnailUrl
        }

        // For video ads, url_tags is not supported in video_data
        // Instead, append UTM params directly to the CTA link
        if (urlTags) {
          const separator = websiteUrl.includes('?') ? '&' : '?'
          videoData.call_to_action = {
            type: ctaType,
            value: { link: `${websiteUrl}${separator}${urlTags}` }
          }
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
          name: headline,
          call_to_action: {
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

        // Add URL tags for tracking (Meta substitutes {{ad.id}} etc. at click time)
        if (urlTags) {
          linkData.url_tags = urlTags
        }

        objectStorySpec = {
          page_id: pageId,
          link_data: linkData
        }
      }

      const creativePayload: Record<string, unknown> = {
        name: `${campaignName} - Creative ${i + 1}`,
        object_story_spec: objectStorySpec,
        access_token: accessToken
      }

      // Log creative details for debugging
      console.log(`Creating creative ${i + 1}:`, {
        type: creative.type,
        imageHash: creative.imageHash,
        videoId: creative.videoId,
        thumbnailHash: creative.thumbnailHash || 'none',
        thumbnailUrl: creative.thumbnailUrl ? 'present' : 'missing',
        fileName: creative.fileName
      })

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
        // Continue with other creatives even if one fails
        continue
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
