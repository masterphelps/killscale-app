/**
 * Feature Flags
 *
 * Use these to safely ship new features behind flags.
 * Features can be enabled via environment variables.
 *
 * Usage:
 *   import { FEATURES } from '@/lib/feature-flags'
 *   if (FEATURES.GOOGLE_ADS_INTEGRATION) { ... }
 *
 * To enable a feature:
 *   - Development: Add to .env.local
 *   - Production: Add to Vercel environment variables
 */

export const FEATURES = {
  /**
   * Google Ads Integration
   * - Captures gclid from URL parameters
   * - Stores in pixel_events for attribution
   * - Sends offline conversions to Google Ads API
   */
  GOOGLE_ADS_INTEGRATION: process.env.NEXT_PUBLIC_FF_GOOGLE_ADS === 'true',
  /**
   * Shopify Integration
   * - First-party tracking pixel for Shopify stores
   * - Attribution independent of Meta's pixel
   * - Server-side event tracking
   */
  SHOPIFY: process.env.NEXT_PUBLIC_FF_SHOPIFY === 'true',
  /**
   * Uppromote Integration
   * - Connect and sync UpPromote affiliate data
   * - True ROAS calculation (Revenue ÷ Total Costs)
   * - Always enabled (Scale+ tier check happens at runtime)
   */
  UPPROMOTE: true,
} as const

/**
 * Helper to check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature]
}
