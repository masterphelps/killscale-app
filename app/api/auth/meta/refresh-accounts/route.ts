import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get stored connection with access token
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, ad_accounts')
      .eq('user_id', userId)
      .single()

    if (connError || !connection?.access_token) {
      return NextResponse.json({ error: 'No Meta connection found' }, { status: 404 })
    }

    // Fetch fresh ad accounts from Meta API using stored token
    const adAccountsResponse = await fetch(
      `${META_GRAPH_URL}/me/adaccounts?fields=id,name,account_status,currency&access_token=${connection.access_token}`
    )
    const adAccountsData = await adAccountsResponse.json()

    if (adAccountsData.error) {
      // Token might be expired
      if (adAccountsData.error.code === 190) {
        return NextResponse.json({ error: 'Token expired — please reconnect Meta' }, { status: 401 })
      }
      return NextResponse.json({ error: adAccountsData.error.message || 'Failed to fetch accounts' }, { status: 400 })
    }

    const freshAccounts = adAccountsData.data || []
    const existingAccounts: Array<{ id: string; in_dashboard?: boolean }> = connection.ad_accounts || []

    // Preserve existing in_dashboard flags, default new accounts to true
    const existingFlags = new Map(existingAccounts.map(a => [a.id, a.in_dashboard]))
    const updatedAccounts = freshAccounts.map((account: any) => ({
      ...account,
      in_dashboard: existingFlags.has(account.id) ? existingFlags.get(account.id) : true,
    }))

    // Preserve demo account across refreshes
    const DEMO_ACCOUNT_ID = 'act_999888777666'
    const demoAccount = existingAccounts.find((a: any) => a.id === DEMO_ACCOUNT_ID)
    if (demoAccount && !updatedAccounts.some((a: any) => a.id === DEMO_ACCOUNT_ID)) {
      updatedAccounts.push(demoAccount)
    }

    // Update meta_connections
    const { error: updateError } = await supabase
      .from('meta_connections')
      .update({
        ad_accounts: updatedAccounts,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update accounts' }, { status: 500 })
    }

    // Auto-link any NEW accounts to the default workspace
    const existingIds = new Set(existingAccounts.map(a => a.id))
    const newAccounts = updatedAccounts.filter((a: any) => !existingIds.has(a.id))

    if (newAccounts.length > 0) {
      const { data: defaultWs } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single()

      if (defaultWs) {
        const { data: wsExisting } = await supabase
          .from('workspace_accounts')
          .select('ad_account_id')
          .eq('workspace_id', defaultWs.id)

        const wsExistingIds = new Set((wsExisting || []).map((a: any) => a.ad_account_id))
        const toLink = newAccounts.filter((a: any) => !wsExistingIds.has(a.id))

        if (toLink.length > 0) {
          await supabase.from('workspace_accounts').insert(
            toLink.map((a: any) => ({
              workspace_id: defaultWs.id,
              platform: 'meta',
              ad_account_id: a.id,
              ad_account_name: a.name,
              currency: a.currency || 'USD',
            }))
          )
        }
      }
    }

    return NextResponse.json({
      accounts: updatedAccounts,
      newCount: newAccounts.length,
    })
  } catch (err) {
    console.error('Refresh accounts error:', err)
    return NextResponse.json({ error: 'Failed to refresh accounts' }, { status: 500 })
  }
}
