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
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Get subscription status (check both Stripe and admin-granted)
    const [subResult, adminSubResult, overrideResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('admin_granted_subscriptions')
        .select('plan, is_active, expires_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('ai_credit_overrides')
        .select('credit_limit')
        .eq('user_id', userId)
        .single(),
    ])

    const sub = subResult.data
    const adminSub = adminSubResult.data
    const override = overrideResult.data

    // Check admin-granted subscription (active + not expired)
    const hasAdminSub = adminSub?.is_active && new Date(adminSub.expires_at) > new Date()

    const isTrial = sub?.status === 'trialing'
    const isActive = sub?.status === 'active' || isTrial || hasAdminSub

    if (!isActive) {
      return NextResponse.json({ used: 0, limit: 0, status: 'inactive' })
    }

    // Determine the default limit
    let defaultLimit = 50
    if (isTrial) defaultLimit = 10

    // Credit override takes precedence over plan default
    const limit = override?.credit_limit ?? defaultLimit

    if (isTrial && !override) {
      // Trial: count all-time usage
      const { count } = await supabase
        .from('ai_generation_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      return NextResponse.json({
        used: count || 0,
        limit,
        status: 'trial',
      })
    }

    // Active subscriber: count this calendar month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { count } = await supabase
      .from('ai_generation_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart)

    return NextResponse.json({
      used: count || 0,
      limit,
      status: hasAdminSub ? 'demo' : 'active',
    })
  } catch (err) {
    console.error('[AI Usage] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
