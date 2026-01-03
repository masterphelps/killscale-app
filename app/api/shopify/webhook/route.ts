import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Verify Shopify webhook HMAC signature
 * Shopify signs webhooks with HMAC-SHA256 using the app's API secret
 */
function verifyWebhookSignature(body: string, hmacHeader: string): boolean {
  const hash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  )
}

/**
 * POST /api/shopify/webhook
 *
 * Receives webhooks from Shopify for order events.
 * Topics we subscribe to:
 * - orders/create: New order placed
 * - orders/updated: Order status changed (e.g., paid, fulfilled)
 * - orders/cancelled: Order cancelled
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
    if (!hmacHeader || !verifyWebhookSignature(rawBody, hmacHeader)) {
      console.error('[Shopify Webhook] Invalid HMAC signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Get webhook metadata from headers
    const shopDomain = request.headers.get('x-shopify-shop-domain')
    const topic = request.headers.get('x-shopify-topic')
    const webhookId = request.headers.get('x-shopify-webhook-id')

    console.log('[Shopify Webhook] Received:', { topic, shopDomain, webhookId })

    if (!shopDomain) {
      return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 })
    }

    // Parse the order data
    const order = JSON.parse(rawBody)

    // Find the workspace for this shop
    const { data: connection, error: connError } = await supabase
      .from('shopify_connections')
      .select('workspace_id, user_id')
      .eq('shop_domain', shopDomain)
      .single()

    if (connError || !connection) {
      console.log('[Shopify Webhook] No connection found for shop:', shopDomain)
      // Return 200 to prevent Shopify from retrying - this shop is disconnected
      return NextResponse.json({ received: true, skipped: 'no_connection' })
    }

    // Handle different topics
    if (topic === 'orders/cancelled') {
      // Delete the order from our database
      await supabase
        .from('shopify_orders')
        .delete()
        .eq('workspace_id', connection.workspace_id)
        .eq('shopify_order_id', `gid://shopify/Order/${order.id}`)

      console.log('[Shopify Webhook] Deleted cancelled order:', order.id)
      return NextResponse.json({ received: true, action: 'deleted' })
    }

    // For orders/create and orders/updated, upsert the order
    // Extract UTM params from customer journey if available
    const customerJourney = order.customer_journey_summary || order.customerJourneySummary || {}
    const lastVisit = customerJourney.last_visit || customerJourney.lastVisit || {}
    const firstVisit = customerJourney.first_visit || customerJourney.firstVisit || {}
    const lastUtm = lastVisit.utm_parameters || lastVisit.utmParameters || {}
    const firstUtm = firstVisit.utm_parameters || firstVisit.utmParameters || {}

    // Map financial_status - webhook uses snake_case, we store UPPERCASE
    const financialStatus = (order.financial_status || 'pending').toUpperCase()

    const orderData = {
      user_id: connection.user_id,
      workspace_id: connection.workspace_id,
      shopify_order_id: `gid://shopify/Order/${order.id}`,
      shopify_order_number: order.name || `#${order.order_number}`,
      total_price: parseFloat(order.total_price || '0'),
      subtotal_price: parseFloat(order.subtotal_price || order.total_price || '0'),
      currency: order.currency || 'USD',
      financial_status: financialStatus,
      order_created_at: order.created_at,

      // Last visit UTM params (last-touch attribution)
      last_utm_source: lastUtm.source || null,
      last_utm_medium: lastUtm.medium || null,
      last_utm_campaign: lastUtm.campaign || null,
      last_utm_content: lastUtm.content || null,
      last_utm_term: lastUtm.term || null,

      // First visit UTM params (first-touch attribution)
      first_utm_source: firstUtm.source || null,
      first_utm_medium: firstUtm.medium || null,
      first_utm_campaign: firstUtm.campaign || null,
      first_utm_content: firstUtm.content || null,
      first_utm_term: firstUtm.term || null,

      // Journey metadata
      days_to_conversion: customerJourney.days_to_conversion || customerJourney.daysToConversion || null,

      synced_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('shopify_orders')
      .upsert(orderData, {
        onConflict: 'user_id,shopify_order_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error('[Shopify Webhook] Upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
    }

    console.log('[Shopify Webhook] Upserted order:', order.id, 'topic:', topic, 'status:', financialStatus)
    return NextResponse.json({ received: true, action: topic === 'orders/create' ? 'created' : 'updated' })

  } catch (err) {
    console.error('[Shopify Webhook] Error:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// Shopify sends a GET request to verify webhook endpoint exists
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'shopify-webhook' })
}
