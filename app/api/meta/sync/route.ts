import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type MetaInsight = {
  campaign_name: string
  adset_name: string
  ad_name: string
  impressions: string
  clicks: string
  spend: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  date_start: string
  date_stop: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, datePreset = 'last_30d' } = await request.json()
    
    if (!userId || !adAccountId) {
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
    
    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }
    
    const accessToken = connection.access_token
    
    // Fetch ad insights from Meta Marketing API
    const fields = [
      'campaign_name',
      'adset_name', 
      'ad_name',
      'impressions',
      'clicks',
      'spend',
      'actions',
      'action_values',
    ].join(',')
    
    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/insights`)
    insightsUrl.searchParams.set('access_token', accessToken)
    insightsUrl.searchParams.set('fields', fields)
    insightsUrl.searchParams.set('level', 'ad')
    insightsUrl.searchParams.set('date_preset', datePreset)
    insightsUrl.searchParams.set('limit', '500')
    
    const response = await fetch(insightsUrl.toString())
    const data = await response.json()
    
    if (data.error) {
      console.error('Meta API error:', data.error)
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }
    
    // Transform Meta data to our format
    const adData = (data.data || []).map((insight: MetaInsight) => {
      // Find purchase actions
      const purchases = insight.actions?.find(a => 
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      const purchaseValue = insight.action_values?.find(a => 
        a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      )
      
      return {
        user_id: userId,
        source: 'meta_api',
        ad_account_id: adAccountId,
        date_start: insight.date_start,
        date_end: insight.date_stop,
        campaign_name: insight.campaign_name,
        adset_name: insight.adset_name,
        ad_name: insight.ad_name,
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        spend: parseFloat(insight.spend) || 0,
        purchases: parseInt(purchases?.value || '0'),
        revenue: parseFloat(purchaseValue?.value || '0'),
        synced_at: new Date().toISOString(),
      }
    })
    
    if (adData.length === 0) {
      return NextResponse.json({ 
        message: 'No ad data found for this period',
        count: 0 
      })
    }
    
    // Delete ALL existing data for this user (CSV and API)
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', userId)
    
    // Insert new data
    const { error: insertError } = await supabase
      .from('ad_data')
      .insert(adData)
    
    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save ad data' }, { status: 500 })
    }
    
    // Update last sync time on connection
    await supabase
      .from('meta_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
    
    return NextResponse.json({ 
      message: 'Sync complete',
      count: adData.length 
    })
    
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
