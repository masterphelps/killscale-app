import { createHash } from 'crypto'
import { META_GRAPH_URL } from '@/lib/meta-api'

// KillScale snake_case → Meta PascalCase event name mapping
const EVENT_NAME_MAP: Record<string, string> = {
  purchase: 'Purchase',
  complete_registration: 'CompleteRegistration',
  lead: 'Lead',
  add_to_cart: 'AddToCart',
  initiate_checkout: 'InitiateCheckout',
  subscribe: 'Subscribe',
  add_payment_info: 'AddPaymentInfo',
  contact: 'Contact',
  submit_application: 'SubmitApplication',
  start_trial: 'StartTrial',
  schedule: 'Schedule',
  pageview: 'PageView',
}

function toMetaEventName(snakeCase: string): string {
  if (EVENT_NAME_MAP[snakeCase]) return EVENT_NAME_MAP[snakeCase]
  // Unknown types: convert snake_case to PascalCase
  return snakeCase
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

interface PixelEventData {
  event_type: string
  event_time: string          // ISO timestamp
  event_id?: string | null    // For deduplication
  event_value?: number | null
  event_currency?: string
  // User data
  ip_address?: string | null
  user_agent?: string | null
  fbclid?: string | null
  client_id?: string | null   // maps to fbp
  email?: string | null
  phone?: string | null
}

interface CapiConfig {
  metaPixelId: string
  capiToken: string
  configuredValue?: number    // From event_values if event has no value
}

/**
 * Forward a pixel event to Meta's Conversions API.
 * Returns 'sent' on success, 'failed' on error.
 */
export async function forwardToMeta(
  event: PixelEventData,
  config: CapiConfig
): Promise<'sent' | 'failed'> {
  try {
    const eventTime = Math.floor(new Date(event.event_time).getTime() / 1000)

    // Build user_data — Meta requires at least one identifier
    const userData: Record<string, unknown> = {}
    if (event.ip_address) userData.client_ip_address = event.ip_address
    if (event.user_agent) userData.client_user_agent = event.user_agent
    if (event.fbclid) userData.fbc = `fb.1.${eventTime}.${event.fbclid}`
    if (event.client_id) userData.fbp = event.client_id
    if (event.email) userData.em = [sha256(event.email)]
    if (event.phone) userData.ph = [sha256(event.phone)]

    // Build custom_data with value
    const value = event.event_value ?? config.configuredValue
    const customData: Record<string, unknown> = {}
    if (value != null && value > 0) {
      customData.value = value
      customData.currency = event.event_currency || 'USD'
    }

    const payload = {
      data: [
        {
          event_name: toMetaEventName(event.event_type),
          event_time: eventTime,
          event_id: event.event_id || undefined,
          action_source: 'website',
          user_data: userData,
          ...(Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
        },
      ],
    }

    const url = `${META_GRAPH_URL}/${config.metaPixelId}/events?access_token=${config.capiToken}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      console.error('[CAPI] Forward failed:', res.status, errBody)
      return 'failed'
    }

    console.log('[CAPI] Forwarded:', event.event_type, '→', toMetaEventName(event.event_type))
    return 'sent'
  } catch (err) {
    console.error('[CAPI] Error forwarding event:', err)
    return 'failed'
  }
}
