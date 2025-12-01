import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AlertType = 'high_spend_no_conv' | 'roas_below_min' | 'roas_above_scale' | 'status_changed' | 'ad_fatigue'
type Priority = 'high' | 'medium' | 'low'

type Alert = {
  user_id: string
  type: AlertType
  priority: Priority
  title: string
  message: string
  entity_type?: 'campaign' | 'adset' | 'ad'
  entity_id?: string
  entity_name?: string
  data?: Record<string, any>
}

type AlertSettings = {
  enabled: boolean
  threshold: number | null
}

// Default settings
const DEFAULT_SETTINGS: Record<AlertType, AlertSettings> = {
  high_spend_no_conv: { enabled: true, threshold: 50 },
  roas_below_min: { enabled: true, threshold: null },
  roas_above_scale: { enabled: true, threshold: null },
  status_changed: { enabled: false, threshold: null },
  ad_fatigue: { enabled: false, threshold: 3 },
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }
    
    // Get user's alert settings
    const { data: userSettings } = await supabase
      .from('alert_settings')
      .select('alert_type, enabled, threshold')
      .eq('user_id', userId)
    
    // Merge with defaults
    const settings: Record<AlertType, AlertSettings> = { ...DEFAULT_SETTINGS }
    userSettings?.forEach(s => {
      if (settings[s.alert_type as AlertType]) {
        settings[s.alert_type as AlertType] = {
          enabled: s.enabled,
          threshold: s.threshold ?? DEFAULT_SETTINGS[s.alert_type as AlertType].threshold,
        }
      }
    })
    
    // Get user's rules
    const { data: rules } = await supabase
      .from('rules')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    const scaleRoas = rules?.scale_roas || 3.0
    const minRoas = rules?.min_roas || 1.5
    const learningSpend = rules?.learning_spend || 100
    
    // Get recent ad data (last 24 hours worth, or all current data)
    const { data: adData } = await supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', userId)
    
    if (!adData || adData.length === 0) {
      return NextResponse.json({ message: 'No data to analyze', alerts: 0 })
    }
    
    // Aggregate by campaign, adset, and ad
    const campaigns: Record<string, {
      id: string
      name: string
      spend: number
      revenue: number
      purchases: number
      roas: number
      status: string
    }> = {}
    
    const adsets: Record<string, {
      id: string
      name: string
      campaign_name: string
      spend: number
      revenue: number
      purchases: number
      roas: number
      status: string
    }> = {}
    
    const ads: Record<string, {
      id: string
      name: string
      adset_name: string
      campaign_name: string
      spend: number
      revenue: number
      purchases: number
      roas: number
      status: string
    }> = {}
    
    adData.forEach(row => {
      const spend = parseFloat(row.spend) || 0
      const revenue = parseFloat(row.revenue) || 0
      const purchases = row.purchases || 0
      
      // Campaign aggregation
      if (!campaigns[row.campaign_name]) {
        campaigns[row.campaign_name] = {
          id: row.campaign_id,
          name: row.campaign_name,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.campaign_status || 'ACTIVE'
        }
      }
      campaigns[row.campaign_name].spend += spend
      campaigns[row.campaign_name].revenue += revenue
      campaigns[row.campaign_name].purchases += purchases
      
      // AdSet aggregation
      const adsetKey = `${row.campaign_name}|${row.adset_name}`
      if (!adsets[adsetKey]) {
        adsets[adsetKey] = {
          id: row.adset_id,
          name: row.adset_name,
          campaign_name: row.campaign_name,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.adset_status || 'ACTIVE'
        }
      }
      adsets[adsetKey].spend += spend
      adsets[adsetKey].revenue += revenue
      adsets[adsetKey].purchases += purchases
      
      // Ad aggregation
      const adKey = `${row.campaign_name}|${row.adset_name}|${row.ad_name}`
      if (!ads[adKey]) {
        ads[adKey] = {
          id: row.ad_id,
          name: row.ad_name,
          adset_name: row.adset_name,
          campaign_name: row.campaign_name,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.status || 'ACTIVE'
        }
      }
      ads[adKey].spend += spend
      ads[adKey].revenue += revenue
      ads[adKey].purchases += purchases
    })
    
    // Calculate ROAS for all entities
    Object.values(campaigns).forEach(c => {
      c.roas = c.spend > 0 ? c.revenue / c.spend : 0
    })
    Object.values(adsets).forEach(a => {
      a.roas = a.spend > 0 ? a.revenue / a.spend : 0
    })
    Object.values(ads).forEach(a => {
      a.roas = a.spend > 0 ? a.revenue / a.spend : 0
    })
    
    const newAlerts: Alert[] = []
    
    // Get threshold for high spend no conversions
    const highSpendThreshold = settings.high_spend_no_conv.threshold || 50
    
    // Check for HIGH SPEND NO CONVERSIONS (campaigns and adsets with threshold+ spend, 0 purchases)
    if (settings.high_spend_no_conv.enabled) {
      Object.values(campaigns).forEach(campaign => {
        if (campaign.spend >= highSpendThreshold && campaign.purchases === 0 && campaign.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'high_spend_no_conv',
            priority: 'high',
            title: 'High spend with no conversions',
            message: `"${campaign.name}" has spent $${campaign.spend.toFixed(2)} with zero purchases.`,
            entity_type: 'campaign',
            entity_id: campaign.id,
            entity_name: campaign.name,
            data: { spend: campaign.spend, purchases: 0 }
          })
        }
      })
      
      Object.values(adsets).forEach(adset => {
        if (adset.spend >= highSpendThreshold && adset.purchases === 0 && adset.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'high_spend_no_conv',
            priority: 'high',
            title: 'Ad set burning money',
            message: `"${adset.name}" has spent $${adset.spend.toFixed(2)} with zero purchases.`,
            entity_type: 'adset',
            entity_id: adset.id,
            entity_name: adset.name,
            data: { spend: adset.spend, purchases: 0, campaign: adset.campaign_name }
          })
        }
      })
    }
    
    // Check for ROAS BELOW MIN (with significant spend)
    if (settings.roas_below_min.enabled) {
      Object.values(campaigns).forEach(campaign => {
        if (campaign.spend >= learningSpend && campaign.roas > 0 && campaign.roas < minRoas && campaign.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'roas_below_min',
            priority: 'medium',
            title: 'ROAS below threshold',
            message: `"${campaign.name}" has ${campaign.roas.toFixed(2)}x ROAS (below your ${minRoas}x minimum).`,
            entity_type: 'campaign',
            entity_id: campaign.id,
            entity_name: campaign.name,
            data: { roas: campaign.roas, minRoas, spend: campaign.spend }
          })
        }
      })
      
      Object.values(adsets).forEach(adset => {
        if (adset.spend >= learningSpend && adset.roas > 0 && adset.roas < minRoas && adset.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'roas_below_min',
            priority: 'medium',
            title: 'Ad set underperforming',
            message: `"${adset.name}" has ${adset.roas.toFixed(2)}x ROAS (below your ${minRoas}x minimum).`,
            entity_type: 'adset',
            entity_id: adset.id,
            entity_name: adset.name,
            data: { roas: adset.roas, minRoas, spend: adset.spend, campaign: adset.campaign_name }
          })
        }
      })
    }
    
    // Check for ROAS ABOVE SCALE (opportunities!)
    if (settings.roas_above_scale.enabled) {
      Object.values(campaigns).forEach(campaign => {
        if (campaign.spend >= learningSpend && campaign.roas >= scaleRoas && campaign.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'roas_above_scale',
            priority: 'low',
            title: '🚀 Scaling opportunity',
            message: `"${campaign.name}" is crushing it with ${campaign.roas.toFixed(2)}x ROAS! Consider increasing budget.`,
            entity_type: 'campaign',
            entity_id: campaign.id,
            entity_name: campaign.name,
            data: { roas: campaign.roas, scaleRoas, spend: campaign.spend, revenue: campaign.revenue }
          })
        }
      })
      
      Object.values(ads).forEach(ad => {
        if (ad.spend >= learningSpend / 2 && ad.roas >= scaleRoas && ad.status === 'ACTIVE') {
          newAlerts.push({
            user_id: userId,
            type: 'roas_above_scale',
            priority: 'low',
            title: '🔥 Winning ad found',
            message: `"${ad.name}" has ${ad.roas.toFixed(2)}x ROAS. This ad is a winner!`,
            entity_type: 'ad',
            entity_id: ad.id,
            entity_name: ad.name,
            data: { roas: ad.roas, scaleRoas, spend: ad.spend, revenue: ad.revenue, adset: ad.adset_name }
          })
        }
      })
    }
    
    if (newAlerts.length === 0) {
      return NextResponse.json({ message: 'No new alerts', alerts: 0 })
    }
    
    // Check for duplicate alerts (same type + entity within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const { data: recentAlerts } = await supabase
      .from('alerts')
      .select('type, entity_id')
      .eq('user_id', userId)
      .gte('created_at', twentyFourHoursAgo)
    
    const recentAlertKeys = new Set(
      recentAlerts?.map(a => `${a.type}|${a.entity_id}`) || []
    )
    
    // Filter out duplicates
    const uniqueAlerts = newAlerts.filter(alert => {
      const key = `${alert.type}|${alert.entity_id}`
      return !recentAlertKeys.has(key)
    })
    
    if (uniqueAlerts.length === 0) {
      return NextResponse.json({ message: 'All alerts already sent recently', alerts: 0 })
    }
    
    // Insert new alerts
    const { error: insertError } = await supabase
      .from('alerts')
      .insert(uniqueAlerts)
    
    if (insertError) {
      console.error('Error inserting alerts:', insertError)
      return NextResponse.json({ error: 'Failed to create alerts' }, { status: 500 })
    }
    
    return NextResponse.json({ 
      message: `Created ${uniqueAlerts.length} new alerts`,
      alerts: uniqueAlerts.length
    })
    
  } catch (err) {
    console.error('Alert generation error:', err)
    return NextResponse.json({ error: 'Failed to generate alerts' }, { status: 500 })
  }
}
