import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Validate and get invite details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400 }
      )
    }

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invites')
      .select(`
        id,
        email,
        role,
        can_log_walkins,
        expires_at,
        accepted_at,
        workspace:workspaces(id, name)
      `)
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid invite' },
        { status: 404 }
      )
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: 'Invite already accepted' },
        { status: 400 }
      )
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Invite has expired' },
        { status: 400 }
      )
    }

    const ws = invite.workspace as unknown as { name: string } | null
    return NextResponse.json({
      invite: {
        email: invite.email,
        role: invite.role,
        workspaceName: ws?.name || 'Workspace'
      }
    })

  } catch (err) {
    console.error('Validate invite error:', err)
    return NextResponse.json(
      { error: 'Failed to validate invite' },
      { status: 500 }
    )
  }
}

// Accept invite
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, userId } = body

    if (!token || !userId) {
      return NextResponse.json(
        { error: 'Missing token or userId' },
        { status: 400 }
      )
    }

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invites')
      .select('id, workspace_id, email, role, can_log_walkins, expires_at, accepted_at, invited_by')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invalid invite' },
        { status: 404 }
      )
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: 'Invite already accepted' },
        { status: 400 }
      )
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Invite has expired' },
        { status: 400 }
      )
    }

    // Get user's email
    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    if (!userData?.user?.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Verify email matches
    if (userData.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invite is for a different email address' },
        { status: 403 }
      )
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', invite.workspace_id)
      .eq('user_id', userId)
      .single()

    if (existingMember) {
      // Just mark invite as accepted
      await supabase
        .from('workspace_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      return NextResponse.json({
        success: true,
        message: 'Already a member of this workspace'
      })
    }

    // Create membership
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: invite.workspace_id,
        user_id: userId,
        role: invite.role,
        can_log_walkins: invite.can_log_walkins,
        invited_by: invite.invited_by,
        accepted_at: new Date().toISOString()
      })

    if (memberError) {
      console.error('Create member error:', memberError)
      return NextResponse.json(
        { error: 'Failed to accept invite' },
        { status: 500 }
      )
    }

    // Mark invite as accepted
    await supabase
      .from('workspace_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    return NextResponse.json({
      success: true,
      workspaceId: invite.workspace_id
    })

  } catch (err) {
    console.error('Accept invite error:', err)
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    )
  }
}
