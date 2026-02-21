import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/auth/meta/callback`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'
  
  // Decode returnTo early for error redirects
  let returnTo: string | null = null
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      returnTo = stateData.returnTo || null
    } catch {}
  }

  // Handle user declining permissions
  if (error) {
    console.error('Meta OAuth error:', error)
    const errorUrl = returnTo ? `${returnTo}?meta_error=declined` : '/dashboard?error=declined'
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }

  if (!code || !state) {
    const errorUrl = returnTo ? `${returnTo}?meta_error=missing_params` : '/dashboard?error=missing_params'
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }
  
  try {
    // Decode state to get user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const { userId, timestamp, returnTo } = stateData
    
    // Check state is not too old (10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      const errorUrl = returnTo ? `${returnTo}?meta_error=expired` : '/dashboard?error=expired'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }
    
    // Exchange code for access token
    const tokenUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', META_APP_ID)
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET)
    tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    tokenUrl.searchParams.set('code', code)
    
    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenData = await tokenResponse.json()
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error)
      const errorUrl = returnTo ? `${returnTo}?meta_error=token_failed` : '/dashboard?error=token_failed'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }
    
    const { access_token, expires_in } = tokenData
    
    // Get long-lived token (60 days instead of 1 hour)
    const longLivedUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`)
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longLivedUrl.searchParams.set('client_id', META_APP_ID)
    longLivedUrl.searchParams.set('client_secret', META_APP_SECRET)
    longLivedUrl.searchParams.set('fb_exchange_token', access_token)
    
    const longLivedResponse = await fetch(longLivedUrl.toString())
    const longLivedData = await longLivedResponse.json()
    
    const finalToken = longLivedData.access_token || access_token
    // Default to 60 days if expires_in is not provided
    const finalExpiry = longLivedData.expires_in || expires_in || (60 * 24 * 60 * 60)

    console.log('Token info:', {
      hasLongLivedToken: !!longLivedData.access_token,
      expiresIn: finalExpiry
    })

    // Get user's ad accounts
    const adAccountsResponse = await fetch(
      `${META_GRAPH_URL}/me/adaccounts?fields=id,name,account_status,currency&access_token=${finalToken}`
    )
    const adAccountsData = await adAccountsResponse.json()
    
    if (adAccountsData.error) {
      console.error('Ad accounts fetch error:', adAccountsData.error)
      const errorUrl = returnTo ? `${returnTo}?meta_error=no_ad_accounts` : '/dashboard?error=no_ad_accounts'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }
    
    // Get user's Meta profile info
    const profileResponse = await fetch(
      `${META_GRAPH_URL}/me?fields=id,name&access_token=${finalToken}`
    )
    const profileData = await profileResponse.json()
    
    // Store connection in database
    const expiresAt = new Date(Date.now() + (finalExpiry * 1000)).toISOString()
    
    // Add in_dashboard field to each account (first one defaults to true)
    const accountsWithDashboard = (adAccountsData.data || []).map((account: any, index: number) => ({
      ...account,
      in_dashboard: index === 0 // First account auto-added to dashboard
    }))

    // Preserve demo account (act_999888777666) across reconnects — it's not a real Meta
    // account so Meta's API won't return it, but the demo workspace depends on it
    const DEMO_ACCOUNT_ID = 'act_999888777666'
    const { data: existingConn } = await supabase
      .from('meta_connections')
      .select('ad_accounts')
      .eq('user_id', userId)
      .single()

    if (existingConn?.ad_accounts) {
      const demoAccount = (existingConn.ad_accounts as any[]).find(
        (a: any) => a.id === DEMO_ACCOUNT_ID
      )
      if (demoAccount && !accountsWithDashboard.some((a: any) => a.id === DEMO_ACCOUNT_ID)) {
        accountsWithDashboard.push(demoAccount)
      }
    }

    // Set the first account as selected
    const firstAccountId = accountsWithDashboard.length > 0 ? accountsWithDashboard[0].id : null

    // Upsert meta_connections record
    const { error: dbError } = await supabase
      .from('meta_connections')
      .upsert({
        user_id: userId,
        meta_user_id: profileData.id,
        meta_user_name: profileData.name,
        access_token: finalToken,
        token_expires_at: expiresAt,
        ad_accounts: accountsWithDashboard,
        selected_account_id: firstAccountId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
    
    if (dbError) {
      console.error('Database error:', dbError)
      const errorUrl = returnTo ? `${returnTo}?meta_error=db_failed` : '/dashboard?error=db_failed'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    const successUrl = returnTo ? `${returnTo}?meta=success` : '/dashboard'
    return NextResponse.redirect(`${baseUrl}${successUrl}`)
    
  } catch (err) {
    console.error('OAuth callback error:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    const errorUrl = returnTo
      ? `${returnTo}?meta_error=unknown&details=${encodeURIComponent(errorMessage)}`
      : `/dashboard?settings=connections&error=unknown&details=${encodeURIComponent(errorMessage)}`
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }
}
