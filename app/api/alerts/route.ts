import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch alerts for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const countOnly = searchParams.get('countOnly') === 'true'
    const dismissed = searchParams.get('dismissed') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }

    // If only count is requested (for sidebar badge)
    if (countOnly) {
      let countQuery = supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_dismissed', false)

      // Filter by account if provided
      if (adAccountId) {
        countQuery = countQuery.eq('ad_account_id', adAccountId)
      }

      const { count, error } = await countQuery

      if (error) {
        return NextResponse.json({ error: 'Failed to count alerts' }, { status: 500 })
      }

      return NextResponse.json({ count: count || 0 })
    }

    // Fetch alerts
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_dismissed', dismissed) // false = active, true = history
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by account if provided
    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    }

    if (unreadOnly && !dismissed) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching alerts:', error)
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }

    return NextResponse.json({ alerts: data || [] })

  } catch (err) {
    console.error('Alerts fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}

// PATCH - Update alert (mark read, dismiss, action taken)
export async function PATCH(request: NextRequest) {
  try {
    const { alertId, userId, updates } = await request.json()
    
    if (!alertId || !userId) {
      return NextResponse.json({ error: 'Missing alert ID or user ID' }, { status: 400 })
    }
    
    const allowedUpdates: Record<string, any> = {}
    
    if (typeof updates.is_read === 'boolean') {
      allowedUpdates.is_read = updates.is_read
    }
    if (typeof updates.is_dismissed === 'boolean') {
      allowedUpdates.is_dismissed = updates.is_dismissed
    }
    if (typeof updates.action_taken === 'string') {
      allowedUpdates.action_taken = updates.action_taken
    }
    
    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
    }
    
    allowedUpdates.updated_at = new Date().toISOString()
    
    const { error } = await supabase
      .from('alerts')
      .update(allowedUpdates)
      .eq('id', alertId)
      .eq('user_id', userId)
    
    if (error) {
      console.error('Error updating alert:', error)
      return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (err) {
    console.error('Alert update error:', err)
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 })
  }
}

// POST - Bulk actions (mark all read, dismiss all)
export async function POST(request: NextRequest) {
  try {
    const { userId, action } = await request.json()
    
    if (!userId || !action) {
      return NextResponse.json({ error: 'Missing user ID or action' }, { status: 400 })
    }
    
    if (action === 'mark_all_read') {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)
      
      if (error) {
        return NextResponse.json({ error: 'Failed to mark alerts as read' }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, action: 'mark_all_read' })
    }
    
    if (action === 'dismiss_all') {
      const { error } = await supabase
        .from('alerts')
        .update({ is_dismissed: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_dismissed', false)
      
      if (error) {
        return NextResponse.json({ error: 'Failed to dismiss alerts' }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, action: 'dismiss_all' })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    
  } catch (err) {
    console.error('Bulk alert action error:', err)
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 })
  }
}
