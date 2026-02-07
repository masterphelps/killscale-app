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

    // Get subscription status
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .single()

    const isTrial = sub?.status === 'trialing'
    const isActive = sub?.status === 'active' || isTrial

    if (!isActive) {
      return NextResponse.json({ used: 0, limit: 0, status: 'inactive' })
    }

    if (isTrial) {
      // Trial: 10 total (all time)
      const { count } = await supabase
        .from('ai_generation_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      return NextResponse.json({
        used: count || 0,
        limit: 10,
        status: 'trial',
      })
    }

    // Active subscriber: 50 per calendar month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { count } = await supabase
      .from('ai_generation_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart)

    return NextResponse.json({
      used: count || 0,
      limit: 50,
      status: 'active',
    })
  } catch (err) {
    console.error('[AI Usage] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
