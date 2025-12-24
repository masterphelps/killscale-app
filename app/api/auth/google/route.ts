import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/auth/google/callback`

// Scopes needed for Google Ads API
const SCOPES = [
  'https://www.googleapis.com/auth/adwords',  // Google Ads API access
  'openid',
  'email',
  'profile',
].join(' ')

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

  // Build Google OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('access_type', 'offline')  // Required for refresh token
  authUrl.searchParams.set('prompt', 'consent')  // Force consent to get refresh token

  return NextResponse.redirect(authUrl.toString())
}
