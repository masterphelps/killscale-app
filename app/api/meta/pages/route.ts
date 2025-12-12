import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    if (adAccountId) {
      // If ad account ID provided, fetch only pages that can be used with this ad account
      const cleanAdAccountId = adAccountId.replace(/^act_/, '')

      // First, try to get the ad account's business and its pages
      const adAccountUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}?fields=business{id,name,owned_pages{id,name},client_pages{id,name}}&access_token=${accessToken}`
      console.log('Fetching ad account business info:', cleanAdAccountId)

      const adAccountResponse = await fetch(adAccountUrl)
      const adAccountResult = await adAccountResponse.json()

      console.log('Ad account business response:', JSON.stringify(adAccountResult, null, 2))

      if (adAccountResult.business) {
        // Combine owned_pages and client_pages from the business
        const ownedPages = adAccountResult.business.owned_pages?.data || []
        const clientPages = adAccountResult.business.client_pages?.data || []
        const allBusinessPages = [...ownedPages, ...clientPages]

        // Dedupe by id
        const uniquePages = Array.from(
          new Map(allBusinessPages.map((p: { id: string; name: string }) => [p.id, p])).values()
        )

        if (uniquePages.length > 0) {
          console.log(`Found ${uniquePages.length} pages from business`)
          return NextResponse.json({
            success: true,
            pages: uniquePages.map((page: { id: string; name: string }) => ({
              id: page.id,
              name: page.name,
            }))
          })
        }
      }

      // If no business or no pages from business, try promotable_pages
      const promotableUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/promote_pages?fields=id,name&access_token=${accessToken}`
      console.log('Trying promote_pages endpoint...')

      const promotableResponse = await fetch(promotableUrl)
      const promotableResult = await promotableResponse.json()

      console.log('Promote pages response:', JSON.stringify(promotableResult, null, 2))

      if (!promotableResult.error && promotableResult.data?.length > 0) {
        console.log(`Found ${promotableResult.data.length} promotable pages`)
        return NextResponse.json({
          success: true,
          pages: promotableResult.data.map((page: { id: string; name: string }) => ({
            id: page.id,
            name: page.name,
          }))
        })
      }

      // Last resort: fall back to all user pages
      console.log('Falling back to user pages...')
    }

    // Fetch all user's pages (default or fallback)
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name&access_token=${accessToken}`
    console.log('Fetching all user pages')

    const response = await fetch(pagesUrl)
    const result = await response.json()

    console.log('User pages response:', JSON.stringify(result, null, 2))

    if (result.error) {
      console.error('Meta API error:', result.error)
      return NextResponse.json({
        error: result.error.message || 'Failed to fetch Pages'
      }, { status: 400 })
    }

    // Return pages list
    const pages = result.data || []

    console.log(`Found ${pages.length} user pages`)

    return NextResponse.json({
      success: true,
      pages: pages.map((page: { id: string; name: string }) => ({
        id: page.id,
        name: page.name,
      }))
    })

  } catch (err) {
    console.error('Fetch pages error:', err)
    return NextResponse.json({ error: 'Failed to fetch Pages' }, { status: 500 })
  }
}
