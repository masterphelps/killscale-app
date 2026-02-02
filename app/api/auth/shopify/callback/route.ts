import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')
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
    console.error('Shopify OAuth error:', error)
    const errorUrl = returnTo ? `${returnTo}?shopify_error=declined` : '/dashboard/settings/workspaces?shopify_error=declined'
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }

  if (!code || !shop || !state) {
    const errorUrl = returnTo ? `${returnTo}?shopify_error=missing_params` : '/dashboard/settings/workspaces?shopify_error=missing_params'
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }

  try {
    // Decode state to get user ID, workspace ID, and validate timestamp
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const { userId, workspaceId, timestamp, returnTo: stateReturnTo } = stateData
    returnTo = stateReturnTo || null

    if (!userId || !workspaceId) {
      const errorUrl = returnTo ? `${returnTo}?shopify_error=invalid_state` : '/dashboard/settings/workspaces?shopify_error=invalid_state'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    // Check state is not too old (10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      const errorUrl = returnTo ? `${returnTo}?shopify_error=expired` : '/dashboard/settings/workspaces?shopify_error=expired'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    // Verify user still has access to this workspace (owner or member)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (!workspace) {
      // Not the owner, check if they're a member
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      if (!membership) {
        console.error('Workspace access check failed')
        const errorUrl = returnTo ? `${returnTo}?shopify_error=access_denied` : '/dashboard/settings/workspaces?error=access_denied'
        return NextResponse.redirect(`${baseUrl}${errorUrl}`)
      }
    }

    // Exchange code for permanent access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error, tokenData.error_description)
      const errorUrl = returnTo ? `${returnTo}?shopify_error=token_failed` : '/dashboard/settings/workspaces?shopify_error=token_failed'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    const { access_token, scope } = tokenData

    if (!access_token) {
      console.error('No access token received from Shopify')
      const errorUrl = returnTo ? `${returnTo}?shopify_error=no_access_token` : '/dashboard/settings/workspaces?shopify_error=no_access_token'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    // Get shop info to populate shop_name
    const shopInfoResponse = await fetch(`https://${shop}/admin/api/2025-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': access_token,
      },
    })

    const shopInfoData = await shopInfoResponse.json()
    const shopName = shopInfoData.shop?.name || shop.replace('.myshopify.com', '')

    // Store connection in database (workspace-scoped)
    const { error: dbError } = await supabase
      .from('shopify_connections')
      .upsert({
        user_id: userId,
        workspace_id: workspaceId,
        shop_domain: shop,
        shop_name: shopName,
        access_token,
        scope,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'workspace_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      const errorUrl = returnTo ? `${returnTo}?shopify_error=db_failed` : '/dashboard/settings/workspaces?shopify_error=db_failed'
      return NextResponse.redirect(`${baseUrl}${errorUrl}`)
    }

    // Register webhooks for real-time order updates
    const webhookUrl = `${baseUrl}/api/shopify/webhook`
    const webhookTopics = ['orders/create', 'orders/updated', 'orders/cancelled']

    for (const topic of webhookTopics) {
      try {
        const webhookResponse = await fetch(`https://${shop}/admin/api/2025-01/webhooks.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: 'json',
            },
          }),
        })

        const webhookResult = await webhookResponse.json()
        if (webhookResult.errors) {
          // Webhook might already exist, that's okay
          console.log(`[Shopify] Webhook ${topic} registration:`, webhookResult.errors)
        } else {
          console.log(`[Shopify] Registered webhook: ${topic}`)
        }
      } catch (webhookErr) {
        // Don't fail the whole flow for webhook registration errors
        console.error(`[Shopify] Failed to register webhook ${topic}:`, webhookErr)
      }
    }

    const successUrl = returnTo ? `${returnTo}?shopify=success` : '/dashboard/settings/workspaces?shopify=success'
    return NextResponse.redirect(`${baseUrl}${successUrl}`)

  } catch (err) {
    console.error('OAuth callback error:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    const errorUrl = returnTo
      ? `${returnTo}?shopify_error=unknown&details=${encodeURIComponent(errorMessage)}`
      : `/dashboard/settings/workspaces?shopify_error=unknown&details=${encodeURIComponent(errorMessage)}`
    return NextResponse.redirect(`${baseUrl}${errorUrl}`)
  }
}
