import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CopyOverride {
  primaryText: string
  headline: string
  description: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, sourceAdId, targetAdsetId, newName, copyStatus = 'PAUSED', copyOverride } = await request.json() as {
      userId: string
      adAccountId: string
      sourceAdId: string
      targetAdsetId?: string // If not provided, use same ad set
      newName?: string
      copyStatus?: 'PAUSED' | 'ACTIVE'
      copyOverride?: CopyOverride
    }

    if (!userId || !adAccountId || !sourceAdId) {
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

    // 1. Fetch source ad details
    const adRes = await fetch(
      `${META_GRAPH_URL}/${sourceAdId}?fields=name,adset_id,creative&access_token=${accessToken}`
    )
    const adData = await adRes.json()

    if (adData.error) {
      return NextResponse.json({ error: adData.error.message }, { status: 400 })
    }

    // 2. Create new ad
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const adName = newName || `${adData.name} - Copy`
    const adsetId = targetAdsetId || adData.adset_id

    let creativeToUse = adData.creative.id

    // If there's a copy override, create a new creative with modified copy
    if (copyOverride) {
      // Fetch the original creative details
      const creativeRes = await fetch(
        `${META_GRAPH_URL}/${adData.creative.id}?fields=object_story_spec,url_tags&access_token=${accessToken}`
      )
      const creativeData = await creativeRes.json()

      if (creativeData.error) {
        return NextResponse.json({ error: `Failed to fetch creative: ${creativeData.error.message}` }, { status: 400 })
      }

      // Build the new creative with modified copy
      const objectStorySpec = creativeData.object_story_spec || {}
      const linkData = objectStorySpec.link_data || {}

      // Create new object_story_spec with updated copy
      const newObjectStorySpec: Record<string, any> = {
        ...objectStorySpec,
        link_data: {
          ...linkData,
          message: copyOverride.primaryText || linkData.message,
          name: copyOverride.headline || linkData.name,
          description: copyOverride.description || linkData.description
        }
      }

      // Create the new creative
      const newCreativeRes = await fetch(
        `${META_GRAPH_URL}/${formattedAccountId}/adcreatives`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            object_story_spec: newObjectStorySpec,
            url_tags: creativeData.url_tags,
            access_token: accessToken
          })
        }
      )
      const newCreativeData = await newCreativeRes.json()

      if (newCreativeData.error) {
        return NextResponse.json({ error: `Failed to create creative: ${newCreativeData.error.message}` }, { status: 400 })
      }

      creativeToUse = newCreativeData.id
    }

    const newAdRes = await fetch(
      `${META_GRAPH_URL}/${formattedAccountId}/ads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adset_id: adsetId,
          name: adName,
          creative: { creative_id: creativeToUse },
          status: copyStatus,
          access_token: accessToken
        })
      }
    )
    const newAdData = await newAdRes.json()

    if (newAdData.error) {
      return NextResponse.json({ error: newAdData.error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      newAdId: newAdData.id,
      newAdName: adName,
      needsSync: true  // Tells frontend to auto-sync for immediate display
    })

  } catch (err) {
    console.error('Duplicate ad error:', err)
    return NextResponse.json({ error: 'Failed to duplicate ad' }, { status: 500 })
  }
}
