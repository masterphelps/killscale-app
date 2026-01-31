import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, adId, adAccountId, urlTags } = await request.json() as {
      userId: string
      adId: string
      adAccountId: string
      urlTags: string  // e.g., "utm_source=facebook&utm_medium=paid&..."
    }

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
    console.log('[update-url-tags] Step 1: Fetching ad to get creative ID...')
    const adUrl = `${META_GRAPH_URL}/${adId}?fields=id,name,creative{id}&access_token=${accessToken}`
    const adResponse = await fetch(adUrl)
    const adResult = await adResponse.json()

    if (adResult.error) {
      console.error('[update-url-tags] Error fetching ad:', adResult.error)
      return NextResponse.json({ error: adResult.error.message }, { status: 400 })
    }

    const creativeId = adResult.creative?.id
    if (!creativeId) {
      return NextResponse.json({ error: 'Could not find creative for this ad' }, { status: 400 })
    }

    console.log('[update-url-tags] Found creative ID:', creativeId)

    // Step 2: Try to update url_tags directly on the existing creative
    // url_tags is a write-only field on creatives - we can POST to update it
    console.log('[update-url-tags] Step 2: Updating url_tags on creative...')
    const updateCreativeUrl = `${META_GRAPH_URL}/${creativeId}`
    const updateCreativeResponse = await fetch(updateCreativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url_tags: urlTags,
        access_token: accessToken
      })
    })

    const updateCreativeResult = await updateCreativeResponse.json()
    console.log('[update-url-tags] Update creative result:', JSON.stringify(updateCreativeResult, null, 2))

    if (updateCreativeResult.error) {
      console.error('[update-url-tags] Error updating creative url_tags:', updateCreativeResult.error)

      // If direct update fails, fall back to the old method of creating a new creative
      console.log('[update-url-tags] Falling back to creating new creative...')
      return await createNewCreativeWithUrlTags(
        adId,
        adAccountId,
        urlTags,
        accessToken,
        adResult.creative
      )
    }

    console.log('[update-url-tags] Creative url_tags updated successfully')

    return NextResponse.json({
      success: true,
      message: 'URL tags updated successfully',
      urlTags,
      creativeId
    })

  } catch (err) {
    console.error('Update URL tags error:', err)
    return NextResponse.json({ error: 'Failed to update URL tags' }, { status: 500 })
  }
}

// Fallback method: Create a new creative with url_tags and update the ad
async function createNewCreativeWithUrlTags(
  adId: string,
  adAccountId: string,
  urlTags: string,
  accessToken: string,
  existingCreativeRef: { id: string }
) {
  const cleanAdAccountId = adAccountId.replace(/^act_/, '')

  // Fetch full creative spec
  console.log('[update-url-tags] Fallback: Fetching full creative spec...')
  const creativeUrl = `${META_GRAPH_URL}/${existingCreativeRef.id}?fields=id,name,object_story_spec&access_token=${accessToken}`
  const creativeResponse = await fetch(creativeUrl)
  const existingCreative = await creativeResponse.json()

  if (existingCreative.error || !existingCreative.object_story_spec) {
    return NextResponse.json({
      error: existingCreative.error?.message || 'Could not fetch creative details'
    }, { status: 400 })
  }

  console.log('[update-url-tags] Fallback: Existing creative:', JSON.stringify(existingCreative, null, 2))

  // Build new object_story_spec
  const objectStorySpec = { ...existingCreative.object_story_spec }

  if (objectStorySpec.link_data) {
    objectStorySpec.link_data = {
      ...objectStorySpec.link_data,
      url_tags: urlTags
    }
  } else if (objectStorySpec.video_data) {
    // For video ads, append UTM params to the CTA link
    if (!objectStorySpec.video_data.call_to_action?.value?.link) {
      return NextResponse.json({
        error: 'Video ad does not have a call-to-action link'
      }, { status: 400 })
    }

    let baseUrl = objectStorySpec.video_data.call_to_action.value.link
    try {
      const urlObj = new URL(baseUrl)
      baseUrl = `${urlObj.origin}${urlObj.pathname}`
    } catch {
      // Keep original if URL parsing fails
    }

    const newLink = urlTags ? `${baseUrl}?${urlTags}` : baseUrl

    objectStorySpec.video_data = {
      ...objectStorySpec.video_data,
      call_to_action: {
        ...objectStorySpec.video_data.call_to_action,
        value: {
          ...objectStorySpec.video_data.call_to_action.value,
          link: newLink
        }
      }
    }

    // Remove duplicate image fields
    if (objectStorySpec.video_data.image_url && objectStorySpec.video_data.image_hash) {
      delete objectStorySpec.video_data.image_url
    }
  } else {
    return NextResponse.json({ error: 'Unsupported creative type' }, { status: 400 })
  }

  console.log('[update-url-tags] Fallback: New object_story_spec:', JSON.stringify(objectStorySpec, null, 2))

  // Create new creative
  const createCreativeUrl = `${META_GRAPH_URL}/act_${cleanAdAccountId}/adcreatives`
  const createCreativeResponse = await fetch(createCreativeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${existingCreative.name || 'Creative'} - Updated UTMs`,
      object_story_spec: objectStorySpec,
      access_token: accessToken
    })
  })

  const createCreativeResult = await createCreativeResponse.json()

  if (createCreativeResult.error) {
    console.error('[update-url-tags] Fallback: Error creating creative:', createCreativeResult.error)
    return NextResponse.json({
      error: createCreativeResult.error.message || 'Failed to create new creative'
    }, { status: 400 })
  }

  const newCreativeId = createCreativeResult.id
  console.log('[update-url-tags] Fallback: New creative created:', newCreativeId)

  // Update ad to use new creative
  const updateAdUrl = `${META_GRAPH_URL}/${adId}`
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
    console.error('[update-url-tags] Fallback: Error updating ad:', updateAdResult.error)
    return NextResponse.json({
      error: updateAdResult.error.message || 'Failed to update ad'
    }, { status: 400 })
  }

  console.log('[update-url-tags] Fallback: Ad updated successfully')

  return NextResponse.json({
    success: true,
    message: 'URL tags updated successfully (via new creative)',
    urlTags,
    newCreativeId
  })
}
