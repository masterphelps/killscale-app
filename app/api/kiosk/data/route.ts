import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('x-kiosk-session')

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session token' },
        { status: 401 }
      )
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('kiosk_sessions')
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

    // Get this week's stats (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Get spend
    let totalSpend = 0
    if (accountIds.length > 0) {
      const { data: spendData } = await supabase
        .from('ad_data')
        .select('spend')
        .in('ad_account_id', accountIds)
        .gte('date_start', sevenDaysAgo.toISOString().split('T')[0])

      totalSpend = spendData?.reduce((sum, row) => sum + (parseFloat(row.spend) || 0), 0) || 0
    }

    // Get pixel for revenue
    const { data: pixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    let totalRevenue = 0
    let recentWalkins: Array<{ value: number; notes: string | null; time: string }> = []

    if (pixel?.pixel_id) {
      // Get revenue from pixel events
      const { data: events } = await supabase
        .from('pixel_events')
        .select('event_value, event_time, notes, source')
        .eq('pixel_id', pixel.pixel_id)
        .gte('event_time', sevenDaysAgo.toISOString())

      totalRevenue = events?.reduce((sum, e) => sum + (parseFloat(e.event_value) || 0), 0) || 0

      // Get recent walk-ins (manual/kiosk events)
      const { data: walkinEvents } = await supabase
        .from('pixel_events')
        .select('event_value, event_time, notes, source')
        .eq('pixel_id', pixel.pixel_id)
        .in('source', ['manual', 'kiosk', 'manual_split', 'kiosk_split'])
        .order('event_time', { ascending: false })
        .limit(10)

      if (walkinEvents) {
        // Group by session_id to avoid duplicates from splits
        const seenTimes = new Set<string>()
        recentWalkins = walkinEvents
          .filter(e => {
            const timeKey = e.event_time.substring(0, 19) // Group by second
            if (seenTimes.has(timeKey)) return false
            seenTimes.add(timeKey)
            return true
          })
          .slice(0, 5)
          .map(e => ({
            value: parseFloat(e.event_value) || 0,
            notes: e.notes,
            time: e.event_time
          }))
      }
    }

    // Get active ads hierarchy for attribution dropdown (only ACTIVE items)
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

    if (accountIds.length > 0) {
      const { data: adsWithSpend } = await supabase
        .from('ad_data')
        .select('ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, status, adset_status, campaign_status')
        .in('ad_account_id', accountIds)
        .gte('date_start', sevenDaysAgo.toISOString().split('T')[0])
        .gt('spend', 0)

      if (adsWithSpend && adsWithSpend.length > 0) {
        // Filter to only active items (ad, adset, and campaign all active)
        const activeAdsData = adsWithSpend.filter(row =>
          row.status === 'ACTIVE' &&
          row.adset_status === 'ACTIVE' &&
          row.campaign_status === 'ACTIVE'
        )

        if (activeAdsData.length > 0) {
          // Aggregate spend by ad_id
          const adSpendMap = new Map<string, {
            adName: string
            adsetId: string
            adsetName: string
            campaignId: string
            campaignName: string
            spend: number
          }>()

          for (const row of activeAdsData) {
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

          const adTotalSpend = Array.from(adSpendMap.values()).reduce((sum, ad) => sum + ad.spend, 0)

          // Build hierarchical structure
          const campaignMap = new Map<string, {
            campaignName: string
            adsets: Map<string, {
              adsetName: string
              ads: Array<{ adId: string; adName: string; spend: number; spendPercentage: number }>
            }>
          }>()

          for (const [adId, adData] of Array.from(adSpendMap.entries())) {
            if (!campaignMap.has(adData.campaignId)) {
              campaignMap.set(adData.campaignId, {
                campaignName: adData.campaignName,
                adsets: new Map()
              })
            }
            const campaign = campaignMap.get(adData.campaignId)!

            if (!campaign.adsets.has(adData.adsetId)) {
              campaign.adsets.set(adData.adsetId, {
                adsetName: adData.adsetName,
                ads: []
              })
            }
            const adset = campaign.adsets.get(adData.adsetId)!

            adset.ads.push({
              adId,
              adName: adData.adName,
              spend: Math.round(adData.spend * 100) / 100,
              spendPercentage: adTotalSpend > 0 ? Math.round((adData.spend / adTotalSpend) * 100) : 0
            })
          }

          // Convert to array and sort by spend
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
      }
    }

    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name
      },
      stats: {
        spend: Math.round(totalSpend * 100) / 100,
        revenue: Math.round(totalRevenue * 100) / 100,
        roas: Math.round(roas * 100) / 100
      },
      recentWalkins,
      activeHierarchy
    })

  } catch (err) {
    console.error('Kiosk data error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch kiosk data' },
      { status: 500 }
    )
  }
}
