# CAPI Event Forwarding — Design Spec

## Problem

Users install the KillScale pixel on their website and fire events (registrations, purchases, pageviews). Currently these events are stored in `pixel_events` for attribution, but they aren't forwarded to Meta's Conversions API (CAPI). Users need CAPI forwarding so Meta's ad algorithm can optimize for the events that matter — and they need control over which event types get sent.

## Solution

A per-event-type CAPI forwarding toggle, discoverable from the event log, configured in a unified "Events & CAPI" table.

## User Workflow

1. Install pixel on website, fire test events (e.g., `CompleteRegistration`, `Purchase`)
2. Events appear in the pixel panel's event log
3. New (unconfigured) event types show a "NEW" badge and "+ Add to CAPI" button on the event row
4. Click "+ Add to CAPI" — the event type is added to the Events & CAPI config table with CAPI toggle ON and $0 value
5. Set the dollar value in the table if needed (e.g., $50 for registrations)
6. Delete the test event with X so it doesn't affect metrics
7. From now on, all future events of that type auto-forward to Meta server-side

## Data Model

### Existing (no changes)

- `workspace_pixels.meta_pixel_id` — Meta Pixel ID (numeric string). Required for CAPI.
- `workspace_pixels.meta_capi_token` — Meta CAPI access token. Required for CAPI.
- `workspace_pixels.event_values` — JSONB mapping event type to dollar value. e.g., `{"complete_registration": 50, "lead": 25}`
- `pixel_events.event_id` — Client-generated UUID, shared with Meta browser pixel for deduplication.
- `pixel_events.capi_status` — Delivery status: `sent`, `failed`, `skipped`.

### New column

```sql
ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS capi_event_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN workspace_pixels.capi_event_types IS
  'Event types to forward to Meta CAPI. e.g. {complete_registration,purchase}';
```

### Unified config surface

