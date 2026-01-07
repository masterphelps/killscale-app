// Database record types
export interface UpPromoteConnection {
  id: string
  workspace_id: string
  user_id: string
  api_key: string
  shop_domain: string | null
  last_sync_at: string | null
  sync_status: 'pending' | 'syncing' | 'success' | 'error'
  sync_error: string | null
  created_at: string
  updated_at: string
}

export interface UpPromoteReferral {
  id: string
  workspace_id: string
  user_id: string
  uppromote_referral_id: string
  order_id: string | null
  order_number: string | null
  total_sales: number
  commission: number
  currency: string
  status: 'pending' | 'approved' | 'declined' | 'paid'
  affiliate_id: string | null
  affiliate_name: string | null
  affiliate_email: string | null
  tracking_type: string | null
  coupon_code: string | null
  referral_created_at: string
  approved_at: string | null
  paid_at: string | null
  synced_at: string
}

// UpPromote API response types
export interface UpPromoteApiReferral {
  id: string | number
  order_id: string | number | null
  order_number: string | null
  total_sales: number | string
  commission: number | string
  currency?: string
  status: string
  affiliate: {
    id: string | number
    name?: string
    email?: string
  } | null
  tracking_type?: string
  coupon_code?: string
  created_at: string
  approved_at?: string | null
  paid_at?: string | null
}

export interface UpPromoteApiResponse {
  success: boolean
  data: UpPromoteApiReferral[]
  pagination?: {
    current_page: number
    total_pages: number
    total_count: number
    per_page: number
  }
  error?: string
}

// Attribution types for dashboard
export type UpPromoteAttributionData = Record<string, {
  commission: number
  referrals: number
  total_sales: number
}>

export interface UpPromoteTotals {
  total_commission: number
  total_referrals: number
  attributed_commission: number
  attributed_referrals: number
  unattributed_commission: number
  unattributed_referrals: number
  match_rate: number
}

// Connection status for UI
export interface UpPromoteConnectionStatus {
  connected: boolean
  shop_domain?: string
  last_sync_at?: string
  referral_count?: number
  total_commission?: number
  sync_status?: 'pending' | 'syncing' | 'success' | 'error'
  sync_error?: string
}
