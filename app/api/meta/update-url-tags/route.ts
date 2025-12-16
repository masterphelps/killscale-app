import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const cleanAdAccountId = adAccountId.replace('act_', '')

    // Step 1: Fetch the ad to get the creative ID and its full spec
    console.log('[update-url-tags] Step 1: Fetching ad and creative...')
    const adUrl = `https://graph.facebook.com/v18.0/${adId}?fields=id,name,creative{id,name,object_story_spec}&access_token=${accessToken}`
    const adResponse = await fetch(adUrl)
    const adResult = await adResponse.json()

    if (adResult.error) {
      console.error('[update-url-tags] Error fetching ad:', adResult.error)
      return NextResponse.json({ error: adResult.error.message }, { status: 400 })
    }

    const existingCreative = adResult.creative
    if (!existingCreative?.object_story_spec) {
      return NextResponse.json({ error: 'Could not find creative for this ad' }, { status: 400 })
    }

    console.log('[update-url-tags] Existing creative:', JSON.stringify(existingCreative, null, 2))

    // Step 2: Build new object_story_spec with updated url_tags
    const objectStorySpec = { ...existingCreative.object_story_spec }

    // Update url_tags in the appropriate location
    // - For link_data: url_tags goes directly in link_data as a separate field
    // - For video_data: url_tags is NOT supported - must append to the CTA link directly
    if (objectStorySpec.link_data) {
      objectStorySpec.link_data = {
        ...objectStorySpec.link_data,
        url_tags: urlTags
      }
    } else if (objectStorySpec.video_data) {
      // For video ads, url_tags is NOT supported as a field
      // Instead, we must append UTM params directly to the CTA link URL
      if (!objectStorySpec.video_data.call_to_action?.value?.link) {
        return NextResponse.json({
          error: 'Video ad does not have a call-to-action link to add URL tags to'
        }, { status: 400 })
      }

      // Get the base URL (strip any existing query params to replace them)
      let baseUrl = objectStorySpec.video_data.call_to_action.value.link
      const urlObj = new URL(baseUrl)
      // Keep the base URL without query string - we'll add fresh UTM params
      baseUrl = `${urlObj.origin}${urlObj.pathname}`

      // Append the new URL tags
      const separator = '?'
      const newLink = urlTags ? `${baseUrl}${separator}${urlTags}` : baseUrl

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
    } else {
      return NextResponse.json({ error: 'Unsupported creative type for URL tags' }, { status: 400 })
    }

    console.log('[update-url-tags] Step 2: New object_story_spec:', JSON.stringify(objectStorySpec, null, 2))

    // Step 3: Create a new creative with the updated url_tags
    console.log('[update-url-tags] Step 3: Creating new creative...')
    const createCreativeUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adcreatives`
    const creativePayload = {
      name: `${existingCreative.name || 'Creative'} - Updated UTMs`,
      object_story_spec: objectStorySpec,
      access_token: accessToken
    }

    const createCreativeResponse = await fetch(createCreativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creativePayload)
    })

    const createCreativeResult = await createCreativeResponse.json()

    if (createCreativeResult.error) {
      console.error('[update-url-tags] Error creating creative:', createCreativeResult.error)
      return NextResponse.json({
        error: createCreativeResult.error.message || 'Failed to create new creative'
      }, { status: 400 })
    }

    const newCreativeId = createCreativeResult.id
    console.log('[update-url-tags] New creative created:', newCreativeId)

    // Step 4: Update the ad to use the new creative
    console.log('[update-url-tags] Step 4: Updating ad to use new creative...')
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
      console.error('[update-url-tags] Error updating ad:', updateAdResult.error)
      return NextResponse.json({
        error: updateAdResult.error.message || 'Failed to update ad with new creative'
      }, { status: 400 })
    }

    console.log('[update-url-tags] Ad updated successfully')

    return NextResponse.json({
      success: true,
      message: 'URL tags updated successfully',
      urlTags,
      newCreativeId
    })

  } catch (err) {
    console.error('Update URL tags error:', err)
    return NextResponse.json({ error: 'Failed to update URL tags' }, { status: 500 })
  }
}
