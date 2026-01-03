import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ShopifyConnection {
  id: string
  user_id: string
  workspace_id: string
  shop_domain: string
  access_token: string
  scope: string | null
  created_at: string
  updated_at: string
}

/**
 * Normalize shop domain to standard format: "mystore.myshopify.com"
 * Handles various input formats:
 * - "mystore" -> "mystore.myshopify.com"
 * - "mystore.myshopify.com" -> "mystore.myshopify.com"
 * - "https://mystore.myshopify.com" -> "mystore.myshopify.com"
 */
export function normalizeShopDomain(shop: string): string {
  // Remove protocol if present
  let normalized = shop.replace(/^https?:\/\//, '')

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '')

  // Remove path if present
  normalized = normalized.split('/')[0]

  // Add .myshopify.com if not present
  if (!normalized.includes('.')) {
    normalized = `${normalized}.myshopify.com`
  }

  return normalized.toLowerCase()
}

/**
 * Get Shopify connection for a workspace
 */
export async function getShopifyConnection(workspaceId: string): Promise<ShopifyConnection | null> {
  const { data, error } = await supabase
    .from('shopify_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    return null
  }

  return data as ShopifyConnection
}

/**
 * Validate Shopify HMAC signature
 * Shopify sends an HMAC signature to verify callback authenticity.
 *
 * @param query - URLSearchParams containing all query parameters including hmac
 * @param secret - Shopify app client secret
 * @returns true if HMAC is valid, false otherwise
 */
export function validateHmac(query: URLSearchParams, secret: string): boolean {
  // Get the HMAC from query params
  const hmac = query.get('hmac')
  if (!hmac) {
    return false
  }

  // Create a copy of params excluding hmac
  const params = new URLSearchParams(query)
  params.delete('hmac')

  // Sort parameters alphabetically and build query string
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  // Compute HMAC-SHA256
  const hash = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex')

  // Compare hashes (constant-time comparison)
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(hmac, 'hex')
  )
}

/**
 * Update last sync timestamp for a Shopify connection
 */
export async function updateLastSyncAt(workspaceId: string): Promise<void> {
  await supabase
    .from('shopify_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
}

/**
 * Check if workspace has a Shopify connection
 */
export async function hasShopifyConnection(workspaceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('shopify_connections')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  return !error && !!data
}

/**
 * Get Shopify connection status for a workspace
 */
export async function getShopifyConnectionStatus(workspaceId: string): Promise<{
  connected: boolean
  shop_domain?: string
  last_sync_at?: string
  order_count?: number
}> {
  const { data: connection, error } = await supabase
    .from('shopify_connections')
    .select('shop_domain, last_sync_at')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !connection) {
    return { connected: false }
  }

  // Get order count for this workspace
  const { count } = await supabase
    .from('shopify_orders')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  return {
    connected: true,
    shop_domain: connection.shop_domain,
    last_sync_at: connection.last_sync_at || undefined,
    order_count: count || 0,
  }
}