The "Events & CAPI" table in the UI is built from the **union** of `event_values` keys and `capi_event_types` entries. A type can have:
- A value but no CAPI (track value for ROAS, don't forward)
- CAPI but no value (forward to Meta, no dollar amount)
- Both (forward with value)

When a type is removed from the table (X button), it's removed from both `event_values` and `capi_event_types`.

## UI Changes — Pixel Panel

All changes in `components/account-settings/pixel-panel.tsx`.

### 1. Replace "Event Values" section with "Events & CAPI"

Same location in the panel (section 6). The table gains a CAPI toggle column.

**Each row:**
| Element | Description |
|---------|-------------|
| Event type badge | Colored pill (purple for custom events, green for purchase, gray for low-value) |
| Dollar value input | Number input with `$` prefix. Purchase type shows italic "from order" instead of input. |
| CAPI toggle | Small toggle switch. Purple = on (forwarding), gray = off. |
| X button | Removes the event type from both `event_values` and `capi_event_types`. |

**Column headers:** Event / Value / CAPI / (remove)

**"Add an event..." dropdown** stays at the bottom, same behavior — adds a row with $0 value and CAPI off by default.

**Dimming:** Rows with CAPI off render at 60% opacity (same pattern as the current `in_dashboard` toggle on accounts).

### 2. Event log rows get discovery shortcut

For each event in the recent events list:

- **Event type already in config table with CAPI on:** Show a quiet `"checkmark CAPI"` indicator in purple text. No action needed.
- **Event type already in config table with CAPI off:** Show nothing extra.
- **Event type NOT in config table:** Show a yellow "NEW" badge and a `"+ Add to CAPI"` button (purple outline, small).

**Clicking "+ Add to CAPI":**
1. Adds event type to `capi_event_types` array
2. Adds event type to `event_values` with value `0`
3. Single `UPDATE workspace_pixels` call
4. UI updates: button disappears, replaced with "checkmark CAPI" indicator
5. The Events & CAPI table above gains the new row

**Clicking "+ Add to CAPI" does NOT require CAPI credentials to be configured.** The type is saved to the config — forwarding just won't happen until credentials are set. This lets users configure which events to forward before connecting CAPI.

### 3. CAPI credentials section gets status summary

Below the existing Meta Pixel ID + Token inputs and Save button, add a one-line summary:

- If `capi_event_types` has entries: `"Forwarding: complete_registration, purchase"` — active types as small colored chips
- If `capi_event_types` is empty: `"No events configured for CAPI. Add them in Events & CAPI below."`
- If credentials aren't set but types are configured: `"2 event types ready — add your Meta Pixel ID and token to start forwarding."`

## Server-Side Changes

### 1. New module: `lib/meta-capi.ts`

Small focused utility for Meta CAPI integration.

```typescript
interface CapiEvent {
  event_name: string      // Meta event name (e.g., 'CompleteRegistration')
  event_time: number      // Unix timestamp
  event_id: string        // For deduplication with browser pixel
  action_source: 'website'
  user_data: {
    client_ip_address?: string
    client_user_agent?: string
    fbc?: string          // Facebook click ID cookie
    fbp?: string          // Facebook browser ID cookie
    em?: string[]         // SHA-256 hashed email(s)
    ph?: string[]         // SHA-256 hashed phone(s)
  }
  custom_data?: {
    value?: number
    currency?: string
  }
}

async function forwardToMeta(
  event: CapiEvent,
  metaPixelId: string,
  capiToken: string
): Promise<'sent' | 'failed'>
```

**Responsibilities:**
- Build the Meta CAPI payload format
- POST to `https://graph.facebook.com/v21.0/{metaPixelId}/events`
- Return `'sent'` on 2xx, `'failed'` on error (log details)
- Does NOT retry — failed events are logged for debugging via `capi_status`

**Event name mapping:** KillScale uses snake_case (`complete_registration`), Meta uses PascalCase (`CompleteRegistration`). The module maps between them:
- `purchase` → `Purchase`
- `complete_registration` → `CompleteRegistration`
- `lead` → `Lead`
- `add_to_cart` → `AddToCart`
- `initiate_checkout` → `InitiateCheckout`
- `subscribe` → `Subscribe`
- `add_payment_info` → `AddPaymentInfo`
- `contact` → `Contact`
- `submit_application` → `SubmitApplication`
- `start_trial` → `StartTrial`
- `schedule` → `Schedule`
- `pageview` → `PageView`
- Unknown types: convert snake_case to PascalCase as custom event

### 2. Pixel event endpoints gain CAPI forwarding

**Files affected:**
- `app/api/pixel/purchase/route.ts` — purchase events
- Any other pixel event ingestion endpoint

**After inserting the event into `pixel_events`:**

```
1. Look up workspace_pixels for this pixel_id
2. If meta_pixel_id AND meta_capi_token are set
   AND event_type is in capi_event_types:
   → Call forwardToMeta() with event data
   → UPDATE pixel_events SET capi_status = result WHERE id = eventId
3. Otherwise:
   → UPDATE pixel_events SET capi_status = 'skipped'
```

**Value resolution for CAPI payload:**
- If `event_value` is set on the event (e.g., purchase with order total): use it
- Else if `event_values[event_type]` is set on workspace_pixels: use it
- Else: send event without value

**PII hashing:**
- Email and phone from event data (if available) must be SHA-256 hashed before sending
- `client_ip_address` and `client_user_agent` sent as-is (Meta requires them unhashed)
- `fbc` (fbclid cookie) and `fbp` (Facebook browser ID) passed through if present

### 3. Migration

Single migration file:

```sql
ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS capi_event_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN workspace_pixels.capi_event_types IS
  'Event types to forward to Meta CAPI. e.g. {complete_registration,purchase}';
```

## What Does NOT Change

- **Pixel client script** (`ks.js` served from pixel.killscale.com) — no changes
- **Attribution logic** — CAPI forwarding is independent of KillScale's own attribution
- **Verdict calculations** — still based on KillScale's data, not Meta's
- **Dashboard queries** — unchanged
- **Event deletion** — the X button on event rows (recently added) is unchanged
- **Manual events** — still work as before, also eligible for CAPI forwarding if their type is in the list
- **CAPI credentials UI** — Meta Pixel ID + Token inputs stay where they are, just gain the status summary line

## Scope Boundary

This spec covers forwarding pixel events to Meta CAPI only. It does NOT cover:
- Google Ads CAPI / enhanced conversions (future work)
- Retry logic for failed CAPI sends (log and move on)
- CAPI event quality monitoring (EMQ score display)
- Batching multiple events into one CAPI call (send individually for simplicity)
