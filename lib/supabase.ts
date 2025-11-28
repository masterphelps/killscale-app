import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

// For client components
export const createBrowserClient = () => {
  return createClientComponentClient()
}

// For server components/actions
export const createServerClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Types for our database
export type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  plan: 'free' | 'pro' | 'agency'
  created_at: string
  updated_at: string
}

export type AdAccount = {
  id: string
  user_id: string
  name: string
  meta_account_id: string | null
  is_connected: boolean
  created_at: string
  updated_at: string
}

export type Rules = {
  id: string
  ad_account_id: string
  scale_roas: number
  min_roas: number
  learning_spend: number
  created_at: string
  updated_at: string
}

export type AdData = {
  id: string
  ad_account_id: string
  upload_id: string | null
  date_start: string
  date_end: string
  campaign_name: string
  adset_name: string
  ad_name: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  cpc: number
  cpm: number
  ctr: number
}

export type CampaignRollup = {
  ad_account_id: string
  date_start: string
  date_end: string
  campaign_name: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  adset_count: number
  ad_count: number
}

export type AdsetRollup = {
  ad_account_id: string
  date_start: string
  date_end: string
  campaign_name: string
  adset_name: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  ad_count: number
}

export type AccountTotal = {
  ad_account_id: string
  date_start: string
  date_end: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  cpa: number
  campaign_count: number
}

// Verdict calculation
export type Verdict = 'scale' | 'watch' | 'cut' | 'learn'

export function calculateVerdict(
  spend: number,
  roas: number,
  rules: Rules
): Verdict {
  if (spend < rules.learning_spend) return 'learn'
  if (roas >= rules.scale_roas) return 'scale'
  if (roas >= rules.min_roas) return 'watch'
  return 'cut'
}

export function getVerdictDisplay(verdict: Verdict): { label: string; icon: string } {
  switch (verdict) {
    case 'scale': return { label: 'Scale', icon: '↑' }
    case 'watch': return { label: 'Watch', icon: '●' }
    case 'cut': return { label: 'Cut', icon: '↓' }
    case 'learn': return { label: 'Learn', icon: '○' }
  }
}
