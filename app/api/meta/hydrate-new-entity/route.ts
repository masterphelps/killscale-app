import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Hydrate a newly created/duplicated entity by fetching its hierarchy from Meta API
 * and inserting zero-metric stub rows into ad_data so it appears immediately in the
 * performance table. The next full sync replaces these stubs with real data.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, entityType, entityId } = await request.json() as {
      userId: string
      adAccountId: string
      entityType: 'campaign' | 'adset' | 'ad'
      entityId: string
    }

    if (!userId || !adAccountId || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token
    const cleanAccountId = adAccountId.replace(/^act_/, '')
    const normalizedAccountId = `act_${cleanAccountId}`

    // Use local date format (not UTC) to match dashboard queries
    // Dashboard entity query uses local dates, so hydrated rows must match
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // Collect all ads to insert as stub rows
    const adsToInsert: Array<{
      ad_id: string
      ad_name: string
      adset_id: string
      adset_name: string
      campaign_id: string
      campaign_name: string
      status: string
      adset_status: string
      campaign_status: string
      campaign_daily_budget: number | null
      campaign_lifetime_budget: number | null
      adset_daily_budget: number | null
      adset_lifetime_budget: number | null
      creative_id: string | null
      thumbnail_url: string | null
      video_id: string | null
    }> = []

    if (entityType === 'campaign') {
      // Fetch campaign → its adsets → each adset's ads
      const campaignRes = await fetch(
        `${META_GRAPH_URL}/${entityId}?fields=name,status,daily_budget,lifetime_budget&access_token=${accessToken}`
      )
      const campaign = await campaignRes.json()
      if (campaign.error) {
        return NextResponse.json({ error: campaign.error.message }, { status: 400 })
      }

      const adsetsRes = await fetch(
        `${META_GRAPH_URL}/${entityId}/adsets?fields=id,name,status,daily_budget,lifetime_budget&limit=100&access_token=${accessToken}`
      )
      const adsetsData = await adsetsRes.json()

      for (const adset of adsetsData.data || []) {
        const adsRes = await fetch(
          `${META_GRAPH_URL}/${adset.id}/ads?fields=id,name,status,creative{id,thumbnail_url,video_id}&limit=100&access_token=${accessToken}`
        )
        const adsData = await adsRes.json()

        for (const ad of adsData.data || []) {
          adsToInsert.push({
            ad_id: ad.id,
            ad_name: ad.name,
            adset_id: adset.id,
            adset_name: adset.name,
            campaign_id: entityId,
            campaign_name: campaign.name,
            status: ad.status || 'PAUSED',
            adset_status: adset.status || 'PAUSED',
            campaign_status: campaign.status || 'PAUSED',
            campaign_daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
            campaign_lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
            adset_daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
            adset_lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
            creative_id: ad.creative?.id || null,
            thumbnail_url: ad.creative?.thumbnail_url || null,
            video_id: ad.creative?.video_id || null,
          })
        }
      }

    } else if (entityType === 'adset') {
      // Fetch adset (includes campaign_id) → parent campaign → ads in adset
      const adsetRes = await fetch(
        `${META_GRAPH_URL}/${entityId}?fields=name,status,campaign_id,daily_budget,lifetime_budget&access_token=${accessToken}`
      )
      const adset = await adsetRes.json()
      if (adset.error) {
        return NextResponse.json({ error: adset.error.message }, { status: 400 })
      }

      const campaignRes = await fetch(
        `${META_GRAPH_URL}/${adset.campaign_id}?fields=name,status,daily_budget,lifetime_budget&access_token=${accessToken}`
      )
      const campaign = await campaignRes.json()
      if (campaign.error) {
        return NextResponse.json({ error: campaign.error.message }, { status: 400 })
      }

      const adsRes = await fetch(
        `${META_GRAPH_URL}/${entityId}/ads?fields=id,name,status,creative{id,thumbnail_url,video_id}&limit=100&access_token=${accessToken}`
      )
      const adsData = await adsRes.json()

      for (const ad of adsData.data || []) {
        adsToInsert.push({
          ad_id: ad.id,
          ad_name: ad.name,
          adset_id: entityId,
          adset_name: adset.name,
          campaign_id: adset.campaign_id,
          campaign_name: campaign.name,
          status: ad.status || 'PAUSED',
          adset_status: adset.status || 'PAUSED',
          campaign_status: campaign.status || 'PAUSED',
          campaign_daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
          campaign_lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
          adset_daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
          adset_lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
          creative_id: ad.creative?.id || null,
          thumbnail_url: ad.creative?.thumbnail_url || null,
          video_id: ad.creative?.video_id || null,
        })
      }

    } else if (entityType === 'ad') {
      // Fetch ad → parent adset → parent campaign
      const adRes = await fetch(
        `${META_GRAPH_URL}/${entityId}?fields=name,status,adset_id,creative{id,thumbnail_url,video_id}&access_token=${accessToken}`
      )
      const ad = await adRes.json()
      if (ad.error) {
        return NextResponse.json({ error: ad.error.message }, { status: 400 })
      }

      const adsetRes = await fetch(
        `${META_GRAPH_URL}/${ad.adset_id}?fields=name,status,campaign_id,daily_budget,lifetime_budget&access_token=${accessToken}`
      )
      const adset = await adsetRes.json()
      if (adset.error) {
        return NextResponse.json({ error: adset.error.message }, { status: 400 })
      }

      const campaignRes = await fetch(
        `${META_GRAPH_URL}/${adset.campaign_id}?fields=name,status,daily_budget,lifetime_budget&access_token=${accessToken}`
      )
      const campaign = await campaignRes.json()
      if (campaign.error) {
        return NextResponse.json({ error: campaign.error.message }, { status: 400 })
      }

      adsToInsert.push({
        ad_id: entityId,
        ad_name: ad.name,
        adset_id: ad.adset_id,
        adset_name: adset.name,
        campaign_id: adset.campaign_id,
        campaign_name: campaign.name,
        status: ad.status || 'PAUSED',
        adset_status: adset.status || 'PAUSED',
        campaign_status: campaign.status || 'PAUSED',
        campaign_daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
        campaign_lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
        adset_daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
        adset_lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
        creative_id: ad.creative?.id || null,
        thumbnail_url: ad.creative?.thumbnail_url || null,
        video_id: ad.creative?.video_id || null,
      })
    }

    if (adsToInsert.length === 0) {
      return NextResponse.json({ success: true, message: 'No ads to hydrate', inserted: 0 })
    }

    // Build stub rows matching the ad_data schema (same format as sync route lines 983-1031)
    const stubRows = adsToInsert.map(ad => ({
      user_id: userId,
      source: 'meta_api',
      ad_account_id: normalizedAccountId,
      date_start: todayStr,
      date_end: todayStr,
      campaign_name: ad.campaign_name,
      campaign_id: ad.campaign_id,
      adset_name: ad.adset_name,
      adset_id: ad.adset_id,
      ad_name: ad.ad_name,
      ad_id: ad.ad_id,
      status: ad.status,
      adset_status: ad.adset_status,
      campaign_status: ad.campaign_status,
      campaign_daily_budget: ad.campaign_daily_budget,
      campaign_lifetime_budget: ad.campaign_lifetime_budget,
      adset_daily_budget: ad.adset_daily_budget,
      adset_lifetime_budget: ad.adset_lifetime_budget,
      creative_id: ad.creative_id,
      thumbnail_url: ad.thumbnail_url,
      image_url: null,
      video_id: ad.video_id,
      media_hash: null,
      media_type: null,
      impressions: 0,
      clicks: 0,
      spend: 0,
      purchases: 0,
      revenue: 0,
      results: 0,
      result_value: null,
      result_type: null,
      video_views: null,
      video_thruplay: null,
      video_p25: null,
      video_p50: null,
      video_p75: null,
      video_p95: null,
      video_p100: null,
      video_avg_time_watched: null,
      video_plays: null,
      cost_per_thruplay: null,
      outbound_clicks: null,
      inline_link_click_ctr: null,
      cost_per_inline_link_click: null,
      synced_at: new Date().toISOString(),
    }))

    // Delete any existing rows for these ads on today's date (idempotency)
    // Handle both ad_account_id formats (with and without act_ prefix)
    const adIds = adsToInsert.map(a => a.ad_id)
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
      .or(`ad_account_id.eq.${normalizedAccountId},ad_account_id.eq.${cleanAccountId}`)
      .eq('date_start', todayStr)
      .in('ad_id', adIds)

    // Insert stub rows
    const { error: insertError } = await supabase
      .from('ad_data')
      .insert(stubRows)

    if (insertError) {
      console.error('[hydrate-new-entity] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to insert stub rows' }, { status: 500 })
    }

    console.log(`[hydrate-new-entity] Inserted ${stubRows.length} stub rows for ${entityType} ${entityId}`)

    return NextResponse.json({
      success: true,
      inserted: stubRows.length,
    })

  } catch (err) {
    console.error('[hydrate-new-entity] Error:', err)
    return NextResponse.json({ error: 'Failed to hydrate entity' }, { status: 500 })
  }
}
