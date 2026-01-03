import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/shopify/webhooks
 *
 * Check webhook status for a Shopify connection.
 * Returns list of registered webhooks and their status.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const workspaceId = searchParams.get('workspaceId')
  const userId = searchParams.get('userId')

  if (!workspaceId || !userId) {
    return NextResponse.json({ error: 'Missing workspaceId or userId' }, { status: 400 })
  }

  try {
    // Verify user has access to this workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    let hasAccess = !!workspace

    if (!hasAccess) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      hasAccess = !!membership
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get the Shopify connection
    const { data: connection, error } = await supabase
      .from('shopify_connections')
      .select('shop_domain, access_token')
      .eq('workspace_id', workspaceId)
      .single()

    if (error || !connection) {
      return NextResponse.json({ error: 'No Shopify connection' }, { status: 404 })
    }

    // Fetch webhooks from Shopify
    const response = await fetch(
      `https://${connection.shop_domain}/admin/api/2025-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': connection.access_token,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch webhooks from Shopify' }, { status: 500 })
    }

    const data = await response.json()
    const webhooks = data.webhooks || []

    // Filter to our webhooks (pointing to our domain)
    const ourWebhooks = webhooks.filter((wh: any) =>
      wh.address.includes('killscale.com') || wh.address.includes('localhost')
    )

    // Check which topics we have
    const requiredTopics = ['orders/create', 'orders/updated', 'orders/cancelled']
    const registeredTopics = ourWebhooks.map((wh: any) => wh.topic)

    const status = {
      active: requiredTopics.every(topic => registeredTopics.includes(topic)),
      webhooks: ourWebhooks.map((wh: any) => ({
        id: wh.id,
        topic: wh.topic,
        address: wh.address,
        created_at: wh.created_at,
      })),
      missing: requiredTopics.filter(topic => !registeredTopics.includes(topic)),
    }

    return NextResponse.json(status)

  } catch (err) {
    console.error('[Shopify Webhooks] Error:', err)
    return NextResponse.json({ error: 'Failed to check webhooks' }, { status: 500 })
  }
}

/**
 * POST /api/shopify/webhooks
 *
 * Register missing webhooks for a Shopify connection.
 */
export async function POST(request: NextRequest) {
  const { workspaceId, userId } = await request.json()

  if (!workspaceId || !userId) {
    return NextResponse.json({ error: 'Missing workspaceId or userId' }, { status: 400 })
  }

  try {
    // Verify user has access
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    let hasAccess = !!workspace

    if (!hasAccess) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      hasAccess = !!membership
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get the Shopify connection
    const { data: connection, error } = await supabase
      .from('shopify_connections')
      .select('shop_domain, access_token')
      .eq('workspace_id', workspaceId)
      .single()

    if (error || !connection) {
      return NextResponse.json({ error: 'No Shopify connection' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'
    const webhookUrl = `${baseUrl}/api/shopify/webhook`
    const topics = ['orders/create', 'orders/updated', 'orders/cancelled']

    const results = []

    for (const topic of topics) {
      const response = await fetch(
        `https://${connection.shop_domain}/admin/api/2025-01/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': connection.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: 'json',
            },
          }),
        }
      )

      const result = await response.json()
      results.push({
        topic,
        success: !!result.webhook,
        error: result.errors,
      })
    }

    return NextResponse.json({ results })

  } catch (err) {
    console.error('[Shopify Webhooks] Registration error:', err)
    return NextResponse.json({ error: 'Failed to register webhooks' }, { status: 500 })
  }
}
