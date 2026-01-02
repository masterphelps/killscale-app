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

    // Verify user is a member of this workspace with permission to disconnect
    const { data: membership, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      )
    }

    // Only owner and admin can disconnect
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to disconnect Shopify' },
        { status: 403 }
      )
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
