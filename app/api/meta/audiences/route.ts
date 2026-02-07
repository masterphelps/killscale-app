import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
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

    // Fetch custom audiences from the ad account
    // Meta doesn't support server-side name search for custom audiences, so we fetch all and filter client-side
    const cleanAccountId = adAccountId.replace(/^act_/, '')
    const url = `${META_GRAPH_URL}/act_${cleanAccountId}/customaudiences?fields=id,name,approximate_count_lower_bound,approximate_count_upper_bound,subtype,delivery_status&limit=200&access_token=${accessToken}`

    const response = await fetch(url)
    const result = await response.json()

    if (result.error) {
      console.error('Meta custom audiences error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch custom audiences'
      }, { status: 400 })
    }

    const rawAudiences = result.data || []

    // Filter out unusable audiences (delivery_status.code >= 400)
    const audiences = rawAudiences
      .filter((a: { delivery_status?: { code: number } }) => {
        if (!a.delivery_status) return true
        return a.delivery_status.code < 400
      })
      .map((a: {
        id: string
        name: string
        approximate_count_lower_bound?: number
        approximate_count_upper_bound?: number
        subtype?: string
        delivery_status?: { code: number }
      }) => ({
        id: a.id,
        name: a.name,
        approximateSize: a.approximate_count_upper_bound || a.approximate_count_lower_bound || undefined,
        subtype: a.subtype || undefined
      }))

    return NextResponse.json({ audiences })

  } catch (err) {
    console.error('Fetch audiences error:', err)
    return NextResponse.json({ error: 'Failed to fetch custom audiences' }, { status: 500 })
  }
}
