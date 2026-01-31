import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Types for the formatted response
interface AdSetDetails {
  targeting: {
    locations: {
      countries: string[]
      regions: string[]
      cities: string[]
      zips: string[]
      locationTypes: string[]
      radius?: { distance: number; unit: string }
    }
    age: { min: number; max: number }
    genders: string
    audiences: {
      custom: string[]
      lookalike: string[]
      excluded: string[]
    }
    interests: string[]
    behaviors: string[]
    advantagePlusAudience: boolean
  }
  placements: {
    platforms: string[]
    facebookPositions: string[]
    instagramPositions: string[]
    messengerPositions: string[]
    audienceNetworkPositions: string[]
    devices: string[]
    advantagePlusPlacements: boolean
  }
  optimization: {
    goal: string
    bidStrategy: string
    billingEvent: string
  }
  schedule: {
    startTime: string | null
    endTime: string | null
  }
}

interface AdDetails {
  creative: {
    thumbnailUrl: string | null
    type: 'image' | 'video' | 'carousel' | 'unknown'
    headline: string | null
    body: string | null
    callToAction: string | null
    linkUrl: string | null
  }
}

// Friendly name mappings
const OPTIMIZATION_GOAL_NAMES: Record<string, string> = {
  'NONE': 'None',
  'APP_INSTALLS': 'App Installs',
  'AD_RECALL_LIFT': 'Ad Recall Lift',
  'ENGAGED_USERS': 'Engaged Users',
  'EVENT_RESPONSES': 'Event Responses',
  'IMPRESSIONS': 'Impressions',
  'LEAD_GENERATION': 'Lead Generation',
  'QUALITY_LEAD': 'Quality Leads',
  'LINK_CLICKS': 'Link Clicks',
  'OFFSITE_CONVERSIONS': 'Conversions',
  'PAGE_LIKES': 'Page Likes',
  'POST_ENGAGEMENT': 'Post Engagement',
  'QUALITY_CALL': 'Quality Calls',
  'REACH': 'Reach',
  'LANDING_PAGE_VIEWS': 'Landing Page Views',
  'VALUE': 'Value',
  'THRUPLAY': 'ThruPlay',
  'DERIVED_EVENTS': 'Derived Events',
  'CONVERSATIONS': 'Conversations',
}

const BID_STRATEGY_NAMES: Record<string, string> = {
  'LOWEST_COST_WITHOUT_CAP': 'Lowest Cost',
  'LOWEST_COST_WITH_BID_CAP': 'Bid Cap',
  'COST_CAP': 'Cost Cap',
  'LOWEST_COST_WITH_MIN_ROAS': 'ROAS Goal',
}

const BILLING_EVENT_NAMES: Record<string, string> = {
  'APP_INSTALLS': 'App Installs',
  'CLICKS': 'Clicks',
  'IMPRESSIONS': 'Impressions',
  'LINK_CLICKS': 'Link Clicks',
  'NONE': 'None',
  'OFFER_CLAIMS': 'Offer Claims',
  'PAGE_LIKES': 'Page Likes',
  'POST_ENGAGEMENT': 'Post Engagement',
  'THRUPLAY': 'ThruPlay',
  'PURCHASE': 'Purchase',
  'LISTING_INTERACTION': 'Listing Interaction',
}

const CTA_NAMES: Record<string, string> = {
  'LEARN_MORE': 'Learn More',
  'SHOP_NOW': 'Shop Now',
  'SIGN_UP': 'Sign Up',
  'BOOK_NOW': 'Book Now',
  'CONTACT_US': 'Contact Us',
  'GET_QUOTE': 'Get Quote',
  'GET_OFFER': 'Get Offer',
  'CALL_NOW': 'Call Now',
  'BUY_NOW': 'Buy Now',
  'ORDER_NOW': 'Order Now',
  'ADD_TO_CART': 'Add to Cart',
  'SEE_MENU': 'See Menu',
  'WATCH_MORE': 'Watch More',
  'LISTEN_NOW': 'Listen Now',
  'DOWNLOAD': 'Download',
  'INSTALL_APP': 'Install App',
  'USE_APP': 'Use App',
  'PLAY_GAME': 'Play Game',
  'APPLY_NOW': 'Apply Now',
  'REQUEST_TIME': 'Request Time',
  'GET_DIRECTIONS': 'Get Directions',
  'SEND_MESSAGE': 'Send Message',
  'WHATSAPP_MESSAGE': 'WhatsApp Message',
  'MESSAGE_PAGE': 'Message Page',
  'SUBSCRIBE': 'Subscribe',
  'GET_STARTED': 'Get Started',
  'SEE_MORE': 'See More',
  'OPEN_LINK': 'Open Link',
  'GET_TICKETS': 'Get Tickets',
  'INTERESTED': 'Interested',
  'DONATE_NOW': 'Donate Now',
  'NO_BUTTON': 'No Button',
}

