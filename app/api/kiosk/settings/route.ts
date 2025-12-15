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

// Get kiosk settings for a workspace
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
      .select('id, name, kiosk_enabled, kiosk_slug')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      kioskEnabled: workspace.kiosk_enabled || false,
      kioskSlug: workspace.kiosk_slug || null,
      hasPin: !!workspace.kiosk_slug // If slug exists, PIN was set
    })

  } catch (err) {
    console.error('Kiosk settings GET error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch kiosk settings' },
      { status: 500 }
    )
  }
}

// Update kiosk settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId, enabled, slug, pin } = body

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'Missing workspaceId or userId' },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, kiosk_slug')
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
      updates.kiosk_enabled = enabled
    }

    // Handle slug change
    if (slug !== undefined) {
      // Validate slug format
      const slugRegex = /^[a-z0-9-]+$/
      if (slug && !slugRegex.test(slug)) {
        return NextResponse.json(
          { error: 'Slug can only contain lowercase letters, numbers, and hyphens' },
          { status: 400 }
        )
      }

      // Check for uniqueness
      if (slug) {
        const { data: existing } = await supabase
          .from('workspaces')
          .select('id')
          .eq('kiosk_slug', slug)
          .neq('id', workspaceId)
          .single()

        if (existing) {
          return NextResponse.json(
            { error: 'This URL is already taken' },
            { status: 400 }
          )
        }
      }

      updates.kiosk_slug = slug || null
    }

    // Handle PIN change
    if (pin !== undefined) {
      if (pin && (pin.length < 4 || pin.length > 6)) {
        return NextResponse.json(
          { error: 'PIN must be 4-6 digits' },
          { status: 400 }
        )
      }
      updates.kiosk_pin = pin ? hashPin(pin) : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'No changes' })
    }

    const { error: updateError } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Kiosk settings update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Kiosk settings updated'
    })

  } catch (err) {
    console.error('Kiosk settings POST error:', err)
    return NextResponse.json(
      { error: 'Failed to update kiosk settings' },
      { status: 500 }
    )
  }
}
