import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Authenticate with PIN
export async function POST(request: NextRequest) {
  try {
    const { token, pin } = await request.json()

    if (!token || !pin) {
      return NextResponse.json(
        { error: 'Missing token or PIN' },
        { status: 400 }
      )
    }

    // Find workspace by portal token
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, portal_enabled, portal_pin, user_id')
      .eq('portal_token', token)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Portal not found' },
        { status: 404 }
      )
    }

    if (!workspace.portal_enabled) {
      return NextResponse.json(
        { error: 'Portal is disabled' },
        { status: 403 }
      )
    }

    // Verify PIN
    const hashedInput = hashPin(pin)
    if (hashedInput !== workspace.portal_pin) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      )
    }

    // Create session (24 hour expiry)
    const sessionToken = generateSessionToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { error: sessionError } = await supabase
      .from('portal_sessions')
      .insert({
        workspace_id: workspace.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString()
      })

    if (sessionError) {
      console.error('Portal session creation error:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sessionToken,
      workspace: {
        id: workspace.id,
        name: workspace.name
      },
      expiresAt: expiresAt.toISOString()
    })

  } catch (err) {
    console.error('Portal auth error:', err)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

// Validate existing session
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-portal-session')

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token' },
        { status: 401 }
      )
    }

    const { data: session, error: sessionError } = await supabase
      .from('portal_sessions')
      .select('workspace_id, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      await supabase
        .from('portal_sessions')
        .delete()
        .eq('session_token', sessionToken)

      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    // Update last activity
    await supabase
      .from('portal_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', sessionToken)

    // Get workspace info
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, portal_enabled')
      .eq('id', session.workspace_id)
      .single()

    if (!workspace || !workspace.portal_enabled) {
      return NextResponse.json(
        { error: 'Portal disabled' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      valid: true,
      workspace: {
        id: workspace.id,
        name: workspace.name
      }
    })

  } catch (err) {
    console.error('Portal session validation error:', err)
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    )
  }
}
