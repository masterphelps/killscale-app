/**
 * Unified Ad Data Types
 *
 * Platform-agnostic types for displaying Meta and Google ad data together.
 * Used when viewing workspaces with accounts from both platforms.
 */

// Platform-agnostic row for unified display
export interface UnifiedAdRow {
  platform: 'meta' | 'google'
  accountId: string
  dateStart: string
  dateEnd: string

  // Campaign (Level 1)
  campaignName: string
  campaignId: string
  campaignStatus: string | null
  campaignType: string | null // For Google: SEARCH, DISPLAY, VIDEO, PERFORMANCE_MAX, etc.

  // Level 2 (Ad Set / Ad Group / Asset Group)
  level2Name: string
  level2Id: string
  level2Status: string | null
  level2Type: 'adset' | 'ad_group' | 'asset_group'
  level2Label: string // Display label: "Ad Set", "Ad Group", or "Asset Group"

  // Level 3 (Ad) - may be null for PMax Asset Groups
  adName: string | null
  adId: string | null
  adStatus: string | null
  hasAds: boolean // false for PMax Asset Groups

  // Metrics (available at all levels)
  impressions: number
  clicks: number
  spend: number
  results: number
  resultValue: number | null
  roas: number

  // Budget info
  campaignBudget: number | null
  level2Budget: number | null // Only Meta has ad set budgets
  budgetType: 'CBO' | 'ABO' | null // Google is always CBO
}

// Meta ad data row (from ad_data table)
export interface MetaAdRow {
  id: string
  ad_account_id: string
  date_start: string
  date_end: string
  campaign_name: string
  campaign_id: string
  campaign_status: string | null
  adset_name: string
  adset_id: string
  adset_status: string | null
  ad_name: string
  ad_id: string
  status: string | null
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  results?: number
  result_value?: number | null
  result_type?: string | null
  campaign_daily_budget?: number | null
  campaign_lifetime_budget?: number | null
  adset_daily_budget?: number | null
  adset_lifetime_budget?: number | null
}

// Google ad data row (from google_ad_data table)
export interface GoogleAdRow {
  id: string
  user_id: string
  customer_id: string
  date_start: string
  date_end: string
  campaign_name: string
  campaign_id: string
  campaign_status: string | null
  campaign_type: string | null
  campaign_budget: number | null
  ad_group_name: string
  ad_group_id: string
  ad_group_status: string | null
  ad_group_type: string | null
  ad_name: string
  ad_id: string
  ad_status: string | null
  ad_type: string | null
  impressions: number
  clicks: number
  spend: number
  conversions: number
  conversions_value: number
  results: number
  result_value: number | null
  result_type: string | null
  roas: number
}

/**
 * Transform Meta ad data row to unified format
 */
export function metaToUnified(row: MetaAdRow): UnifiedAdRow {
  const hasCampaignBudget = !!(row.campaign_daily_budget || row.campaign_lifetime_budget)
  const hasAdsetBudget = !!(row.adset_daily_budget || row.adset_lifetime_budget)

  return {
    platform: 'meta',
    accountId: row.ad_account_id,
    dateStart: row.date_start,
    dateEnd: row.date_end,

    campaignName: row.campaign_name,
    campaignId: row.campaign_id,
    campaignStatus: row.campaign_status,
    campaignType: null, // Meta doesn't have campaign types like Google

    level2Name: row.adset_name,
    level2Id: row.adset_id,
    level2Status: row.adset_status,
    level2Type: 'adset',
    level2Label: 'Ad Set',

    adName: row.ad_name,
    adId: row.ad_id,
    adStatus: row.status,
    hasAds: true,

    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    results: row.results ?? row.purchases,
    resultValue: row.result_value ?? row.revenue,
    roas: row.roas,

    campaignBudget: row.campaign_daily_budget || row.campaign_lifetime_budget || null,
    level2Budget: row.adset_daily_budget || row.adset_lifetime_budget || null,
    budgetType: hasCampaignBudget ? 'CBO' : hasAdsetBudget ? 'ABO' : null,
  }
}

/**
 * Transform Google ad data row to unified format
 */
export function googleToUnified(row: GoogleAdRow): UnifiedAdRow {
  const isPMax = row.campaign_type === 'PERFORMANCE_MAX'

  return {
    platform: 'google',
    accountId: row.customer_id,
    dateStart: row.date_start,
    dateEnd: row.date_end,

    campaignName: row.campaign_name,
    campaignId: row.campaign_id,
    campaignStatus: row.campaign_status,
    campaignType: row.campaign_type,

    level2Name: row.ad_group_name,
    level2Id: row.ad_group_id,
    level2Status: row.ad_group_status,
    level2Type: isPMax ? 'asset_group' : 'ad_group',
    level2Label: isPMax ? 'Asset Group' : 'Ad Group',

    adName: isPMax ? null : row.ad_name,
    adId: isPMax ? null : row.ad_id,
    adStatus: isPMax ? null : row.ad_status,
    hasAds: !isPMax,

    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    results: row.results,
    resultValue: row.result_value,
    roas: row.roas,

    campaignBudget: row.campaign_budget,
    level2Budget: null, // Google doesn't have ad group budgets
    budgetType: 'CBO', // Google is always CBO
  }
}

/**
 * Get the display label for Level 2 based on the row
 */
export function getLevel2Label(row: UnifiedAdRow): string {
  return row.level2Label
}

/**
 * Check if the row is from a Performance Max campaign (no individual ads)
 */
export function isPerformanceMax(row: UnifiedAdRow): boolean {
  return row.platform === 'google' && row.campaignType === 'PERFORMANCE_MAX'
}
