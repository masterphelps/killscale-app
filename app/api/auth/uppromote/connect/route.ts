import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { UpPromoteConnection } from '@/lib/uppromote/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId, apiKey, shopDomain } = body

    // Validate required fields
    if (!workspaceId || !userId || !apiKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify user has access to workspace (owner or member)
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
        console.error('[UpPromote] Workspace access check failed:', { workspaceId, userId })
        return NextResponse.json(
          { error: 'Access denied to workspace' },
          { status: 403 }
        )
      }
    }

    // Validate API key by calling UpPromote API
    const testResponse = await fetch('https://aff-api.uppromote.com/api/v1/referrals?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!testResponse.ok) {
      console.error('[UpPromote] API key validation failed:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
      })
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // API key is valid, store connection in database
    const connectionData: Partial<UpPromoteConnection> = {
      workspace_id: workspaceId,
      user_id: userId,
      api_key: apiKey,
      shop_domain: shopDomain || null,
      sync_status: 'pending',
      updated_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabase
      .from('uppromote_connections')
      .upsert(connectionData, {
        onConflict: 'workspace_id'
      })

    if (dbError) {
      console.error('[UpPromote] Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to store connection' },
        { status: 500 }
      )
    }

    console.log('[UpPromote] Connection successful:', { workspaceId, shopDomain })

    return NextResponse.json({
      success: true,
      message: 'UpPromote connected successfully'
    })

  } catch (err) {
    console.error('[UpPromote] Connect error:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json(
      { error: 'Connection failed', details: errorMessage },
      { status: 500 }
    )
  }
}
