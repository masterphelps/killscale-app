import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
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

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Fetch ad sets for the campaign
    const adsetsUrl = `https://graph.facebook.com/v18.0/${campaignId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${accessToken}`

    const response = await fetch(adsetsUrl)
    const result = await response.json()

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch ad sets'
      }, { status: 400 })
    }

    const adsets = result.data || []

    return NextResponse.json({
      success: true,
      adsets: adsets.map((adset: {
        id: string
        name: string
        status: string
        daily_budget?: string
        lifetime_budget?: string
        optimization_goal?: string
        billing_event?: string
      }) => ({
        id: adset.id,
        name: adset.name,
        status: adset.status,
        dailyBudget: adset.daily_budget ? parseInt(adset.daily_budget) / 100 : null,
        lifetimeBudget: adset.lifetime_budget ? parseInt(adset.lifetime_budget) / 100 : null,
        optimizationGoal: adset.optimization_goal,
        billingEvent: adset.billing_event
      }))
    })

  } catch (err) {
    console.error('Fetch adsets error:', err)
    return NextResponse.json({ error: 'Failed to fetch ad sets' }, { status: 500 })
  }
}
