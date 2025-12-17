import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, sourceAdId, targetAdsetId, newName, copyStatus = 'PAUSED' } = await request.json() as {
      userId: string
      adAccountId: string
      sourceAdId: string
      targetAdsetId?: string // If not provided, use same ad set
      newName?: string
      copyStatus?: 'PAUSED' | 'ACTIVE'
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
      `https://graph.facebook.com/v18.0/${sourceAdId}?fields=name,adset_id,creative&access_token=${accessToken}`
    )
    const adData = await adRes.json()

    if (adData.error) {
      return NextResponse.json({ error: adData.error.message }, { status: 400 })
    }

    // 2. Create new ad
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const adName = newName || `${adData.name} - Copy`
    const adsetId = targetAdsetId || adData.adset_id

    const newAdRes = await fetch(
      `https://graph.facebook.com/v18.0/${formattedAccountId}/ads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adset_id: adsetId,
          name: adName,
          creative: { creative_id: adData.creative.id },
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
      newAdName: adName
    })

  } catch (err) {
    console.error('Duplicate ad error:', err)
    return NextResponse.json({ error: 'Failed to duplicate ad' }, { status: 500 })
  }
}
