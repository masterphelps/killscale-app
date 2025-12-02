import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default settings for each alert type
const DEFAULT_SETTINGS = {
  high_spend_no_conv: { enabled: true, threshold: 50, email_enabled: false },
  roas_below_min: { enabled: true, threshold: null, email_enabled: false }, // Uses rules.min_roas
  roas_above_scale: { enabled: true, threshold: null, email_enabled: false }, // Uses rules.scale_roas
  status_changed: { enabled: false, threshold: null, email_enabled: false },
  ad_fatigue: { enabled: false, threshold: 3, email_enabled: false }, // 3 days of decline
}

export type AlertType = keyof typeof DEFAULT_SETTINGS

// GET - Fetch alert settings for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }

    // Fetch existing settings
    let query = supabase
      .from('alert_settings')
      .select('*')
      .eq('user_id', userId)

    // Filter by account if provided
    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    } else {
      query = query.is('ad_account_id', null)
    }

    const { data: existingSettings, error } = await query

    if (error) {
      console.error('Error fetching alert settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Merge with defaults
    const settings: Record<string, any> = {}

    for (const [alertType, defaults] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = existingSettings?.find(s => s.alert_type === alertType)

      settings[alertType] = {
        alert_type: alertType,
        enabled: existing?.enabled ?? defaults.enabled,
        threshold: existing?.threshold ?? defaults.threshold,
        email_enabled: existing?.email_enabled ?? defaults.email_enabled,
      }
    }

    return NextResponse.json({ settings })

  } catch (err) {
    console.error('Alert settings fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// POST - Update alert settings
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, alertType, updates } = await request.json()

    if (!userId || !alertType) {
      return NextResponse.json({ error: 'Missing user ID or alert type' }, { status: 400 })
    }

    // Validate alert type
    if (!DEFAULT_SETTINGS[alertType as AlertType]) {
      return NextResponse.json({ error: 'Invalid alert type' }, { status: 400 })
    }

    // Build update object
    const settingData: Record<string, any> = {
      user_id: userId,
      alert_type: alertType,
      updated_at: new Date().toISOString(),
    }

    // Include ad_account_id if provided
    if (adAccountId) {
      settingData.ad_account_id = adAccountId
    }

    if (typeof updates.enabled === 'boolean') {
      settingData.enabled = updates.enabled
    }
    if (updates.threshold !== undefined) {
      settingData.threshold = updates.threshold
    }
    if (typeof updates.email_enabled === 'boolean') {
      settingData.email_enabled = updates.email_enabled
    }

    // Upsert the setting - use appropriate conflict key based on whether account is specified
    const conflictKey = adAccountId ? 'user_id,ad_account_id,alert_type' : 'user_id,alert_type'
    const { error } = await supabase
      .from('alert_settings')
      .upsert(settingData, {
        onConflict: conflictKey,
      })

    if (error) {
      console.error('Error updating alert setting:', error)
      return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Alert settings update error:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
