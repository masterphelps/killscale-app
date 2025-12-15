import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Get members of a workspace
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const userId = searchParams.get('userId')

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params' },
        { status: 400 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, user_id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    // Get members
    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .select('id, user_id, role, can_log_walkins, accepted_at')
      .eq('workspace_id', workspaceId)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: true })

    if (membersError) {
      console.error('Fetch members error:', membersError)
      return NextResponse.json(
        { error: 'Failed to fetch members' },
        { status: 500 }
      )
    }

    // Get user details for each member
    const membersWithDetails = await Promise.all(
      (members || []).map(async (member) => {
        const { data: userData } = await supabase.auth.admin.getUserById(member.user_id)
        return {
          id: member.id,
          userId: member.user_id,
          email: userData?.user?.email || 'Unknown',
          role: member.role,
          canLogWalkins: member.can_log_walkins,
          joinedAt: member.accepted_at
        }
      })
    )

    return NextResponse.json({
      members: membersWithDetails,
      owner: {
        userId: workspace.user_id,
        role: 'owner'
      }
    })

  } catch (err) {
    console.error('Fetch members error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}

// Update member role/permissions
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { memberId, userId, role, canLogWalkins } = body

    if (!memberId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get member to find workspace
    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select('id, workspace_id')
      .eq('id', memberId)
      .single()

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', member.workspace_id)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Build update
    const updates: Record<string, unknown> = {}
    if (role !== undefined) updates.role = role
    if (canLogWalkins !== undefined) updates.can_log_walkins = canLogWalkins

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'No changes' })
    }

    // Update member
    const { error: updateError } = await supabase
      .from('workspace_members')
      .update(updates)
      .eq('id', memberId)

    if (updateError) {
      console.error('Update member error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Update member error:', err)
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    )
  }
}

// Remove member
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')
    const userId = searchParams.get('userId')

    if (!memberId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params' },
        { status: 400 }
      )
    }

    // Get member to find workspace
    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select('id, workspace_id')
      .eq('id', memberId)
      .single()

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', member.workspace_id)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Delete member
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('id', memberId)

    if (deleteError) {
      console.error('Delete member error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete member error:', err)
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    )
  }
}
