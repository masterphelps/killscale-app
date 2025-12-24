import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/auth/google/callback`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Format customer ID with hyphens: 1234567890 -> 123-456-7890
function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return id
}

// Remove hyphens for API calls: 123-456-7890 -> 1234567890
function normalizeCustomerId(id: string): string {
  return id.replace(/-/g, '')
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'

  // Handle user declining permissions
  if (error) {
    console.error('Google OAuth error:', error)
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
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error, tokenData.error_description)
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=token_failed`)
    }

    const { access_token, refresh_token, expires_in } = tokenData

    if (!refresh_token) {
      console.error('No refresh token received - user may need to revoke access and reconnect')
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=no_refresh_token`)
    }

    // Get user's Google profile info
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profileData = await profileResponse.json()

    // Get list of accessible Google Ads customer IDs
    const customersResponse = await fetch(
      'https://googleads.googleapis.com/v22/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        },
      }
    )

    const customersData = await customersResponse.json()

    if (customersData.error) {
      console.error('Failed to list customers:', JSON.stringify(customersData.error, null, 2))
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=no_google_ads_accounts`)
    }

    // Extract customer IDs from resource names (format: customers/1234567890)
    const resourceNames: string[] = customersData.resourceNames || []

    // Fetch details for each customer using GAQL query
    const customerDetails = await Promise.all(
      resourceNames.map(async (resourceName: string) => {
        const customerId = resourceName.replace('customers/', '')

        try {
          // Use GAQL to query customer details
          const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.test_account FROM customer LIMIT 1`

          const detailResponse = await fetch(
            `https://googleads.googleapis.com/v22/customers/${customerId}/googleAds:search`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${access_token}`,
                'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query }),
            }
          )

          // Log non-JSON responses for debugging
          const responseText = await detailResponse.text()
          let detailData
          try {
            detailData = JSON.parse(responseText)
          } catch {
            console.error(`Customer ${customerId} returned non-JSON:`, responseText.substring(0, 200))
            return null
          }

          if (detailData.error) {
            // This customer might be inaccessible
            console.log(`Skipping customer ${customerId}:`, detailData.error.message)
            return null
          }

          // Extract customer data from GAQL response
          const customerData = detailData.results?.[0]?.customer
          if (!customerData) {
            console.log(`No customer data for ${customerId}`)
            return null
          }

          return {
            id: formatCustomerId(customerId),
            name: customerData.descriptiveName || `Account ${formatCustomerId(customerId)}`,
            currency: customerData.currencyCode || 'USD',
            manager: customerData.manager || false,
            testAccount: customerData.testAccount || false,
          }
        } catch (err) {
          console.error(`Error fetching customer ${customerId}:`, err)
          return null
        }
      })
    )

    // Filter out nulls and manager accounts (we want client accounts)
    const validCustomers = customerDetails.filter(
      (c): c is NonNullable<typeof c> => c !== null && !c.manager
    )

    if (validCustomers.length === 0) {
      console.error('No accessible client accounts found')
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=no_client_accounts`)
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    // Store connection in database
    const { error: dbError } = await supabase
      .from('google_connections')
      .upsert({
        user_id: userId,
        google_user_id: profileData.id,
        google_email: profileData.email,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
        customer_ids: validCustomers,
        selected_customer_id: validCustomers[0]?.id || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=db_failed`)
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/connect?google=success`)

  } catch (err) {
    console.error('OAuth callback error:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(`${baseUrl}/dashboard/connect?error=unknown&details=${encodeURIComponent(errorMessage)}`)
  }
}
