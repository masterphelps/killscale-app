import type { AttributionWindow, BidStrategy } from './types'

// Countries list — ISO 3166-1 alpha-2 codes
// Sorted by advertiser popularity (top markets first)
export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'GH', name: 'Ghana' },
  { code: 'RO', name: 'Romania' },
  { code: 'HU', name: 'Hungary' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
]

// Placement options grouped by platform
export const PLACEMENT_PLATFORMS = [
  {
    platform: 'facebook',
    label: 'Facebook',
    positions: [
      { value: 'feed', label: 'Feed' },
      { value: 'story', label: 'Stories' },
      { value: 'facebook_reels', label: 'Reels' },
      { value: 'instream_video', label: 'In-Stream Video' },
    ]
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    positions: [
      { value: 'stream', label: 'Feed' },
      { value: 'story', label: 'Stories' },
      { value: 'reels', label: 'Reels' },
      { value: 'explore', label: 'Explore' },
    ]
  },
  {
    platform: 'messenger',
    label: 'Messenger',
    positions: [
      { value: 'messenger_home', label: 'Inbox' },
      { value: 'story', label: 'Stories' },
    ]
  },
  {
    platform: 'audience_network',
    label: 'Audience Network',
    positions: [
      { value: 'classic', label: 'Native, Banner, Interstitial' },
      { value: 'rewarded_video', label: 'Rewarded Video' },
    ]
  }
]

// Bid strategies with descriptions
export const BID_STRATEGIES: {
  value: BidStrategy
  label: string
  description: string
  hasInput: boolean
  inputLabel?: string
  inputSuffix?: string
  requiresObjective?: string
  requiresEvent?: string
}[] = [
  {
    value: 'LOWEST_COST_WITHOUT_CAP',
    label: 'Lowest Cost',
    description: 'Get the most results at the lowest cost (recommended)',
    hasInput: false,
  },
  {
    value: 'COST_CAP',
    label: 'Cost Cap',
    description: 'Control your average cost per result',
    hasInput: true,
    inputLabel: 'Max cost per result',
    inputSuffix: '',
  },
  {
    value: 'BID_CAP',
    label: 'Bid Cap',
    description: 'Set a maximum bid for each auction',
    hasInput: true,
    inputLabel: 'Max bid per auction',
    inputSuffix: '',
  },
  {
    value: 'LOWEST_COST_WITH_MIN_ROAS',
    label: 'Minimum ROAS',
    description: 'Optimize for a target return on ad spend',
    hasInput: true,
    inputLabel: 'Target ROAS',
    inputSuffix: 'x',
    requiresObjective: 'conversions',
    requiresEvent: 'PURCHASE',
  },
]

// Attribution window specs for Meta API
export const ATTRIBUTION_SPECS: Record<AttributionWindow, { event_type: string; window_days: number }[]> = {
  '7d_click': [
    { event_type: 'CLICK_THROUGH', window_days: 7 },
  ],
  '1d_click': [
    { event_type: 'CLICK_THROUGH', window_days: 1 },
  ],
  '1d_click_1d_view': [
    { event_type: 'CLICK_THROUGH', window_days: 1 },
    { event_type: 'VIEW_THROUGH', window_days: 1 },
  ],
}

export const ATTRIBUTION_OPTIONS: { value: AttributionWindow; label: string }[] = [
  { value: '7d_click', label: '7-day click (default)' },
  { value: '1d_click', label: '1-day click' },
  { value: '1d_click_1d_view', label: '1-day click + 1-day view' },
]
