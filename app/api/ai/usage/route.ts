import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Plan credit limits
const PLAN_CREDITS: Record<string, number> = {
  pro: 500,
  scale: 500,
  launch: 500,
}
const TRIAL_CREDITS = 25

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const includeHistory = request.nextUrl.searchParams.get('includeHistory') === 'true'
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
      return NextResponse.json({ used: 0, planLimit: 0, purchased: 0, totalAvailable: 0, remaining: 0, status: 'inactive' })
    }

    // Determine the plan credit limit
    const plan = sub?.plan || 'launch'
    let planLimit = isTrial ? TRIAL_CREDITS : (PLAN_CREDITS[plan] || PLAN_CREDITS.launch)

    // Credit override takes precedence over plan default
    if (override?.credit_limit) {
      planLimit = override.credit_limit
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // Calculate used credits (SUM of credit_cost)
    let usedQuery = supabase
      .from('ai_generation_usage')
      .select('credit_cost')
      .eq('user_id', userId)

    if (!isTrial || override) {
      // Active subscriber: count this calendar month
      usedQuery = usedQuery.gte('created_at', monthStart)
    }
    // Trial without override: count all-time (no date filter)

    const { data: usageRows } = await usedQuery
    const used = (usageRows || []).reduce((sum, row) => sum + (row.credit_cost || 5), 0)

    // Get purchased credits (current month only — packs don't roll over)
    const { data: purchaseRows } = await supabase
      .from('ai_credit_purchases')
      .select('credits')
      .eq('user_id', userId)
      .gte('created_at', monthStart)

    const purchased = (purchaseRows || []).reduce((sum, row) => sum + row.credits, 0)

    const totalAvailable = planLimit + purchased
    const remaining = Math.max(0, totalAvailable - used)

    const status = hasAdminSub ? 'demo' : isTrial ? 'trial' : 'active'

    const response: Record<string, any> = {
      used,
      planLimit,
      purchased,
      totalAvailable,
      remaining,
      status,
    }

    // Optional history for usage log
    if (includeHistory) {
      const { data: history } = await supabase
        .from('ai_generation_usage')
        .select('generation_type, generation_label, credit_cost, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      response.history = history || []
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[AI Usage] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
