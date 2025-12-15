import { NextRequest, NextResponse } from 'next/server'

const META_APP_ID = process.env.META_APP_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/auth/meta/callback`

// Scopes needed for Marketing API + Page access for campaign creation
const SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
  'public_profile',
  'pages_show_list',       // Required to list user's Facebook Pages
  'pages_read_engagement', // Required to use Pages for ad creation
  // NOTE: leads_retrieval requires Meta App Review before production use
].join(',')

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }
  
  // Generate state parameter for security (includes user ID)
  const state = Buffer.from(JSON.stringify({ 
    userId,
    timestamp: Date.now() 
  })).toString('base64')
  
  // Build Meta OAuth URL
  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth')
  authUrl.searchParams.set('client_id', META_APP_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_type', 'code')
  
  return NextResponse.redirect(authUrl.toString())
}
