import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getShopifyConnection, updateLastSyncAt } from '@/lib/shopify/auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GraphQL query to fetch orders with customer journey attribution
const ORDERS_QUERY = `
  query GetOrders($cursor: String) {
    orders(first: 50, after: $cursor, query: "created_at:>=__DATE_START__") {
      edges {
        node {
          id
          name
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          createdAt
          displayFinancialStatus
          customerJourneySummary {
            firstVisit {
              utmParameters {
                source
                medium
                campaign
                content
                term
              }
            }
            lastVisit {
              utmParameters {
                source
                medium
                campaign
                content
                term
              }
            }
            daysToConversion
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

interface ShopifyOrder {
  id: string
  name: string
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  subtotalPriceSet?: { shopMoney: { amount: string; currencyCode: string } }
  createdAt: string
  displayFinancialStatus: string
  customerJourneySummary?: {
    firstVisit?: {
      utmParameters?: {
        source?: string
        medium?: string
        campaign?: string
        content?: string
        term?: string
      }
    }
    lastVisit?: {
      utmParameters?: {
        source?: string
        medium?: string
        campaign?: string
        content?: string
        term?: string
      }
    }
    daysToConversion?: number
  }
}

interface OrdersResponse {
  data: {
    orders: {
      edges: Array<{ node: ShopifyOrder }>
      pageInfo: {
        hasNextPage: boolean
        endCursor?: string
      }
    }
  }
  errors?: Array<{ message: string }>
}

/**
 * Fetch all orders from Shopify with pagination
 */
async function fetchAllOrders(
  shopDomain: string,
  accessToken: string,
  dateStart: string
): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = []
  let hasNextPage = true
  let cursor: string | null = null
  const maxPages = 100 // Safety limit (50 orders/page = 5000 orders max)

  // Replace __DATE_START__ in query with actual date
  const query = ORDERS_QUERY.replace('__DATE_START__', dateStart)

  while (hasNextPage && allOrders.length / 50 < maxPages) {
    const variables = cursor ? { cursor } : {}

    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Shopify API error (${response.status}): ${errorText}`)
    }

    const result: OrdersResponse = await response.json()

    console.log('[Shopify Sync] GraphQL response:', JSON.stringify(result, null, 2))

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Shopify GraphQL error: ${result.errors.map(e => e.message).join(', ')}`)
    }

    if (!result.data || !result.data.orders) {
      console.error('[Shopify Sync] Unexpected response structure:', result)
      throw new Error('Unexpected response from Shopify API')
    }

    const { edges, pageInfo } = result.data.orders

    // Add orders from this page
    allOrders.push(...edges.map(edge => edge.node))

    // Check if there are more pages
    hasNextPage = pageInfo.hasNextPage
    cursor = pageInfo.endCursor || null

    // Rate limiting: wait 500ms between requests
    if (hasNextPage) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return allOrders
}

/**
 * Calculate default date start (90 days ago)
 */
function getDefaultDateStart(): string {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().split('T')[0] // YYYY-MM-DD format
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId, dateStart } = await request.json()

    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Verify user has access to this workspace (owner or member)
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
        return NextResponse.json({ error: 'Access denied to workspace' }, { status: 403 })
      }
    }

    // Get Shopify connection for this workspace
    const connection = await getShopifyConnection(workspaceId)
    if (!connection) {
      return NextResponse.json({ error: 'Shopify not connected' }, { status: 401 })
    }

    // Determine date range (default: last 90 days)
    const startDate = dateStart || getDefaultDateStart()
    console.log(`[Shopify Sync] Fetching orders since ${startDate} for shop ${connection.shop_domain}`)

    // Fetch all orders from Shopify
    const orders = await fetchAllOrders(
      connection.shop_domain,
      connection.access_token,
      startDate
    )

    console.log(`[Shopify Sync] Fetched ${orders.length} orders from Shopify`)

    if (orders.length === 0) {
      return NextResponse.json({
        message: 'No orders found',
        count: 0,
      })
    }

    // Transform Shopify orders to our format
    const orderData = orders.map(order => {
      const lastVisit = order.customerJourneySummary?.lastVisit?.utmParameters
      const firstVisit = order.customerJourneySummary?.firstVisit?.utmParameters

      return {
        user_id: userId,
        workspace_id: workspaceId,
        shopify_order_id: order.id,
        shopify_order_number: order.name,
        total_price: parseFloat(order.totalPriceSet.shopMoney.amount),
        subtotal_price: order.subtotalPriceSet
          ? parseFloat(order.subtotalPriceSet.shopMoney.amount)
          : parseFloat(order.totalPriceSet.shopMoney.amount),
        currency: order.totalPriceSet.shopMoney.currencyCode,
        financial_status: order.displayFinancialStatus,
        order_created_at: order.createdAt,

        // Last visit UTM params (last-touch attribution)
        last_utm_source: lastVisit?.source || null,
        last_utm_medium: lastVisit?.medium || null,
        last_utm_campaign: lastVisit?.campaign || null,
        last_utm_content: lastVisit?.content || null, // This is the ad_id
        last_utm_term: lastVisit?.term || null,

        // First visit UTM params (first-touch attribution)
        first_utm_source: firstVisit?.source || null,
        first_utm_medium: firstVisit?.medium || null,
        first_utm_campaign: firstVisit?.campaign || null,
        first_utm_content: firstVisit?.content || null,
        first_utm_term: firstVisit?.term || null,

        // Journey metadata
        days_to_conversion: order.customerJourneySummary?.daysToConversion || null,

        synced_at: new Date().toISOString(),
      }
    })

    // Upsert orders to database (insert or update on conflict)
    const BATCH_SIZE = 500
    const batches: typeof orderData[] = []
    for (let i = 0; i < orderData.length; i += BATCH_SIZE) {
      batches.push(orderData.slice(i, i + BATCH_SIZE))
    }

    let totalUpserted = 0
    for (const batch of batches) {
      const { data, error } = await supabase
        .from('shopify_orders')
        .upsert(batch, {
          onConflict: 'user_id,shopify_order_id',
          ignoreDuplicates: false,
        })
        .select('id')

      if (error) {
        console.error('[Shopify Sync] Upsert error:', error)
        return NextResponse.json({ error: 'Failed to save orders' }, { status: 500 })
      }

      totalUpserted += data?.length || batch.length
    }

    // Update last sync timestamp
    await updateLastSyncAt(workspaceId)

    console.log(`[Shopify Sync] Successfully synced ${totalUpserted} orders for workspace ${workspaceId}`)

    return NextResponse.json({
      message: 'Orders synced successfully',
      count: totalUpserted,
      dateStart: startDate,
    })

  } catch (err) {
    console.error('[Shopify Sync] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
