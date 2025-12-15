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

function generatePortalToken(): string {
  return crypto.randomBytes(16).toString('hex')  // 32 char token
}

// Get portal settings for a workspace
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const userId = searchParams.get('userId')

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'Missing workspaceId or userId' },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, portal_enabled, portal_token')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    // Build the portal URL if enabled
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'
    const portalUrl = workspace.portal_token ? `${baseUrl}/portal/${workspace.portal_token}` : null

    return NextResponse.json({
      portalEnabled: workspace.portal_enabled || false,
      portalToken: workspace.portal_token || null,
      portalUrl,
      hasPin: !!workspace.portal_token  // If token exists, PIN was set
    })

  } catch (err) {
    console.error('Portal settings GET error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch portal settings' },
      { status: 500 }
    )
  }
}

// Update portal settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId, enabled, pin } = body

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'Missing workspaceId or userId' },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, portal_token')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    const updates: Record<string, unknown> = {}

    // Handle enabled toggle
    if (enabled !== undefined) {
      updates.portal_enabled = enabled
    }

    // Handle PIN change (setting a new PIN also generates a token if none exists)
    if (pin !== undefined) {
      if (pin && (pin.length < 4 || pin.length > 6)) {
        return NextResponse.json(
          { error: 'PIN must be 4-6 digits' },
          { status: 400 }
        )
      }

      if (pin) {
        updates.portal_pin = hashPin(pin)
        // Generate token if one doesn't exist
        if (!workspace.portal_token) {
          updates.portal_token = generatePortalToken()
        }
      } else {
        // Clear PIN and token if PIN is removed
        updates.portal_pin = null
        updates.portal_token = null
        updates.portal_enabled = false
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'No changes' })
    }

    const { error: updateError } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Portal settings update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      )
    }

    // Get the updated token for response
    const { data: updated } = await supabase
      .from('workspaces')
      .select('portal_token, portal_enabled')
      .eq('id', workspaceId)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'
    const portalUrl = updated?.portal_token ? `${baseUrl}/portal/${updated.portal_token}` : null

    return NextResponse.json({
      success: true,
      message: 'Portal settings updated',
      portalToken: updated?.portal_token,
      portalUrl,
      portalEnabled: updated?.portal_enabled
    })

  } catch (err) {
    console.error('Portal settings POST error:', err)
    return NextResponse.json(
      { error: 'Failed to update portal settings' },
      { status: 500 }
    )
  }
}
