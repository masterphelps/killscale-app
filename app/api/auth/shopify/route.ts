import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/auth/shopify/callback`

// Scopes needed for Shopify API
// read_orders: Access order data
// read_customer_events: Access customer journey/attribution data
const SCOPES = 'read_orders,read_customer_events'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Normalizes a Shopify shop domain to the canonical myshopify.com format
 * @param shop - Shop identifier (e.g., "mystore" or "mystore.myshopify.com")
 * @returns Normalized shop domain (e.g., "mystore.myshopify.com")
 */
function normalizeShopDomain(shop: string): string {
  // Remove any protocol if present
  shop = shop.replace(/^https?:\/\//, '')

  // Remove trailing slashes
  shop = shop.replace(/\/$/, '')

  // If it doesn't end with .myshopify.com, add it
  if (!shop.endsWith('.myshopify.com')) {
    shop = `${shop}.myshopify.com`
  }

  return shop
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')
  const workspaceId = searchParams.get('workspace_id')
  const shop = searchParams.get('shop')

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop domain required' }, { status: 400 })
  }

  // Verify user has access to this workspace (owner or member)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', userId)
    .single()

  if (workspaceError || !workspace) {
    // Not the owner, check if they're a member
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (!membership) {
      console.error('Workspace access check failed')
      return NextResponse.json({ error: 'Access denied to workspace' }, { status: 403 })
    }
  }

  // Normalize shop domain
  const normalizedShop = normalizeShopDomain(shop)

  // Generate state parameter for security (includes user ID, workspace ID, and timestamp)
  const state = Buffer.from(JSON.stringify({
    userId,
    workspaceId,
    timestamp: Date.now()
  })).toString('base64')

  // Build Shopify OAuth URL
  const authUrl = new URL(`https://${normalizedShop}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', SHOPIFY_API_KEY)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl.toString())
}
