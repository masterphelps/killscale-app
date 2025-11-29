import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  
  // Handle user declining permissions
  if (error) {
    console.error('Meta OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=declined`)
  }
  
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=missing_params`)
  }
  
  try {
    // Decode state to get user ID
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const { userId, timestamp } = stateData
    
    // Check state is not too old (10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=expired`)
    }
    
    // Exchange code for access token
    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', META_APP_ID)
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET)
    tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    tokenUrl.searchParams.set('code', code)
    
    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenData = await tokenResponse.json()
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error)
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=token_failed`)
    }
    
    const { access_token, expires_in } = tokenData
    
    // Get long-lived token (60 days instead of 1 hour)
    const longLivedUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token')
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longLivedUrl.searchParams.set('client_id', META_APP_ID)
    longLivedUrl.searchParams.set('client_secret', META_APP_SECRET)
    longLivedUrl.searchParams.set('fb_exchange_token', access_token)
    
    const longLivedResponse = await fetch(longLivedUrl.toString())
    const longLivedData = await longLivedResponse.json()
    
    const finalToken = longLivedData.access_token || access_token
    const finalExpiry = longLivedData.expires_in || expires_in
    
    // Get user's ad accounts
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency&access_token=${finalToken}`
    )
    const adAccountsData = await adAccountsResponse.json()
    
    if (adAccountsData.error) {
      console.error('Ad accounts fetch error:', adAccountsData.error)
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=no_ad_accounts`)
    }
    
    // Get user's Meta profile info
    const profileResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${finalToken}`
    )
    const profileData = await profileResponse.json()
    
    // Store connection in database
    const expiresAt = new Date(Date.now() + (finalExpiry * 1000)).toISOString()
    
    // Upsert meta_connections record
    const { error: dbError } = await supabase
      .from('meta_connections')
      .upsert({
        user_id: userId,
        meta_user_id: profileData.id,
        meta_user_name: profileData.name,
        access_token: finalToken,
        token_expires_at: expiresAt,
        ad_accounts: adAccountsData.data || [],
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
    
    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=db_failed`)
    }
    
    return NextResponse.redirect(`${baseUrl}/dashboard/connect?success=true`)
    
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=unknown`)
  }
}
