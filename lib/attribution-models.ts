/**
 * Multi-Touch Attribution Models
 *
 * Each model distributes credit for a conversion across touchpoints differently.
 * A "touchpoint" is an ad click/view that led to a conversion.
 */

export type AttributionModel =
  | 'first_touch'
  | 'last_touch'
  | 'linear'
  | 'time_decay'
  | 'position_based'

export interface Touchpoint {
  ad_id: string
  event_time: Date | string
  event_value?: number
}

export interface AttributedConversion {
  ad_id: string
  credit: number  // Fractional credit (0-1 for single conversion, can sum >1 for multiple)
  value: number   // Attributed value = credit * conversion_value
}

/**
 * Apply attribution model to distribute credit across touchpoints
 */
export function applyAttributionModel(
  touchpoints: Touchpoint[],
  conversionValue: number,
  model: AttributionModel,
  timeDecayHalfLife: number = 7
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
      return lastTouchAttribution(sorted, conversionValue)
    case 'linear':
      return linearAttribution(sorted, conversionValue)
    case 'time_decay':
      return timeDecayAttribution(sorted, conversionValue, timeDecayHalfLife)
    case 'position_based':
      return positionBasedAttribution(sorted, conversionValue)
    default:
      return lastTouchAttribution(sorted, conversionValue)
  }
}

/**
 * First Touch: 100% credit to the first touchpoint
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
 * Linear: Equal credit to all touchpoints
 */
function linearAttribution(
  touchpoints: Touchpoint[],
  conversionValue: number
): AttributedConversion[] {
  const creditPerTouch = 1 / touchpoints.length
  const valuePerTouch = conversionValue / touchpoints.length

  // Aggregate by ad_id (same ad might appear multiple times)
  const byAd = new Map<string, { credit: number; value: number }>()

  for (const tp of touchpoints) {
    const existing = byAd.get(tp.ad_id) || { credit: 0, value: 0 }
    byAd.set(tp.ad_id, {
      credit: existing.credit + creditPerTouch,
      value: existing.value + valuePerTouch
    })
  }

  return Array.from(byAd.entries()).map(([ad_id, { credit, value }]) => ({
    ad_id,
    credit,
    value
  }))
}

/**
 * Time Decay: Exponential decay giving more credit to recent touchpoints
 * Credit = 2^(-days_before_conversion / half_life)
 */
function timeDecayAttribution(
  touchpoints: Touchpoint[],
  conversionValue: number,
  halfLifeDays: number
): AttributedConversion[] {
  // Conversion time is the last touchpoint (or could be passed separately)
  const conversionTime = new Date(touchpoints[touchpoints.length - 1].event_time).getTime()

  // Calculate raw weights
  const weights: { ad_id: string; weight: number }[] = touchpoints.map(tp => {
    const touchTime = new Date(tp.event_time).getTime()
    const daysBefore = (conversionTime - touchTime) / (1000 * 60 * 60 * 24)
    const weight = Math.pow(2, -daysBefore / halfLifeDays)
    return { ad_id: tp.ad_id, weight }
  })

  // Normalize weights to sum to 1
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)

  // Aggregate by ad_id
  const byAd = new Map<string, { credit: number; value: number }>()

  for (const { ad_id, weight } of weights) {
    const normalizedCredit = weight / totalWeight
    const existing = byAd.get(ad_id) || { credit: 0, value: 0 }
    byAd.set(ad_id, {
      credit: existing.credit + normalizedCredit,
      value: existing.value + (normalizedCredit * conversionValue)
    })
  }

  return Array.from(byAd.entries()).map(([ad_id, { credit, value }]) => ({
    ad_id,
    credit,
    value
  }))
}

/**
 * Position Based: 40% to first, 40% to last, 20% split among middle
 */
function positionBasedAttribution(
  touchpoints: Touchpoint[],
  conversionValue: number
): AttributedConversion[] {
  const byAd = new Map<string, { credit: number; value: number }>()

  const addCredit = (ad_id: string, credit: number) => {
    const existing = byAd.get(ad_id) || { credit: 0, value: 0 }
    byAd.set(ad_id, {
      credit: existing.credit + credit,
      value: existing.value + (credit * conversionValue)
    })
  }

  if (touchpoints.length === 1) {
    // Single touchpoint gets 100%
    addCredit(touchpoints[0].ad_id, 1)
  } else if (touchpoints.length === 2) {
    // Two touchpoints: 50/50
    addCredit(touchpoints[0].ad_id, 0.5)
    addCredit(touchpoints[1].ad_id, 0.5)
  } else {
    // 40% first, 40% last, 20% split among middle
    addCredit(touchpoints[0].ad_id, 0.4)
    addCredit(touchpoints[touchpoints.length - 1].ad_id, 0.4)

    const middleCount = touchpoints.length - 2
    const middleCredit = 0.2 / middleCount

    for (let i = 1; i < touchpoints.length - 1; i++) {
      addCredit(touchpoints[i].ad_id, middleCredit)
    }
  }

  return Array.from(byAd.entries()).map(([ad_id, { credit, value }]) => ({
    ad_id,
    credit,
    value
  }))
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
      conversions: existing.conversions + attr.credit // Fractional conversions
    })
  }

  return result
}

/**
 * Model descriptions for UI
 */
export const ATTRIBUTION_MODEL_INFO: Record<AttributionModel, { label: string; description: string }> = {
  first_touch: {
    label: 'First Touch',
    description: '100% credit to the first ad that brought the customer'
  },
  last_touch: {
    label: 'Last Touch',
    description: '100% credit to the last ad before conversion'
  },
  linear: {
    label: 'Linear',
    description: 'Equal credit split across all touchpoints'
  },
  time_decay: {
    label: 'Time Decay',
    description: 'More credit to recent touchpoints, less to older ones'
  },
  position_based: {
    label: 'Position Based',
    description: '40% to first ad, 40% to last ad, 20% split among middle'
  }
}
