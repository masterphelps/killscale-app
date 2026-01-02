import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing workspaceId' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      )
    }

    // Verify user has access to this workspace (owner or admin member)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (!workspace) {
      // Not the owner, check if they're an admin member
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      if (!membership || membership.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only workspace owner or admin can disconnect Shopify' },
          { status: 403 }
        )
      }
    }

    // Delete Shopify connection for this workspace
    const { error: deleteError } = await supabase
      .from('shopify_connections')
      .delete()
      .eq('workspace_id', workspaceId)

    if (deleteError) {
      console.error('Error disconnecting Shopify:', deleteError)
      return NextResponse.json(
        { error: 'Failed to disconnect Shopify' },
        { status: 500 }
      )
    }

    console.log(`[Shopify Disconnect] Successfully disconnected workspace ${workspaceId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in disconnect route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
