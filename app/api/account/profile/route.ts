import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Fetch profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, company')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
    }

    // Fetch preferences (may not exist yet)
    const { data: preferences, error: prefError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (prefError && prefError.code !== 'PGRST116') {
      console.error('Preferences fetch error:', prefError)
    }

    return NextResponse.json({
      profile: profile || { full_name: null, email: null, company: null },
      preferences: preferences || {
        timezone: 'UTC',
        currency: 'USD',
        date_range_default: 7,
        default_landing_page: 'dashboard',
        email_digest_enabled: true,
        alert_emails_enabled: true,
        marketing_emails_enabled: false,
      }
    })
  } catch (error: any) {
    console.error('Profile GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId, profile, preferences } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Update profile if provided
    if (profile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          company: profile.company,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (profileError) {
        console.error('Profile update error:', profileError)
        return NextResponse.json(
          { error: 'Failed to update profile' },
          { status: 500 }
        )
      }

      // Also update user metadata in auth.users
      const { error: authError } = await supabase.auth.admin.updateUserById(
        userId,
        { user_metadata: { full_name: profile.full_name } }
      )

      if (authError) {
        console.error('Auth metadata update error:', authError)
      }
    }

    // Update preferences if provided
    if (preferences) {
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          timezone: preferences.timezone,
          currency: preferences.currency,
          date_range_default: preferences.date_range_default,
          default_landing_page: preferences.default_landing_page,
          email_digest_enabled: preferences.email_digest_enabled,
          alert_emails_enabled: preferences.alert_emails_enabled,
          marketing_emails_enabled: preferences.marketing_emails_enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (prefError) {
        console.error('Preferences update error:', prefError)
        return NextResponse.json(
          { error: 'Failed to update preferences' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Profile PUT error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}
