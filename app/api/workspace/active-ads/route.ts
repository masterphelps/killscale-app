import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const userId = searchParams.get('userId')

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'Missing required params: workspaceId, userId' },
        { status: 400 }
      )
    }

    // Verify workspace ownership
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, user_id')
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 })
    }

    // Get workspace's ad accounts
    const { data: accounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ ads: [], totalSpend: 0 })
    }

    const accountIds = accounts.map(a => a.ad_account_id)

    // Get ads with spend in last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: adsWithSpend } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, campaign_name, spend')
      .in('ad_account_id', accountIds)
      .gte('date_start', sevenDaysAgo.toISOString().split('T')[0])
      .gt('spend', 0)

    if (!adsWithSpend || adsWithSpend.length === 0) {
      return NextResponse.json({ ads: [], totalSpend: 0 })
    }

    // Aggregate spend by ad_id
    const adSpendMap = new Map<string, {
      name: string
      campaignName: string
      spend: number
    }>()

    for (const row of adsWithSpend) {
      const existing = adSpendMap.get(row.ad_id)
      const spend = parseFloat(row.spend) || 0
      if (existing) {
        existing.spend += spend
      } else {
        adSpendMap.set(row.ad_id, {
          name: row.ad_name,
          campaignName: row.campaign_name,
          spend
        })
      }
    }

    const totalSpend = Array.from(adSpendMap.values()).reduce((sum, ad) => sum + ad.spend, 0)

    // Build response with percentage
    const ads = Array.from(adSpendMap.entries())
      .map(([adId, data]) => ({
        adId,
        adName: data.name,
        campaignName: data.campaignName,
        spend: Math.round(data.spend * 100) / 100,
        spendPercentage: totalSpend > 0 ? Math.round((data.spend / totalSpend) * 100) : 0
      }))
      .sort((a, b) => b.spend - a.spend)  // Sort by spend descending

    return NextResponse.json({
      ads,
      totalSpend: Math.round(totalSpend * 100) / 100,
      dateRange: {
        start: sevenDaysAgo.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    })

  } catch (err) {
    console.error('Active ads error:', err)
    return NextResponse.json({ error: 'Failed to fetch active ads' }, { status: 500 })
  }
}
