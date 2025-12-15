import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Create a new invite
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId, email, role = 'viewer', canLogWalkins = true } = body

    if (!workspaceId || !userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, user_id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', (await supabase.from('auth.users').select('id').eq('email', email.toLowerCase()).single()).data?.id)
      .single()

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this workspace' },
        { status: 400 }
      )
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from('workspace_invites')
      .select('id, expires_at')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .single()

    if (existingInvite) {
      // If expired, delete it and create new
      if (new Date(existingInvite.expires_at) < new Date()) {
        await supabase
          .from('workspace_invites')
          .delete()
          .eq('id', existingInvite.id)
      } else {
        return NextResponse.json(
          { error: 'An invite is already pending for this email' },
          { status: 400 }
        )
      }
    }

    // Create invite
    const token = generateInviteToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invite, error: insertError } = await supabase
      .from('workspace_invites')
      .insert({
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role,
        can_log_walkins: canLogWalkins,
        token,
        invited_by: userId,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Invite creation error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create invite' },
        { status: 500 }
      )
    }

    // TODO: Send email with invite link
    // For now, return the invite URL directly
    const inviteUrl = `https://app.killscale.com/invite/${token}`

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expires_at,
        inviteUrl
      }
    })

  } catch (err) {
    console.error('Invite creation error:', err)
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500 }
    )
  }
}

// Get pending invites for a workspace
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
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    // Get pending invites
    const { data: invites, error: invitesError } = await supabase
      .from('workspace_invites')
      .select('id, email, role, can_log_walkins, created_at, expires_at, token')
      .eq('workspace_id', workspaceId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    if (invitesError) {
      console.error('Fetch invites error:', invitesError)
      return NextResponse.json(
        { error: 'Failed to fetch invites' },
        { status: 500 }
      )
    }

    // Filter out expired invites
    const activeInvites = invites?.filter(inv => new Date(inv.expires_at) > new Date()) || []

    return NextResponse.json({
      invites: activeInvites.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        canLogWalkins: inv.can_log_walkins,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        inviteUrl: `https://app.killscale.com/invite/${inv.token}`
      }))
    })

  } catch (err) {
    console.error('Fetch invites error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500 }
    )
  }
}

// Delete/cancel an invite
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inviteId = searchParams.get('inviteId')
    const userId = searchParams.get('userId')

    if (!inviteId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params' },
        { status: 400 }
      )
    }

    // Get invite to verify ownership
    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invites')
      .select('id, workspace_id')
      .eq('id', inviteId)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', invite.workspace_id)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Delete invite
    const { error: deleteError } = await supabase
      .from('workspace_invites')
      .delete()
      .eq('id', inviteId)

    if (deleteError) {
      console.error('Delete invite error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete invite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete invite error:', err)
    return NextResponse.json(
      { error: 'Failed to delete invite' },
      { status: 500 }
    )
  }
}
