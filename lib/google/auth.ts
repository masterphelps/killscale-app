import { createClient } from '@supabase/supabase-js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface GoogleConnection {
  id: string
  user_id: string
  google_user_id: string
  google_email: string | null
  access_token: string
  refresh_token: string
  token_expires_at: string
  customer_ids: Array<{
    id: string
    name: string
    currency: string
    manager?: boolean
    testAccount?: boolean
  }>
  selected_customer_id: string | null
  login_customer_id: string | null
  connected_at: string
  updated_at: string
  last_sync_at: string | null
}

/**
 * Get Google connection for a user
 */
export async function getGoogleConnection(userId: string): Promise<GoogleConnection | null> {
  const { data, error } = await supabase
    .from('google_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return data as GoogleConnection
}

/**
 * Refresh Google access token using refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
} | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const data = await response.json()

    if (data.error) {
      console.error('Token refresh error:', data.error, data.error_description)
      return null
    }

    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    }
  } catch (err) {
    console.error('Failed to refresh token:', err)
    return null
  }
}

/**
 * Update stored token in database
 */
async function updateStoredToken(
  userId: string,
  accessToken: string,
  expiresIn: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString()

  await supabase
    .from('google_connections')
    .update({
      access_token: accessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}

/**
 * Get a valid Google access token, refreshing if necessary.
 * Google tokens expire in 1 hour, so we check and refresh before each API call.
 */
export async function getValidGoogleToken(userId: string): Promise<string | null> {
  const connection = await getGoogleConnection(userId)

  if (!connection) {
    console.error('No Google connection found for user:', userId)
    return null
  }

  const expiresAt = new Date(connection.token_expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt < fiveMinutesFromNow) {
    console.log('Google token expiring soon, refreshing...')

    const refreshResult = await refreshAccessToken(connection.refresh_token)

    if (!refreshResult) {
      console.error('Failed to refresh Google token')
      return null
    }

    await updateStoredToken(userId, refreshResult.access_token, refreshResult.expires_in)
    return refreshResult.access_token
  }

  return connection.access_token
}

/**
 * Format customer ID with hyphens: 1234567890 -> 123-456-7890
 */
export function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return id
}

/**
 * Remove hyphens from customer ID for API calls: 123-456-7890 -> 1234567890
 */
export function normalizeCustomerId(id: string): string {
  return id.replace(/-/g, '')
}

/**
 * Update last sync timestamp for a Google connection
 */
export async function updateLastSyncAt(userId: string): Promise<void> {
  await supabase
    .from('google_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}
