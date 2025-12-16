import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface UpdateCreativeRequest {
  userId: string
  adId: string
  adAccountId: string
  urlTags?: string
  primaryText?: string
  headline?: string
  description?: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adId, adAccountId, urlTags, primaryText, headline, description } = await request.json() as UpdateCreativeRequest

    if (!userId || !adId || !adAccountId) {
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

    // Step 1: Fetch the ad to get the creative ID
    console.log('[update-ad-creative] Step 1: Fetching ad to get creative ID...')
    const adUrl = `https://graph.facebook.com/v18.0/${adId}?fields=id,name,creative{id}&access_token=${accessToken}`
    const adResponse = await fetch(adUrl)
    const adResult = await adResponse.json()

    if (adResult.error) {
      console.error('[update-ad-creative] Error fetching ad:', adResult.error)
      return NextResponse.json({ error: adResult.error.message }, { status: 400 })
    }

    const creativeId = adResult.creative?.id
    if (!creativeId) {
      return NextResponse.json({ error: 'Could not find creative for this ad' }, { status: 400 })
    }

    console.log('[update-ad-creative] Found creative ID:', creativeId)

    // Step 2: Create new creative with updated fields and point ad to it
    // Note: Meta's API does not support updating url_tags or copy on existing creatives
    // The only way to change these fields is to create a new creative
    console.log('[update-ad-creative] Step 2: Creating new creative with updated fields...')

    return await updateAdCreative(
      adId,
      adAccountId,
      accessToken,
      { id: creativeId },
      { urlTags, primaryText, headline, description }
    )

  } catch (err) {
    console.error('Update ad creative error:', err)
    return NextResponse.json({ error: 'Failed to update ad creative' }, { status: 500 })
  }
}

// Create new creative with updated fields and update ad to use it
async function updateAdCreative(
  adId: string,
  adAccountId: string,
  accessToken: string,
  existingCreativeRef: { id: string },
  updates: {
    urlTags?: string
    primaryText?: string
    headline?: string
    description?: string
  }
) {
  const cleanAdAccountId = adAccountId.replace('act_', '')
  const { urlTags, primaryText, headline, description } = updates

  // Fetch full creative spec
  console.log('[update-ad-creative] Fetching full creative spec...')
  const creativeUrl = `https://graph.facebook.com/v18.0/${existingCreativeRef.id}?fields=id,name,object_story_spec&access_token=${accessToken}`
  const creativeResponse = await fetch(creativeUrl)
  const existingCreative = await creativeResponse.json()

  if (existingCreative.error || !existingCreative.object_story_spec) {
    return NextResponse.json({
      error: existingCreative.error?.message || 'Could not fetch creative details'
    }, { status: 400 })
  }

  console.log('[update-ad-creative] Existing creative:', JSON.stringify(existingCreative, null, 2))

  // Build new object_story_spec with updates
  const objectStorySpec = { ...existingCreative.object_story_spec }

  if (objectStorySpec.link_data) {
    // IMAGE ADS: Update link_data fields
    objectStorySpec.link_data = {
      ...objectStorySpec.link_data,
      // Update url_tags if provided, otherwise keep existing
      url_tags: urlTags !== undefined ? urlTags : objectStorySpec.link_data.url_tags,
      // Update copy fields if provided, otherwise keep existing
      message: primaryText !== undefined ? primaryText : objectStorySpec.link_data.message,
      name: headline !== undefined ? headline : objectStorySpec.link_data.name,
      description: description !== undefined ? description : objectStorySpec.link_data.description,
    }
  } else if (objectStorySpec.video_data) {
    // VIDEO ADS: Update video_data fields
    // For video ads, url_tags is not supported - UTMs are appended to the CTA link
    if (!objectStorySpec.video_data.call_to_action?.value?.link) {
      return NextResponse.json({
        error: 'Video ad does not have a call-to-action link'
      }, { status: 400 })
    }

    // Handle UTM params by appending to CTA link
    let ctaLink = objectStorySpec.video_data.call_to_action.value.link
    if (urlTags !== undefined) {
      // Strip existing query params and add new UTMs
      try {
        const urlObj = new URL(ctaLink)
        ctaLink = `${urlObj.origin}${urlObj.pathname}`
      } catch {
        // Keep original if URL parsing fails
      }
      ctaLink = urlTags ? `${ctaLink}?${urlTags}` : ctaLink
    }

    objectStorySpec.video_data = {
      ...objectStorySpec.video_data,
      // Update copy fields if provided, otherwise keep existing
      message: primaryText !== undefined ? primaryText : objectStorySpec.video_data.message,
      title: headline !== undefined ? headline : objectStorySpec.video_data.title,
      link_description: description !== undefined ? description : objectStorySpec.video_data.link_description,
      call_to_action: {
        ...objectStorySpec.video_data.call_to_action,
        value: {
          ...objectStorySpec.video_data.call_to_action.value,
          link: ctaLink
        }
      }
    }

    // Remove duplicate image fields that can cause errors
    if (objectStorySpec.video_data.image_url && objectStorySpec.video_data.image_hash) {
      delete objectStorySpec.video_data.image_url
    }
  } else {
    return NextResponse.json({ error: 'Unsupported creative type' }, { status: 400 })
  }

  console.log('[update-ad-creative] New object_story_spec:', JSON.stringify(objectStorySpec, null, 2))

  // Create new creative
  const createCreativeUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adcreatives`
  const createCreativeResponse = await fetch(createCreativeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${existingCreative.name || 'Creative'} - Updated`,
      object_story_spec: objectStorySpec,
      access_token: accessToken
    })
  })

  const createCreativeResult = await createCreativeResponse.json()

  if (createCreativeResult.error) {
    console.error('[update-ad-creative] Error creating creative:', createCreativeResult.error)
    return NextResponse.json({
      error: createCreativeResult.error.message || 'Failed to create new creative'
    }, { status: 400 })
  }

  const newCreativeId = createCreativeResult.id
  console.log('[update-ad-creative] New creative created:', newCreativeId)

  // Update ad to use new creative
  const updateAdUrl = `https://graph.facebook.com/v18.0/${adId}`
  const updateAdResponse = await fetch(updateAdUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creative: { creative_id: newCreativeId },
      access_token: accessToken
    })
  })

  const updateAdResult = await updateAdResponse.json()

  if (updateAdResult.error) {
    console.error('[update-ad-creative] Error updating ad:', updateAdResult.error)
    return NextResponse.json({
      error: updateAdResult.error.message || 'Failed to update ad'
    }, { status: 400 })
  }

  console.log('[update-ad-creative] Ad updated successfully')

  return NextResponse.json({
    success: true,
    message: 'Ad creative updated successfully',
    newCreativeId
  })
}
