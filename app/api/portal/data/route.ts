import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-portal-session')
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('dateRange') || '7' // days

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token' },
        { status: 401 }
      )
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('portal_sessions')
      .select('workspace_id, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    const workspaceId = session.workspace_id

    // Get workspace info
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Get workspace accounts
    const { data: accounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    const accountIds = accounts?.map(a => a.ad_account_id) || []

    // Get workspace rules for verdict calculation
    const { data: rules } = await supabase
      .from('workspace_rules')
      .select('scale_roas, min_roas, learning_spend')
      .eq('workspace_id', workspaceId)
      .single()

    const scaleRoas = rules?.scale_roas || 3.0
    const minRoas = rules?.min_roas || 1.5
    const learningSpend = rules?.learning_spend || 100

    // Calculate date range
    const days = parseInt(dateRange)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateStr = startDate.toISOString().split('T')[0]

    // Get ad performance data
    let adData: Array<{
      campaign_id: string
      campaign_name: string
      campaign_status: string
      campaign_budget_optimization: boolean
      adset_id: string
      adset_name: string
      adset_status: string
      daily_budget: number
      ad_id: string
      ad_name: string
      status: string
      spend: number
      purchases: number
      revenue: number
      impressions: number
      clicks: number
    }> = []

    if (accountIds.length > 0) {
      const { data } = await supabase
        .from('ad_data')
        .select('*')
        .in('ad_account_id', accountIds)
        .gte('date_start', startDateStr)

      adData = data || []
    }

    // Aggregate by ad_id for the selected date range
    const adAggregates = new Map<string, {
      campaignId: string
      campaignName: string
      campaignStatus: string
      isCbo: boolean
      adsetId: string
      adsetName: string
      adsetStatus: string
      dailyBudget: number
      adId: string
      adName: string
      status: string
      spend: number
      purchases: number
      revenue: number
      impressions: number
      clicks: number
    }>()

    for (const row of adData) {
      const key = row.ad_id
      const existing = adAggregates.get(key)
      if (existing) {
        existing.spend += parseFloat(String(row.spend)) || 0
        existing.purchases += row.purchases || 0
        existing.revenue += parseFloat(String(row.revenue)) || 0
        existing.impressions += row.impressions || 0
        existing.clicks += row.clicks || 0
      } else {
        adAggregates.set(key, {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          campaignStatus: row.campaign_status,
          isCbo: row.campaign_budget_optimization || false,
          adsetId: row.adset_id,
          adsetName: row.adset_name,
          adsetStatus: row.adset_status,
          dailyBudget: parseFloat(String(row.daily_budget)) || 0,
          adId: row.ad_id,
          adName: row.ad_name,
          status: row.status,
          spend: parseFloat(String(row.spend)) || 0,
          purchases: row.purchases || 0,
          revenue: parseFloat(String(row.revenue)) || 0,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0
        })
      }
    }

    // Calculate verdicts and format data
    const calculateVerdict = (spend: number, revenue: number) => {
      if (spend < learningSpend) return 'LEARN'
      const roas = spend > 0 ? revenue / spend : 0
      if (roas >= scaleRoas) return 'SCALE'
      if (roas >= minRoas) return 'WATCH'
      return 'KILL'
    }

    const performanceData = Array.from(adAggregates.values()).map(ad => {
      const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0
      const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0
      const cpc = ad.clicks > 0 ? ad.spend / ad.clicks : 0
      return {
        ...ad,
        roas: Math.round(roas * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        verdict: calculateVerdict(ad.spend, ad.revenue)
      }
    })

    // Summary stats
    const totalSpend = performanceData.reduce((sum, ad) => sum + ad.spend, 0)
    const totalRevenue = performanceData.reduce((sum, ad) => sum + ad.revenue, 0)
    const totalPurchases = performanceData.reduce((sum, ad) => sum + ad.purchases, 0)
    const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    // Get pixel for manual events
    const { data: pixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    // Get trends data (daily aggregates for chart)
    const trendsData: Array<{ date: string; spend: number; revenue: number; roas: number }> = []
    if (accountIds.length > 0) {
      const { data: dailyData } = await supabase
        .from('ad_data')
        .select('date_start, spend, revenue')
        .in('ad_account_id', accountIds)
        .gte('date_start', startDateStr)
        .order('date_start', { ascending: true })

      if (dailyData) {
        const dailyMap = new Map<string, { spend: number; revenue: number }>()
        for (const row of dailyData) {
          const date = row.date_start
          const existing = dailyMap.get(date)
          if (existing) {
            existing.spend += parseFloat(String(row.spend)) || 0
            existing.revenue += parseFloat(String(row.revenue)) || 0
          } else {
            dailyMap.set(date, {
              spend: parseFloat(String(row.spend)) || 0,
              revenue: parseFloat(String(row.revenue)) || 0
            })
          }
        }

        for (const [date, data] of Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          trendsData.push({
            date,
            spend: Math.round(data.spend * 100) / 100,
            revenue: Math.round(data.revenue * 100) / 100,
            roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 100) / 100 : 0
          })
        }
      }
    }

    // Get active hierarchy for manual events (same as kiosk)
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
    let activeHierarchy: Campaign[] = []

    // Filter to only active items
    const activeAds = performanceData.filter(ad =>
      ad.status === 'ACTIVE' &&
      ad.adsetStatus === 'ACTIVE' &&
      ad.campaignStatus === 'ACTIVE'
    )

    if (activeAds.length > 0) {
      const adTotalSpend = activeAds.reduce((sum, ad) => sum + ad.spend, 0)

      const campaignMap = new Map<string, {
        campaignName: string
        adsets: Map<string, {
          adsetName: string
          ads: Array<{ adId: string; adName: string; spend: number; spendPercentage: number }>
        }>
      }>()

      for (const ad of activeAds) {
        if (!campaignMap.has(ad.campaignId)) {
          campaignMap.set(ad.campaignId, {
            campaignName: ad.campaignName,
            adsets: new Map()
          })
        }
        const campaign = campaignMap.get(ad.campaignId)!

        if (!campaign.adsets.has(ad.adsetId)) {
          campaign.adsets.set(ad.adsetId, {
            adsetName: ad.adsetName,
            ads: []
          })
        }
        const adset = campaign.adsets.get(ad.adsetId)!

        adset.ads.push({
          adId: ad.adId,
          adName: ad.adName,
          spend: Math.round(ad.spend * 100) / 100,
          spendPercentage: adTotalSpend > 0 ? Math.round((ad.spend / adTotalSpend) * 100) : 0
        })
      }

      activeHierarchy = Array.from(campaignMap.entries())
        .map(([campaignId, data]) => ({
          campaignId,
          campaignName: data.campaignName,
          adsets: Array.from(data.adsets.entries())
            .map(([adsetId, adsetData]) => ({
              adsetId,
              adsetName: adsetData.adsetName,
              ads: adsetData.ads.sort((a, b) => b.spend - a.spend)
            }))
            .sort((a, b) => {
              const aSpend = a.ads.reduce((sum, ad) => sum + ad.spend, 0)
              const bSpend = b.ads.reduce((sum, ad) => sum + ad.spend, 0)
              return bSpend - aSpend
            })
        }))
        .sort((a, b) => {
          const aSpend = a.adsets.reduce((sum, as) => as.ads.reduce((s, ad) => s + ad.spend, sum), 0)
          const bSpend = b.adsets.reduce((sum, as) => as.ads.reduce((s, ad) => s + ad.spend, sum), 0)
          return bSpend - aSpend
        })
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name
      },
      summary: {
        spend: Math.round(totalSpend * 100) / 100,
        revenue: Math.round(totalRevenue * 100) / 100,
        purchases: totalPurchases,
        roas: Math.round(overallRoas * 100) / 100,
        adCount: performanceData.length,
        verdictCounts: {
          scale: performanceData.filter(a => a.verdict === 'SCALE').length,
          watch: performanceData.filter(a => a.verdict === 'WATCH').length,
          kill: performanceData.filter(a => a.verdict === 'KILL').length,
          learn: performanceData.filter(a => a.verdict === 'LEARN').length
        }
      },
      performance: performanceData,
      trends: trendsData,
      activeHierarchy,
      pixelId: pixel?.pixel_id || null,
      rules: {
        scaleRoas,
        minRoas,
        learningSpend
      }
    })

  } catch (err) {
    console.error('Portal data error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch portal data' },
      { status: 500 }
    )
  }
}