const PLATFORM_NAMES: Record<string, string> = {
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'messenger': 'Messenger',
  'audience_network': 'Audience Network',
}

const POSITION_NAMES: Record<string, string> = {
  // Facebook positions
  'feed': 'Feed',
  'right_hand_column': 'Right Column',
  'instant_article': 'Instant Articles',
  'marketplace': 'Marketplace',
  'video_feeds': 'Video Feeds',
  'story': 'Stories',
  'search': 'Search Results',
  'instream_video': 'In-Stream Video',
  'facebook_reels': 'Reels',
  'facebook_reels_overlay': 'Reels Overlay',
  // Instagram positions
  'stream': 'Feed',
  'explore': 'Explore',
  'explore_home': 'Explore Home',
  'reels': 'Reels',
  'profile_feed': 'Profile Feed',
  'ig_search': 'Search Results',
  // Messenger positions
  'messenger_home': 'Inbox',
  'sponsored_messages': 'Sponsored Messages',
  'messenger_stories': 'Stories',
  // Audience Network positions
  'classic': 'Native, Banner, Interstitial',
  'rewarded_video': 'Rewarded Video',
  'instream_video_mobile': 'In-Stream Video',
}

const DEVICE_NAMES: Record<string, string> = {
  'mobile': 'Mobile',
  'desktop': 'Desktop',
}

// Helper to format gender
function formatGender(genders?: number[]): string {
  if (!genders || genders.length === 0 || (genders.includes(1) && genders.includes(2))) {
    return 'All'
  }
  if (genders.includes(1) && !genders.includes(2)) {
    return 'Men'
  }
  if (genders.includes(2) && !genders.includes(1)) {
    return 'Women'
  }
  return 'All'
}

// Helper to extract names from flexible_spec
function extractFlexibleSpecItems(flexibleSpec: any[], type: 'interests' | 'behaviors'): string[] {
  if (!Array.isArray(flexibleSpec)) return []

  const items: string[] = []
  for (const spec of flexibleSpec) {
    if (type === 'interests' && spec.interests) {
      items.push(...spec.interests.map((i: any) => i.name))
    }
    if (type === 'behaviors' && spec.behaviors) {
      items.push(...spec.behaviors.map((b: any) => b.name))
    }
  }
  return items
}

// Parse adset targeting data
function parseAdSetDetails(data: any): AdSetDetails {
  const targeting = data.targeting || {}
  const geoLocations = targeting.geo_locations || {}

  // Check for Advantage+ audience
  const advantagePlusAudience = targeting.targeting_automation?.advantage_audience === 1

  // Check for Advantage+ placements (no specific placement restrictions)
  const hasSpecificPlacements = targeting.publisher_platforms ||
    targeting.facebook_positions ||
    targeting.instagram_positions ||
    targeting.messenger_positions ||
    targeting.audience_network_positions
  const advantagePlusPlacements = !hasSpecificPlacements

  return {
    targeting: {
      locations: {
        countries: geoLocations.countries || [],
        regions: (geoLocations.regions || []).map((r: any) => r.name || r),
        cities: (geoLocations.cities || []).map((c: any) => c.name || c),
        zips: (geoLocations.zips || []).map((z: any) => z.key || z),
        locationTypes: geoLocations.location_types || [],
        radius: geoLocations.custom_locations?.[0] ? {
          distance: geoLocations.custom_locations[0].radius,
          unit: geoLocations.custom_locations[0].distance_unit || 'mile'
        } : undefined,
      },
      age: {
        min: targeting.age_min || 18,
        max: targeting.age_max || 65,
      },
      genders: formatGender(targeting.genders),
      audiences: {
        custom: (targeting.custom_audiences || []).map((a: any) => a.name || a.id),
        lookalike: (targeting.custom_audiences || [])
          .filter((a: any) => a.subtype === 'LOOKALIKE')
          .map((a: any) => a.name || a.id),
        excluded: (targeting.excluded_custom_audiences || []).map((a: any) => a.name || a.id),
      },
      interests: extractFlexibleSpecItems(targeting.flexible_spec, 'interests'),
      behaviors: extractFlexibleSpecItems(targeting.flexible_spec, 'behaviors'),
      advantagePlusAudience,
    },
    placements: {
      platforms: (targeting.publisher_platforms || ['facebook', 'instagram', 'messenger', 'audience_network'])
        .map((p: string) => PLATFORM_NAMES[p] || p),
      facebookPositions: (targeting.facebook_positions || [])
        .map((p: string) => POSITION_NAMES[p] || p),
      instagramPositions: (targeting.instagram_positions || [])
        .map((p: string) => POSITION_NAMES[p] || p),
      messengerPositions: (targeting.messenger_positions || [])
        .map((p: string) => POSITION_NAMES[p] || p),
      audienceNetworkPositions: (targeting.audience_network_positions || [])
        .map((p: string) => POSITION_NAMES[p] || p),
      devices: (targeting.device_platforms || ['mobile', 'desktop'])
        .map((d: string) => DEVICE_NAMES[d] || d),
      advantagePlusPlacements,
    },
    optimization: {
      goal: OPTIMIZATION_GOAL_NAMES[data.optimization_goal] || data.optimization_goal || 'Unknown',
      bidStrategy: BID_STRATEGY_NAMES[data.bid_strategy] || data.bid_strategy || 'Lowest Cost',
      billingEvent: BILLING_EVENT_NAMES[data.billing_event] || data.billing_event || 'Unknown',
    },
    schedule: {
      startTime: data.start_time || null,
      endTime: data.end_time || null,
    },
  }
}

