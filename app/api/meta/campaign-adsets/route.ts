import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const campaignId = searchParams.get('campaignId')

    if (!userId || !campaignId) {
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

    // Fetch adsets with targeting from Meta
    const adsetsRes = await fetch(
      `${META_GRAPH_URL}/${campaignId}/adsets?fields=id,name,targeting&limit=100&access_token=${accessToken}`
    )
    const adsetsData = await adsetsRes.json()

    if (adsetsData.error) {
      console.error('[campaign-adsets] Failed to fetch adsets:', adsetsData.error)
      return NextResponse.json({ error: adsetsData.error.message }, { status: 400 })
    }

    // Transform the data to include only what we need
    const adsets = (adsetsData.data || []).map((adset: any) => ({
      id: adset.id,
      name: adset.name,
      targeting: adset.targeting || {}
    }))

    return NextResponse.json({ adsets })

  } catch (err) {
    console.error('Campaign adsets error:', err)
    return NextResponse.json({ error: 'Failed to fetch campaign adsets' }, { status: 500 })
  }
}
