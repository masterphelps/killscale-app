/**
 * Google Ads - gclid (Google Click ID) Utilities
 *
 * gclid is Google's click identifier, similar to Meta's fbclid.
 * It's passed in the URL when a user clicks a Google ad.
 *
 * @see https://support.google.com/google-ads/answer/9744275
 */

import { FEATURES } from '@/lib/feature-flags'

export interface GclidData {
  gclid: string
  clickTime: string
  landingPage: string
}

/**
 * Extract gclid from URL parameters
 */
export function extractGclid(url: string): string | null {
  if (!FEATURES.GOOGLE_ADS_INTEGRATION) return null

  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('gclid')
  } catch {
    return null
  }
}

/**
 * Validate gclid format
 * gclid is typically a base64-encoded string
 */
export function isValidGclid(gclid: string): boolean {
  if (!gclid || typeof gclid !== 'string') return false
  // gclid is usually 50-100 characters, alphanumeric with some special chars
  return gclid.length >= 30 && gclid.length <= 200
}

/**
 * Format gclid data for storage
 */
export function formatGclidForStorage(
  gclid: string,
  landingPage: string
): GclidData | null {
  if (!isValidGclid(gclid)) return null

  return {
    gclid,
    clickTime: new Date().toISOString(),
    landingPage,
  }
}
