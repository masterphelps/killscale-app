import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// New focused alert types - only at budget level
type AlertType = 'money_bleeding' | 'below_breakeven' | 'scale_candidate'
type Priority = 'high' | 'medium' | 'low'

type Alert = {
  user_id: string
  ad_account_id?: string
  type: AlertType
  priority: Priority
  title: string
  message: string
  entity_type: 'campaign' | 'adset'
  entity_id: string
  entity_name: string
  data?: Record<string, any>
}

type AlertSettings = {
  enabled: boolean
  threshold: number | null
}

// Default settings - only 3 types now
const DEFAULT_SETTINGS: Record<AlertType, AlertSettings> = {
  money_bleeding: { enabled: true, threshold: 50 },
  below_breakeven: { enabled: true, threshold: null },
  scale_candidate: { enabled: true, threshold: null },
}

// Map legacy alert types to new ones for settings lookup
const LEGACY_TYPE_MAP: Record<string, AlertType> = {
  'high_spend_no_conv': 'money_bleeding',
  'roas_below_min': 'below_breakeven',
  'roas_above_scale': 'scale_candidate',
}

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }

    // Get user's alert settings for this account
    let settingsQuery = supabase
      .from('alert_settings')
      .select('alert_type, enabled, threshold')
      .eq('user_id', userId)

    if (adAccountId) {
      settingsQuery = settingsQuery.eq('ad_account_id', adAccountId)
    } else {
      settingsQuery = settingsQuery.is('ad_account_id', null)
    }

    const { data: userSettings } = await settingsQuery

    // Merge with defaults (handle both new and legacy type names)
    const settings: Record<AlertType, AlertSettings> = { ...DEFAULT_SETTINGS }
    userSettings?.forEach(s => {
      const alertType = s.alert_type as string
      // Check if it's a new type or legacy type
      const mappedType = LEGACY_TYPE_MAP[alertType] || alertType as AlertType
      if (settings[mappedType]) {
        settings[mappedType] = {
          enabled: s.enabled,
          threshold: s.threshold ?? DEFAULT_SETTINGS[mappedType]?.threshold ?? null,
        }
      }
    })

    // Get user's rules for this account
    let rulesQuery = supabase
      .from('rules')
      .select('*')
      .eq('user_id', userId)

    if (adAccountId) {
      rulesQuery = rulesQuery.eq('ad_account_id', adAccountId)
    } else {
      rulesQuery = rulesQuery.is('ad_account_id', null)
    }

    const { data: rules } = await rulesQuery.single()

    const scaleRoas = rules?.scale_roas || 3.0
    const minRoas = rules?.min_roas || 1.5
    const learningSpend = rules?.learning_spend || 100

    // Get recent ad data for this account
    let adDataQuery = supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', userId)

    if (adAccountId) {
      adDataQuery = adDataQuery.eq('ad_account_id', adAccountId)
    }

    const { data: adData } = await adDataQuery

    if (!adData || adData.length === 0) {
      return NextResponse.json({ message: 'No data to analyze', alerts: 0 })
    }

    // Aggregate by campaign with budget detection for CBO/ABO
    const campaigns: Record<string, {
      id: string
      name: string
      spend: number
      revenue: number
      purchases: number
      roas: number
      status: string
      isCBO: boolean // true if campaign has budget (CBO), false if adsets have budget (ABO)
      dailyBudget: number | null
      lifetimeBudget: number | null
    }> = {}

    const adsets: Record<string, {
      id: string
      name: string
      campaign_id: string
      campaign_name: string
      spend: number
      revenue: number
      purchases: number
      roas: number
      status: string
      dailyBudget: number | null
      lifetimeBudget: number | null
    }> = {}

    adData.forEach(row => {
      const spend = parseFloat(row.spend) || 0
      const revenue = parseFloat(row.revenue) || 0
      const purchases = row.purchases || 0

      // Campaign aggregation with budget detection
      if (!campaigns[row.campaign_name]) {
        const campaignDailyBudget = parseFloat(row.campaign_daily_budget) || null
        const campaignLifetimeBudget = parseFloat(row.campaign_lifetime_budget) || null
        // CBO if campaign has any budget set
        const isCBO = !!(campaignDailyBudget || campaignLifetimeBudget)

        campaigns[row.campaign_name] = {
          id: row.campaign_id,
          name: row.campaign_name,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.campaign_status || 'ACTIVE',
          isCBO,
          dailyBudget: campaignDailyBudget,
          lifetimeBudget: campaignLifetimeBudget,
        }
      }
      campaigns[row.campaign_name].spend += spend
      campaigns[row.campaign_name].revenue += revenue
      campaigns[row.campaign_name].purchases += purchases

      // AdSet aggregation with budget info
      const adsetKey = `${row.campaign_name}|${row.adset_name}`
      if (!adsets[adsetKey]) {
        adsets[adsetKey] = {
          id: row.adset_id,
          name: row.adset_name,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.adset_status || 'ACTIVE',
          dailyBudget: parseFloat(row.adset_daily_budget) || null,
          lifetimeBudget: parseFloat(row.adset_lifetime_budget) || null,
        }
      }
      adsets[adsetKey].spend += spend
      adsets[adsetKey].revenue += revenue
      adsets[adsetKey].purchases += purchases
    })

    // Calculate ROAS for all entities
    Object.values(campaigns).forEach(c => {
      c.roas = c.spend > 0 ? c.revenue / c.spend : 0
    })
    Object.values(adsets).forEach(a => {
      a.roas = a.spend > 0 ? a.revenue / a.spend : 0
    })

    const newAlerts: Alert[] = []

    // Helper to create alert with account ID
    const createAlert = (alert: Omit<Alert, 'ad_account_id'>): Alert => ({
      ...alert,
      ad_account_id: adAccountId || undefined,
    })

    // Get threshold for money bleeding alerts
    const moneyBleedingThreshold = settings.money_bleeding.threshold || 50

    // ===========================================
    // SMART CBO/ABO ALERT GENERATION
    // Alerts only fire at the level where budget lives
    // ===========================================

    // Process each campaign
    Object.values(campaigns).forEach(campaign => {
      if (campaign.status !== 'ACTIVE') return

      if (campaign.isCBO) {
        // CBO: Generate alerts at CAMPAIGN level only

        // Money Bleeding: High spend, zero conversions
        if (settings.money_bleeding.enabled) {
          if (campaign.spend >= moneyBleedingThreshold && campaign.purchases === 0) {
            newAlerts.push(createAlert({
              user_id: userId,
              type: 'money_bleeding',
              priority: 'high',
              title: 'Money bleeding',
              message: `"${campaign.name}" has spent $${campaign.spend.toFixed(2)} with zero purchases. Consider pausing.`,
              entity_type: 'campaign',
              entity_id: campaign.id,
              entity_name: campaign.name,
              data: {
                spend: campaign.spend,
                purchases: 0,
                budget_type: 'CBO',
              }
            }))
          }
        }

        // Below Breakeven: Has conversions but ROAS below minimum
        if (settings.below_breakeven.enabled) {
          if (campaign.spend >= learningSpend && campaign.roas > 0 && campaign.roas < minRoas) {
            newAlerts.push(createAlert({
              user_id: userId,
              type: 'below_breakeven',
              priority: 'medium',
              title: 'Below breakeven',
              message: `"${campaign.name}" has ${campaign.roas.toFixed(2)}x ROAS (below your ${minRoas}x minimum).`,
              entity_type: 'campaign',
              entity_id: campaign.id,
              entity_name: campaign.name,
              data: {
                roas: campaign.roas,
                minRoas,
                spend: campaign.spend,
                budget_type: 'CBO',
              }
            }))
          }
        }

        // Scale Candidate: ROAS above scale threshold
        if (settings.scale_candidate.enabled) {
          if (campaign.spend >= learningSpend && campaign.roas >= scaleRoas) {
            newAlerts.push(createAlert({
              user_id: userId,
              type: 'scale_candidate',
              priority: 'low',
              title: 'Scale candidate',
              message: `"${campaign.name}" is performing at ${campaign.roas.toFixed(2)}x ROAS. Consider increasing budget.`,
              entity_type: 'campaign',
              entity_id: campaign.id,
              entity_name: campaign.name,
              data: {
                roas: campaign.roas,
                scaleRoas,
                spend: campaign.spend,
                revenue: campaign.revenue,
                budget_type: 'CBO',
              }
            }))
          }
        }
      }
    })

    // For ABO campaigns, check adsets
    Object.values(adsets).forEach(adset => {
      if (adset.status !== 'ACTIVE') return

      // Check if parent campaign is ABO (not CBO)
      const parentCampaign = campaigns[adset.campaign_name]
      if (!parentCampaign || parentCampaign.isCBO) return // Skip if CBO - already handled at campaign level

      // ABO: Generate alerts at ADSET level only

      // Money Bleeding: High spend, zero conversions
      if (settings.money_bleeding.enabled) {
        if (adset.spend >= moneyBleedingThreshold && adset.purchases === 0) {
          newAlerts.push(createAlert({
            user_id: userId,
            type: 'money_bleeding',
            priority: 'high',
            title: 'Money bleeding',
            message: `"${adset.name}" has spent $${adset.spend.toFixed(2)} with zero purchases. Consider pausing.`,
            entity_type: 'adset',
            entity_id: adset.id,
            entity_name: adset.name,
            data: {
              spend: adset.spend,
              purchases: 0,
              campaign_name: adset.campaign_name,
              budget_type: 'ABO',
            }
          }))
        }
      }

      // Below Breakeven: Has conversions but ROAS below minimum
      if (settings.below_breakeven.enabled) {
        if (adset.spend >= learningSpend && adset.roas > 0 && adset.roas < minRoas) {
          newAlerts.push(createAlert({
            user_id: userId,
            type: 'below_breakeven',
            priority: 'medium',
            title: 'Below breakeven',
            message: `"${adset.name}" has ${adset.roas.toFixed(2)}x ROAS (below your ${minRoas}x minimum).`,
            entity_type: 'adset',
            entity_id: adset.id,
            entity_name: adset.name,
            data: {
              roas: adset.roas,
              minRoas,
              spend: adset.spend,
              campaign_name: adset.campaign_name,
              budget_type: 'ABO',
            }
          }))
        }
      }

      // Scale Candidate: ROAS above scale threshold
      if (settings.scale_candidate.enabled) {
        if (adset.spend >= learningSpend && adset.roas >= scaleRoas) {
          newAlerts.push(createAlert({
            user_id: userId,
            type: 'scale_candidate',
            priority: 'low',
            title: 'Scale candidate',
            message: `"${adset.name}" is performing at ${adset.roas.toFixed(2)}x ROAS. Consider increasing budget.`,
            entity_type: 'adset',
            entity_id: adset.id,
            entity_name: adset.name,
            data: {
              roas: adset.roas,
              scaleRoas,
              spend: adset.spend,
              revenue: adset.revenue,
              campaign_name: adset.campaign_name,
              budget_type: 'ABO',
            }
          }))
        }
      }
    })

    if (newAlerts.length === 0) {
      return NextResponse.json({ message: 'No new alerts', alerts: 0 })
    }

    // Check for duplicate alerts (same type + entity within last 24 hours)
    // Also check legacy type names for deduplication
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    let recentAlertsQuery = supabase
      .from('alerts')
      .select('type, entity_id')
      .eq('user_id', userId)
      .gte('created_at', twentyFourHoursAgo)

    if (adAccountId) {
      recentAlertsQuery = recentAlertsQuery.eq('ad_account_id', adAccountId)
    } else {
      recentAlertsQuery = recentAlertsQuery.is('ad_account_id', null)
    }

    const { data: recentAlerts } = await recentAlertsQuery

    // Build set of recent alert keys (normalize legacy types)
    const recentAlertKeys = new Set<string>()
    recentAlerts?.forEach(a => {
      const normalizedType = LEGACY_TYPE_MAP[a.type] || a.type
      recentAlertKeys.add(`${normalizedType}|${a.entity_id}`)
      // Also add the original type to catch exact matches
      recentAlertKeys.add(`${a.type}|${a.entity_id}`)
    })

    // Filter out duplicates
    const uniqueAlerts = newAlerts.filter(alert => {
      const key = `${alert.type}|${alert.entity_id}`
      return !recentAlertKeys.has(key)
    })

    if (uniqueAlerts.length === 0) {
      return NextResponse.json({ message: 'All alerts already sent recently', alerts: 0 })
    }

    // Insert new alerts
    const { data: insertedAlerts, error: insertError } = await supabase
      .from('alerts')
      .insert(uniqueAlerts)
      .select()

    if (insertError) {
      console.error('Error inserting alerts:', insertError)
      return NextResponse.json({ error: 'Failed to create alerts' }, { status: 500 })
    }

    // Send email notification for high priority alerts
    const highPriorityAlerts = insertedAlerts?.filter(a => a.priority === 'high' || a.priority === 'medium') || []

    if (highPriorityAlerts.length > 0) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'
        await fetch(`${baseUrl}/api/alerts/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            alerts: highPriorityAlerts,
          }),
        })
      } catch (emailError) {
        // Log but don't fail the request if email fails
        console.error('Failed to send alert email:', emailError)
      }
    }

    return NextResponse.json({
      message: `Created ${uniqueAlerts.length} new alerts`,
      alerts: uniqueAlerts.length,
      emailSent: highPriorityAlerts.length > 0
    })

  } catch (err) {
    console.error('Alert generation error:', err)
    return NextResponse.json({ error: 'Failed to generate alerts' }, { status: 500 })
  }
}
