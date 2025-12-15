import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface LeadForm {
  id: string
  name: string
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED'
  questions: string[]
  createdTime: string
  locale: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const pageId = searchParams.get('pageId')

    if (!userId || !pageId) {
      return NextResponse.json(
        { error: 'Missing userId or pageId' },
        { status: 400 }
      )
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Meta account not connected' },
        { status: 401 }
      )
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Token expired, please reconnect' },
        { status: 401 }
      )
    }

    const userAccessToken = connection.access_token

    // First, get the Page access token from /me/accounts
    console.log('Fetching page access token for page:', pageId)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?` +
      `fields=id,name,access_token&` +
      `access_token=${userAccessToken}`
    )
    const pagesResult = await pagesResponse.json()

    console.log('Pages response:', JSON.stringify(pagesResult, null, 2))

    if (pagesResult.error) {
      console.error('Failed to fetch pages:', pagesResult.error)
      return NextResponse.json({
        error: `Failed to get pages: ${pagesResult.error.message}`
      }, { status: 400 })
    }

    // Find the page access token for the requested page
    const page = pagesResult.data?.find((p: { id: string }) => p.id === pageId)
    console.log('Looking for page:', pageId, 'Found:', page?.id, page?.name)

    if (!page?.access_token) {
      console.error('Page not found or no access token. Available pages:', pagesResult.data?.map((p: { id: string; name: string }) => `${p.id} (${p.name})`))
      return NextResponse.json({
        error: `Page ${pageId} not found in your accounts. You may need to reconnect with page permissions.`
      }, { status: 403 })
    }

    const pageAccessToken = page.access_token

    // Fetch lead gen forms from the Page using the Page access token
    console.log('Fetching lead forms for page:', pageId)
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/leadgen_forms?` +
      `fields=id,name,status,questions,created_time,locale&` +
      `access_token=${pageAccessToken}`
    )

    const result = await response.json()
    console.log('Lead forms response:', JSON.stringify(result, null, 2))

    if (result.error) {
      console.error('Lead forms fetch error:', result.error)

      // Check for permission errors
      if (result.error.code === 200 || result.error.code === 190) {
        return NextResponse.json({
          error: 'Missing permissions. Please reconnect Meta with leads_retrieval permission.',
          permissionError: true
        }, { status: 403 })
      }

      return NextResponse.json({
        error: result.error.message || 'Failed to fetch lead forms'
      }, { status: 400 })
    }

    // Filter to only active forms and format the response
    const forms: LeadForm[] = (result.data || [])
      .filter((form: { status: string }) => form.status === 'ACTIVE')
      .map((form: {
        id: string
        name: string
        status: 'ACTIVE' | 'ARCHIVED' | 'DELETED'
        questions: Array<{ key: string }>
        created_time: string
        locale: string
      }) => ({
        id: form.id,
        name: form.name,
        status: form.status,
        questions: form.questions?.map((q: { key: string }) => q.key) || [],
        createdTime: form.created_time,
        locale: form.locale
      }))

    return NextResponse.json({
      forms,
      pageId
    })

  } catch (err) {
    console.error('Lead forms API error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch lead forms' },
      { status: 500 }
    )
  }
}
