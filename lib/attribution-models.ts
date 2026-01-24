/**
 * Attribution Models
 *
 * For a single-platform tool (Meta ads only), multi-touch attribution
 * across different ads doesn't provide meaningful insights. The valuable
 * distinction is:
 * - First Touch: Which ad first introduced the customer (prospecting)
 * - Last Touch: Which ad closed the sale (retargeting)
 *
 * Multi-touch models (Linear, Time Decay, Position Based) are designed
 * for cross-channel attribution (Meta vs Google vs TikTok vs Email).
 */

export type AttributionModel = 'first_touch' | 'last_touch'

export interface Touchpoint {
  ad_id: string
  event_time: Date | string
  event_value?: number
}

export interface AttributedConversion {
  ad_id: string
  credit: number  // 1 for single-touch models
  value: number   // Full conversion value
}

/**
 * Apply attribution model to get the credited ad
 */
export function applyAttributionModel(
  touchpoints: Touchpoint[],
  conversionValue: number,
  model: AttributionModel
): AttributedConversion[] {
  if (touchpoints.length === 0) return []

  // Sort touchpoints by time (oldest first)
  const sorted = [...touchpoints].sort((a, b) =>
    new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  )

  switch (model) {
    case 'first_touch':
      return firstTouchAttribution(sorted, conversionValue)
    case 'last_touch':
    default:
      return lastTouchAttribution(sorted, conversionValue)
  }
}

/**
 * First Touch: 100% credit to the first touchpoint
 * Useful for understanding which ads bring in new customers (prospecting)
 */
function firstTouchAttribution(
  touchpoints: Touchpoint[],
  conversionValue: number
): AttributedConversion[] {
  const first = touchpoints[0]
  return [{
    ad_id: first.ad_id,
    credit: 1,
    value: conversionValue
  }]
}

/**
 * Last Touch: 100% credit to the last touchpoint
 * Useful for understanding which ads close sales (retargeting)
 */
function lastTouchAttribution(
  touchpoints: Touchpoint[],
  conversionValue: number
): AttributedConversion[] {
  const last = touchpoints[touchpoints.length - 1]
  return [{
    ad_id: last.ad_id,
    credit: 1,
    value: conversionValue
  }]
}

/**
 * Aggregate attributed conversions by ad_id
 * Used when processing multiple conversions
 */
export function aggregateAttributions(
  attributions: AttributedConversion[]
): Map<string, { credit: number; value: number; conversions: number }> {
  const result = new Map<string, { credit: number; value: number; conversions: number }>()

  for (const attr of attributions) {
    const existing = result.get(attr.ad_id) || { credit: 0, value: 0, conversions: 0 }
    result.set(attr.ad_id, {
      credit: existing.credit + attr.credit,
      value: existing.value + attr.value,
      conversions: existing.conversions + attr.credit
    })
  }

  return result
}

/**
 * Model descriptions for UI
 */
export const ATTRIBUTION_MODEL_INFO: Record<AttributionModel, { label: string; description: string }> = {
  last_touch: {
    label: 'Last Touch',
    description: 'Credit to the last ad clicked before purchase'
  },
  first_touch: {
    label: 'First Touch',
    description: 'Credit to the first ad that introduced the customer'
  }
}
