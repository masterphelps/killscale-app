import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Ad {
  adId: string
  adName: string
  spend: number
  spendPercentage: number
}

interface AdSet {
  adsetId: string
  adsetName: string
  ads: Ad[]
}

interface Campaign {
  campaignId: string
  campaignName: string
  adsets: AdSet[]
}

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
      return NextResponse.json({ campaigns: [], totalSpend: 0 })
    }

    const accountIds = accounts.map(a => a.ad_account_id)

    // Get active ads with spend in last 7 days
    // Only get ACTIVE ads (not paused)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: adsWithSpend } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, status, adset_status, campaign_status')
      .in('ad_account_id', accountIds)
      .gte('date_start', sevenDaysAgo.toISOString().split('T')[0])
      .gt('spend', 0)

    if (!adsWithSpend || adsWithSpend.length === 0) {
      return NextResponse.json({ campaigns: [], totalSpend: 0 })
    }

    // Filter to only active items (ad, adset, and campaign all active)
    const activeAds = adsWithSpend.filter(row =>
      row.status === 'ACTIVE' &&
      row.adset_status === 'ACTIVE' &&
      row.campaign_status === 'ACTIVE'
    )

    if (activeAds.length === 0) {
      return NextResponse.json({ campaigns: [], totalSpend: 0 })
    }

    // Aggregate spend by ad_id (since we may have multiple rows per ad from different dates)
    const adSpendMap = new Map<string, {
      adName: string
      adsetId: string
      adsetName: string
      campaignId: string
      campaignName: string
      spend: number
    }>()

    for (const row of activeAds) {
      const existing = adSpendMap.get(row.ad_id)
      const spend = parseFloat(row.spend) || 0
      if (existing) {
        existing.spend += spend
      } else {
        adSpendMap.set(row.ad_id, {
          adName: row.ad_name,
          adsetId: row.adset_id,
          adsetName: row.adset_name,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          spend
        })
      }
    }

    const totalSpend = Array.from(adSpendMap.values()).reduce((sum, ad) => sum + ad.spend, 0)

    // Build hierarchical structure: campaigns > adsets > ads
    const campaignMap = new Map<string, {
      campaignName: string
      adsets: Map<string, {
        adsetName: string
        ads: Array<{ adId: string; adName: string; spend: number; spendPercentage: number }>
      }>
    }>()

    for (const [adId, adData] of Array.from(adSpendMap.entries())) {
      // Get or create campaign
      if (!campaignMap.has(adData.campaignId)) {
        campaignMap.set(adData.campaignId, {
          campaignName: adData.campaignName,
          adsets: new Map()
        })
      }
      const campaign = campaignMap.get(adData.campaignId)!

      // Get or create adset
      if (!campaign.adsets.has(adData.adsetId)) {
        campaign.adsets.set(adData.adsetId, {
          adsetName: adData.adsetName,
          ads: []
        })
      }
      const adset = campaign.adsets.get(adData.adsetId)!

      // Add ad
      adset.ads.push({
        adId,
        adName: adData.adName,
        spend: Math.round(adData.spend * 100) / 100,
        spendPercentage: totalSpend > 0 ? Math.round((adData.spend / totalSpend) * 100) : 0
      })
    }

    // Convert to array and sort
    const campaigns: Campaign[] = Array.from(campaignMap.entries())
      .map(([campaignId, data]) => ({
        campaignId,
        campaignName: data.campaignName,
        adsets: Array.from(data.adsets.entries())
          .map(([adsetId, adsetData]) => ({
            adsetId,
            adsetName: adsetData.adsetName,
            ads: adsetData.ads.sort((a, b) => b.spend - a.spend) // Sort ads by spend desc
          }))
          .sort((a, b) => {
            // Sort adsets by total spend desc
            const aSpend = a.ads.reduce((sum, ad) => sum + ad.spend, 0)
            const bSpend = b.ads.reduce((sum, ad) => sum + ad.spend, 0)
            return bSpend - aSpend
          })
      }))
      .sort((a, b) => {
        // Sort campaigns by total spend desc
        const aSpend = a.adsets.reduce((sum, as) => as.ads.reduce((s, ad) => s + ad.spend, sum), 0)
        const bSpend = b.adsets.reduce((sum, as) => as.ads.reduce((s, ad) => s + ad.spend, sum), 0)
        return bSpend - aSpend
      })

    return NextResponse.json({
      campaigns,
      totalSpend: Math.round(totalSpend * 100) / 100,
      dateRange: {
        start: sevenDaysAgo.toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    })

  } catch (err) {
    console.error('Active hierarchy error:', err)
    return NextResponse.json({ error: 'Failed to fetch active hierarchy' }, { status: 500 })
  }
}
