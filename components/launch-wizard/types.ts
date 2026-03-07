// Shared types for Launch Wizard features

export interface LocationEntry {
  key: string
  name: string       // e.g. "Austin, Texas"
  radius: number     // miles
}

export interface PlacementConfig {
  mode: 'automatic' | 'manual'
  publisherPlatforms: string[]
  facebookPositions: string[]
  instagramPositions: string[]
  messengerPositions: string[]
  audienceNetworkPositions: string[]
}

export type BidStrategy =
  | 'LOWEST_COST_WITHOUT_CAP'
  | 'COST_CAP'
  | 'BID_CAP'
  | 'LOWEST_COST_WITH_MIN_ROAS'

export type AttributionWindow = '7d_click' | '1d_click' | '1d_click_1d_view'

export type Gender = 'all' | 'male' | 'female'

export type BudgetMode = 'daily' | 'lifetime'

export type ConversionLocation = 'instant_form' | 'website' | 'messenger'
