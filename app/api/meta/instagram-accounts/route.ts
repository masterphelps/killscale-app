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

    // Get Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Fetch Instagram accounts connected to this ad account
    const res = await fetch(
      `${META_GRAPH_URL}/act_${cleanAccountId}/instagram_accounts?fields=id,username,name&access_token=${connection.access_token}`
    )
    const data = await res.json()

    if (data.error) {
      console.error('Instagram accounts fetch error:', data.error)
      return NextResponse.json({ accounts: [] })
    }

    return NextResponse.json({
      accounts: (data.data || []).map((acc: { id: string; username?: string; name?: string }) => ({
        id: acc.id,
        username: acc.username || '',
        name: acc.name || acc.username || 'Instagram Account',
      }))
    })
  } catch (err) {
    console.error('Instagram accounts error:', err)
    return NextResponse.json({ accounts: [] })
  }
}
