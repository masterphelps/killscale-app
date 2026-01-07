import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUpPromoteConnection, updateSyncStatus } from '@/lib/uppromote/auth'
import type { UpPromoteApiResponse, UpPromoteApiReferral } from '@/lib/uppromote/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Normalize status from UpPromote API to our database format
 */
function normalizeStatus(status: string): 'pending' | 'approved' | 'declined' | 'paid' {
  const normalized = status.toLowerCase()
  if (normalized === 'approved' || normalized === 'approve') return 'approved'
  if (normalized === 'paid') return 'paid'
  if (normalized === 'declined' || normalized === 'decline') return 'declined'
  return 'pending'
}

/**
 * Fetch referrals from UpPromote API with pagination
 */
async function fetchAllReferrals(
  apiKey: string,
  dateStart: string,
  dateEnd: string
): Promise<UpPromoteApiReferral[]> {
  const allReferrals: UpPromoteApiReferral[] = []
  let currentPage = 1
  let hasMorePages = true
  const maxPages = 100 // Safety limit (50 per page = 5000 referrals max)

  while (hasMorePages && currentPage <= maxPages) {
    const url = new URL('https://aff-api.uppromote.com/api/v1/referrals')
    url.searchParams.set('from_date', dateStart)
    url.searchParams.set('to_date', dateEnd)
    // Note: Don't filter by status in API - filter locally instead (API filter unreliable)
    url.searchParams.set('limit', '50')
    url.searchParams.set('page', currentPage.toString())

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`UpPromote API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()

    console.log(`[UpPromote Sync] Page ${currentPage}: ${result.data?.length || 0} referrals`)

    // UpPromote API returns { data: [], links: {}, meta: {} } - no success field
    if (!result.data || result.data.length === 0) {
      // No more data
      hasMorePages = false
      break
    }

    // Add referrals from this page
    allReferrals.push(...result.data)

    // Check if there are more pages (API uses 'meta' not 'pagination')
    if (result.meta) {
      hasMorePages = currentPage < result.meta.last_page
      currentPage++
    } else {
      // No pagination info, assume no more pages
      hasMorePages = false
    }

    // Rate limiting: wait 500ms between requests
    if (hasMorePages) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return allReferrals
}

/**
 * Calculate default date range (90 days ago to today)
 */
function getDefaultDateRange(): { dateStart: string; dateEnd: string } {
  const today = new Date()
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(today.getDate() - 90)

  return {
    dateStart: ninetyDaysAgo.toISOString().split('T')[0], // YYYY-MM-DD
    dateEnd: today.toISOString().split('T')[0], // YYYY-MM-DD
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, userId, dateStart: providedDateStart, dateEnd: providedDateEnd } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Verify user has access to this workspace (owner or member)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (!workspace) {
      // Not the owner, check if they're a member
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'Access denied to workspace' }, { status: 403 })
      }
    }

    // Get UpPromote connection for this workspace
    const connection = await getUpPromoteConnection(workspaceId)
    if (!connection) {
      return NextResponse.json({ error: 'UpPromote not connected' }, { status: 401 })
    }

    // Determine date range (default: last 90 days to today)
    const { dateStart, dateEnd } = providedDateStart && providedDateEnd
      ? { dateStart: providedDateStart, dateEnd: providedDateEnd }
      : getDefaultDateRange()

    console.log(`[UpPromote Sync] Fetching referrals from ${dateStart} to ${dateEnd} for workspace ${workspaceId}`)

    // Update status to syncing
    await updateSyncStatus(workspaceId, 'syncing')

    // Fetch all referrals from UpPromote
    const referrals = await fetchAllReferrals(
      connection.api_key,
      dateStart,
      dateEnd
    )

    console.log(`[UpPromote Sync] Fetched ${referrals.length} referrals from UpPromote`)

    if (referrals.length === 0) {
      await updateSyncStatus(workspaceId, 'success')
      return NextResponse.json({
        message: 'No referrals found',
        count: 0,
        total_commission: 0,
        dateStart,
        dateEnd,
      })
    }

    // Transform UpPromote referrals to our format
    const referralData = referrals.map(referral => {
      return {
        workspace_id: workspaceId,
        user_id: userId,
        uppromote_referral_id: String(referral.id),
        order_id: referral.order_id ? String(referral.order_id) : null,
        order_number: referral.order_number || null,
        total_sales: typeof referral.total_sales === 'string'
          ? parseFloat(referral.total_sales)
          : referral.total_sales,
        commission: typeof referral.commission === 'string'
          ? parseFloat(referral.commission)
          : referral.commission,
        currency: referral.currency || 'USD',
        status: normalizeStatus(referral.status),
        affiliate_id: referral.affiliate?.id ? String(referral.affiliate.id) : null,
        affiliate_name: referral.affiliate?.name || null,
        affiliate_email: referral.affiliate?.email || null,
        tracking_type: referral.tracking_type || null,
        coupon_code: referral.coupon_code || null,
        // Convert Unix timestamp to ISO string
        referral_created_at: typeof referral.created_at === 'number'
          ? new Date(referral.created_at * 1000).toISOString()
          : referral.created_at,
        approved_at: referral.approved_at
          ? (typeof referral.approved_at === 'number' ? new Date(referral.approved_at * 1000).toISOString() : referral.approved_at)
          : null,
        paid_at: referral.paid_at
          ? (typeof referral.paid_at === 'number' ? new Date(referral.paid_at * 1000).toISOString() : referral.paid_at)
          : null,
        synced_at: new Date().toISOString(),
      }
    })

    // Upsert referrals to database (insert or update on conflict)
    const BATCH_SIZE = 500
    const batches: typeof referralData[] = []
    for (let i = 0; i < referralData.length; i += BATCH_SIZE) {
      batches.push(referralData.slice(i, i + BATCH_SIZE))
    }

    let totalUpserted = 0
    let totalCommission = 0

    for (const batch of batches) {
      const { data, error } = await supabase
        .from('uppromote_referrals')
        .upsert(batch, {
          onConflict: 'workspace_id,uppromote_referral_id',
          ignoreDuplicates: false,
        })
        .select('id, commission')

      if (error) {
        console.error('[UpPromote Sync] Upsert error:', error)
        await updateSyncStatus(workspaceId, 'error', error.message)
        return NextResponse.json({ error: 'Failed to save referrals' }, { status: 500 })
      }

      totalUpserted += data?.length || batch.length

      // Calculate total commission from this batch
      if (data) {
        totalCommission += data.reduce((sum, row) => sum + (parseFloat(String(row.commission)) || 0), 0)
      } else {
        totalCommission += batch.reduce((sum, row) => sum + row.commission, 0)
      }
    }

    // Update connection status to success
    await updateSyncStatus(workspaceId, 'success')

    console.log(`[UpPromote Sync] Successfully synced ${totalUpserted} referrals for workspace ${workspaceId}`)
    console.log(`[UpPromote Sync] Total commission: $${totalCommission.toFixed(2)}`)

    return NextResponse.json({
      message: 'Referrals synced successfully',
      count: totalUpserted,
      total_commission: totalCommission,
      dateStart,
      dateEnd,
    })

  } catch (err) {
    console.error('[UpPromote Sync] Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Sync failed'

    // Try to update sync status to error if we have workspaceId
    try {
      const body = await request.json()
      if (body.workspaceId) {
        await updateSyncStatus(body.workspaceId, 'error', errorMessage)
      }
    } catch {
      // Ignore error updating status
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
