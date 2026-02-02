import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Verify user exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, onboarding_completed')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if user already has an active subscription (don't overwrite)
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()

    if (!existingSub || existingSub.status === 'canceled' || existingSub.status === 'expired') {
      // Create trial subscription
      const { error: subError } = await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan: 'launch',
        status: 'trialing',
        current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id' })

      if (subError) {
        console.error('Trial subscription error:', subError)
        return NextResponse.json({ error: 'Failed to create trial' }, { status: 500 })
      }
    }

    // Mark onboarding complete
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId)

    if (updateError) {
      console.error('Onboarding update error:', updateError)
      return NextResponse.json({ error: 'Failed to mark onboarding complete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Onboarding complete error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
