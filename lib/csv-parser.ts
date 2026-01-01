import Papa from 'papaparse'

export type CSVRow = {
  date_start: string
  date_end: string
  ad_name: string
  ad_id?: string | null
  campaign_name: string
  campaign_id?: string | null
  adset_name: string
  adset_id?: string | null
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  // Account ID for multi-account filtering (null for CSV uploads)
  ad_account_id?: string | null
  // Status fields from Meta API (null for CSV uploads)
  status?: string | null
  adset_status?: string | null
  campaign_status?: string | null
  // Budget fields from Meta API (null for CSV uploads)
  campaign_daily_budget?: number | null
  campaign_lifetime_budget?: number | null
  adset_daily_budget?: number | null
  adset_lifetime_budget?: number | null
  // Results-based tracking fields
  results?: number
  result_value?: number | null
  result_type?: string | null
  // Platform marker for Google Ads integration
  _platform?: 'meta' | 'google'
  // Google budget resource name for mutations
  campaign_budget_resource_name?: string | null
  // Internal tracking for Priority Merge attribution
  _ksAttribution?: boolean
  _metaPurchases?: number
  _metaRevenue?: number
  _manualRevenue?: number
  _manualCount?: number
}

const COLUMN_MAP: Record<string, string> = {
  'reporting starts': 'date_start',
  'reporting ends': 'date_end',
  'ad name': 'ad_name',
  'campaign name': 'campaign_name',
  'ad set name': 'adset_name',
  'impressions': 'impressions',
  'link clicks': 'clicks',
  'amount spent (usd)': 'spend',
  'direct website purchases': 'purchases',
  'direct website purchases conversion value': 'revenue',
}

export function parseCSV(text: string): CSVRow[] {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  })

  console.log('Parsed headers:', result.meta.fields)
  console.log('Raw rows:', result.data.length)

  const rows: CSVRow[] = []

  for (const rawRow of result.data as Record<string, string>[]) {
    const row: any = {}

    for (const [header, value] of Object.entries(rawRow)) {
      const mappedKey = COLUMN_MAP[header]
      if (mappedKey && value !== undefined) {
        if (['impressions', 'clicks', 'spend', 'purchases', 'revenue'].includes(mappedKey)) {
          row[mappedKey] = parseFloat(String(value).replace(/[,$]/g, '')) || 0
        } else {
          row[mappedKey] = value
        }
      }
    }

    if (row.campaign_name && row.ad_name) {
      rows.push({
        date_start: row.date_start || '',
        date_end: row.date_end || '',
        ad_name: row.ad_name || '',
        campaign_name: row.campaign_name || '',
        adset_name: row.adset_name || '',
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        spend: row.spend || 0,
        purchases: row.purchases || 0,
        revenue: row.revenue || 0,
      })
    }
  }

  console.log('Parsed rows:', rows.length)
  return rows
}

export function generateSampleCSV(): string {
  const headers = 'Reporting starts,Reporting ends,Ad name,Campaign name,Ad set name,Impressions,Link clicks,Amount spent (USD),Direct website purchases,Direct website purchases conversion value'
  const rows = [
    '2024-01-15,2024-01-21,Video - Summer Vibes,Summer Sale 2024,Lookalike 1%,45000,1100,750,18,3400',
    '2024-01-15,2024-01-21,Carousel - Products,Summer Sale 2024,Lookalike 1%,40000,800,650,10,1800',
    '2024-01-15,2024-01-21,Static - Hero Image,Summer Sale 2024,Interest - Fashion,35000,720,580,8,1400',
  ]
  return [headers, ...rows].join('\n')
}
