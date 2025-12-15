import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple hash function for PIN comparison
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

// Generate secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const { slug, pin } = await request.json()

    if (!slug || !pin) {
      return NextResponse.json(
        { error: 'Missing slug or PIN' },
        { status: 400 }
      )
    }

    // Find workspace by slug
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, kiosk_enabled, kiosk_pin, user_id')
      .eq('kiosk_slug', slug)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Kiosk not found' },
        { status: 404 }
      )
    }

    if (!workspace.kiosk_enabled) {
      return NextResponse.json(
        { error: 'Kiosk is disabled' },
        { status: 403 }
      )
    }

    // Verify PIN
    const hashedInput = hashPin(pin)
    if (hashedInput !== workspace.kiosk_pin) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      )
    }

    // Create session
    const sessionToken = generateSessionToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { error: sessionError } = await supabase
      .from('kiosk_sessions')
      .insert({
        workspace_id: workspace.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString()
      })

    if (sessionError) {
      console.error('Session creation error:', sessionError)
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
    console.error('Kiosk auth error:', err)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

// Validate existing session
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-kiosk-session')

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token' },
        { status: 401 }
      )
    }

    const { data: session, error: sessionError } = await supabase
      .from('kiosk_sessions')
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
        .from('kiosk_sessions')
        .delete()
        .eq('session_token', sessionToken)

      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    // Update last activity
    await supabase
      .from('kiosk_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', sessionToken)

    // Get workspace info
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, kiosk_enabled')
      .eq('id', session.workspace_id)
      .single()

    if (!workspace || !workspace.kiosk_enabled) {
      return NextResponse.json(
        { error: 'Kiosk disabled' },
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
    console.error('Session validation error:', err)
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    )
  }
}
