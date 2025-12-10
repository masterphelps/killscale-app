import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')

    if (!userId || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Get the most recent budget change for this entity
    const { data, error } = await supabase
      .from('budget_changes')
      .select('old_budget, new_budget, changed_at')
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('changed_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error('Budget history query error:', error)
      return NextResponse.json({ error: 'Failed to fetch budget history' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({
        lastChange: null,
        daysSinceChange: null
      })
    }

    // Calculate days since last change
    const changedAt = new Date(data.changed_at)
    const now = new Date()
    const diffMs = now.getTime() - changedAt.getTime()
    const daysSinceChange = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    return NextResponse.json({
      lastChange: {
        old_budget: data.old_budget,
        new_budget: data.new_budget,
        changed_at: data.changed_at
      },
      daysSinceChange
    })

  } catch (err) {
    console.error('Budget history error:', err)
    return NextResponse.json({ error: 'Failed to fetch budget history' }, { status: 500 })
  }
}