// Parse ad creative data
function parseAdDetails(data: any): AdDetails {
  const creative = data.creative || {}

  // Determine creative type
  let type: 'image' | 'video' | 'carousel' | 'unknown' = 'unknown'
  if (creative.object_type === 'VIDEO' || creative.video_id) {
    type = 'video'
  } else if (creative.object_type === 'PHOTO' || creative.image_url || creative.image_hash) {
    type = 'image'
  } else if (creative.object_story_spec?.link_data?.child_attachments) {
    type = 'carousel'
  }

  // Extract copy from object_story_spec if available
  const linkData = creative.object_story_spec?.link_data || {}
  const videoData = creative.object_story_spec?.video_data || {}

  return {
    creative: {
      thumbnailUrl: creative.thumbnail_url || creative.image_url || null,
      type,
      headline: creative.title || linkData.name || videoData.title || null,
      body: creative.body || linkData.message || videoData.message || null,
      callToAction: CTA_NAMES[creative.call_to_action_type] || creative.call_to_action_type || null,
      linkUrl: creative.link_url || linkData.link || null,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, entityType, entityId } = await request.json()

    if (!userId || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (entityType !== 'adset' && entityType !== 'ad') {
      return NextResponse.json({ error: 'Invalid entity type. Must be "adset" or "ad"' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
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

    // Build Meta API URL based on entity type
    let url: string
    if (entityType === 'adset') {
      url = `${META_GRAPH_URL}/${entityId}?fields=targeting,optimization_goal,bid_strategy,billing_event,start_time,end_time&access_token=${accessToken}`
    } else {
      url = `${META_GRAPH_URL}/${entityId}?fields=creative{id,name,title,body,call_to_action_type,link_url,thumbnail_url,image_url,image_hash,video_id,object_type,object_story_spec}&access_token=${accessToken}`
    }

    // Fetch from Meta API
    const response = await fetch(url)
    const data = await response.json()

    if (data.error) {
      console.error('Meta API error:', data.error)

      // Handle specific error types
      if (data.error.code === 190) {
        return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
      }
      if (data.error.code === 100) {
        return NextResponse.json({ error: 'Entity not found or deleted' }, { status: 404 })
      }
      if (data.error.code === 17 || data.error.code === 4) {
        return NextResponse.json({ error: 'Rate limit reached, try again shortly' }, { status: 429 })
      }

      return NextResponse.json({ error: data.error.message || 'Meta API error' }, { status: 500 })
    }

    // Transform the response
    const details = entityType === 'adset'
      ? parseAdSetDetails(data)
      : parseAdDetails(data)

    return NextResponse.json({
      entityType,
      entityId,
      details,
    })

  } catch (err) {
    console.error('Entity details error:', err)
    return NextResponse.json({ error: 'Failed to fetch entity details' }, { status: 500 })
  }
}
