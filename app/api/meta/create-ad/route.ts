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

interface CreateAdRequest {
  userId: string
  adAccountId: string
  adsetId: string
  pageId: string
  adName?: string
  objective: 'leads' | 'conversions' | 'traffic'  // Inherited from campaign
  formId?: string  // For lead gen campaigns
  creatives: Creative[]
  primaryText: string
  headline: string
  description?: string
  websiteUrl: string
  urlTags?: string
  ctaType: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateAdRequest = await request.json()

    const {
      userId,
      adAccountId,
      adsetId,
      pageId,
      adName,
      objective,
      formId,
      creatives,
      primaryText,
      headline,
      description,
      websiteUrl,
      urlTags,
      ctaType
    } = body

    // Validate required fields
    if (!userId || !adAccountId || !adsetId || !pageId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'At least one creative is required' }, { status: 400 })
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
        error: 'Ad creation requires a paid plan',
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

      const baseName = adName || 'New Ad'
      const creativePayload: Record<string, unknown> = {
        name: `${baseName} - Creative ${i + 1}`,
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
        name: creatives.length > 1 ? `${baseName} ${i + 1}` : baseName,
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

    if (adIds.length === 0) {
      return NextResponse.json({
        error: 'Failed to create any ads. Check your creatives and try again.'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      adsetId,
      adIds,
      adsCreated: adIds.length,
      status: 'PAUSED'
    })

  } catch (err) {
    console.error('Create ad error:', err)
    return NextResponse.json({ error: 'Failed to create ad' }, { status: 500 })
  }
}
