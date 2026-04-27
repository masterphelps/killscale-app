# CAPI Event Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure which pixel event types forward to Meta's Conversions API, with a unified Events & CAPI table and a discovery shortcut on the event log.

**Architecture:** New `capi_event_types` TEXT[] column on `workspace_pixels` controls which events forward. A new `lib/meta-capi.ts` module handles the Meta CAPI POST. Pixel event endpoints call it after inserting events. The pixel panel UI merges event values + CAPI toggles into one table and adds a "+ Add to CAPI" shortcut on event log rows for unconfigured types.

**Tech Stack:** Next.js 14 API routes, Supabase (Postgres), React, Tailwind CSS, Meta Conversions API v21.0

**Spec:** `docs/superpowers/specs/2026-04-27-capi-event-forwarding-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/073_capi_event_types.sql` | Create | Add `capi_event_types` column to `workspace_pixels` |
| `lib/meta-capi.ts` | Create | Meta CAPI forwarding utility (event name mapping, payload build, POST) |
| `app/api/pixel/purchase/route.ts` | Modify | Add CAPI forwarding after event insert |
| `app/api/pixel/events/route.ts` | Modify | Return `capi_event_types` from workspace_pixels for UI |
| `components/account-settings/pixel-panel.tsx` | Modify | Unified Events & CAPI table, event log shortcut, CAPI status summary |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/073_capi_event_types.sql`

- [ ] **Step 1: Write migration**

```sql
-- Add configurable event types for Meta CAPI forwarding
ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS capi_event_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN workspace_pixels.capi_event_types IS
  'Event types to forward to Meta CAPI. e.g. {complete_registration,purchase}';
```

- [ ] **Step 2: Apply migration**

Run in Supabase SQL Editor. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'workspace_pixels' AND column_name = 'capi_event_types';
```
Expected: one row with `data_type = 'ARRAY'`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/073_capi_event_types.sql
git commit -m "migration: add capi_event_types column to workspace_pixels"
```

---

### Task 2: Meta CAPI Forwarding Utility

**Files:**
- Create: `lib/meta-capi.ts`

- [ ] **Step 1: Create the module**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/meta-capi.ts
git commit -m "feat: add Meta CAPI forwarding utility"
```

---

### Task 3: Wire CAPI Forwarding into Purchase Endpoint

**Files:**
- Modify: `app/api/pixel/purchase/route.ts`

- [ ] **Step 1: Add CAPI forwarding after event insert**

After the existing insert (line 110) and before the success response (line 157), add CAPI forwarding. The pixel validation query at line 65 already fetches from `workspace_pixels` — expand it to include CAPI fields.

Change the pixel validation query (line 65-70) from:
```typescript
    const { data: pixelData, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select('workspace_id, pixel_id')
      .eq('pixel_id', pixel_id)
      .eq('pixel_secret', pixel_secret)
      .single()
```

To:
```typescript
    const { data: pixelData, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select('workspace_id, pixel_id, meta_pixel_id, meta_capi_token, capi_event_types, event_values')
      .eq('pixel_id', pixel_id)
      .eq('pixel_secret', pixel_secret)
      .single()
```

Then after the existing `console.log('[Pixel Purchase] Stored:', ...)` block (line 150-155), add:

```typescript
    // CAPI forwarding
    const capiEventTypes: string[] = pixelData.capi_event_types || []
    if (pixelData.meta_pixel_id && pixelData.meta_capi_token && capiEventTypes.includes('purchase')) {
      const { forwardToMeta } = await import('@/lib/meta-capi')
      const eventValues: Record<string, number> = pixelData.event_values || {}
      const capiStatus = await forwardToMeta(
        {
          event_type: 'purchase',
          event_time: event_time ? new Date(event_time).toISOString() : new Date().toISOString(),
          event_id: body.event_id || null,
          event_value: order_total || null,
          event_currency: 'USD',
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
          user_agent: request.headers.get('user-agent') || null,
          fbclid: fbclid || null,
          client_id: client_id || null,
        },
        {
          metaPixelId: pixelData.meta_pixel_id,
          capiToken: pixelData.meta_capi_token,
          configuredValue: eventValues['purchase'],
        }
      )
      // Update capi_status on the event (fire-and-forget — don't block response)
      supabase
        .from('pixel_events')
        .update({ capi_status: capiStatus })
        .eq('pixel_id', pixel_id)
        .eq('order_id', normalizedOrderId)
        .eq('event_type', 'purchase')
        .then(() => {})
    }
```

- [ ] **Step 2: Test manually**

Fire a test purchase event via curl. With CAPI not configured, verify no errors. With CAPI configured + purchase in `capi_event_types`, verify the Meta API call is attempted (check server logs for `[CAPI] Forwarded:` or `[CAPI] Forward failed:`).

- [ ] **Step 3: Commit**

```bash
git add app/api/pixel/purchase/route.ts
git commit -m "feat: wire CAPI forwarding into pixel purchase endpoint"
```

---

### Task 4: Events API — Return CAPI Config for UI

**Files:**
- Modify: `app/api/pixel/events/route.ts`

- [ ] **Step 1: Include capi_event_types in pixel query**

Change the pixel ownership query (line 23-31) from:
```typescript
    const { data: pixel, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select(`
        pixel_id,
        workspaces!inner (
          user_id
        )
      `)
      .eq('pixel_id', pixelId)
      .single()
```

To:
```typescript
    const { data: pixel, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select(`
        pixel_id,
        capi_event_types,
        workspaces!inner (
          user_id
        )
      `)
      .eq('pixel_id', pixelId)
      .single()
```

Then add `capiEventTypes` to the response (line 93-98), changing from:
```typescript
    return NextResponse.json({
      events: events || [],
      total: stats?.length || 0,
      byType: eventCounts,
      lastEventTime
    })
```

To:
```typescript
    return NextResponse.json({
      events: events || [],
      total: stats?.length || 0,
      byType: eventCounts,
      lastEventTime,
      capiEventTypes: (pixel as any)?.capi_event_types || [],
    })
```

- [ ] **Step 2: Commit**

```bash
git add app/api/pixel/events/route.ts
git commit -m "feat: return capi_event_types from events API for pixel panel UI"
```

---

### Task 5: Pixel Panel UI — Unified Events & CAPI Table

**Files:**
- Modify: `components/account-settings/pixel-panel.tsx`

This is the largest task. It modifies the pixel panel in three places: the WorkspacePixel type, the state/handlers, and the Events & CAPI section (replacing "Event Values").

- [ ] **Step 1: Update WorkspacePixel type and state**

Add `capi_event_types` to the `WorkspacePixel` type (line 27-36):

```typescript
type WorkspacePixel = {
  workspace_id: string
  pixel_id: string
  pixel_secret: string
  attribution_source: 'native' | 'pixel'
  attribution_model: AttributionModel
  event_values: Record<string, number>
  meta_pixel_id: string | null
  meta_capi_token: string | null
  capi_event_types: string[]
}
```

Update the `loadPixelData` select query (line 157) to include `capi_event_types`:

```typescript
.select('pixel_id, pixel_secret, attribution_source, attribution_model, event_values, meta_pixel_id, meta_capi_token, capi_event_types')
```

Do the same for the create-pixel select (line 176).

Update the `setWorkspacePixel` call (line 185-194) to include:
```typescript
capi_event_types: existingPixel.capi_event_types || [],
```

- [ ] **Step 2: Add CAPI event type toggle handler**

After the existing `updateEventValues` function (line 331-345), add:

```typescript
  // Update CAPI event types
  const updateCapiEventTypes = async (newTypes: string[]) => {
    if (!workspaceId || !workspacePixel) return
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ capi_event_types: newTypes })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? { ...prev, capi_event_types: newTypes } : prev)
      }
    } catch (err) {
      console.error('Failed to update CAPI event types:', err)
    }
  }

  // Add event type to both event_values and capi_event_types (from event log shortcut)
  const addEventToCapi = async (eventType: string) => {
    if (!workspacePixel) return
    const newEventValues = { ...workspacePixel.event_values }
    if (!(eventType in newEventValues)) {
      newEventValues[eventType] = 0
    }
    const newCapiTypes = workspacePixel.capi_event_types.includes(eventType)
      ? workspacePixel.capi_event_types
      : [...workspacePixel.capi_event_types, eventType]

    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ event_values: newEventValues, capi_event_types: newCapiTypes })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? {
          ...prev,
          event_values: newEventValues,
          capi_event_types: newCapiTypes,
        } : prev)
      }
    } catch (err) {
      console.error('Failed to add event to CAPI:', err)
    }
  }

  // Remove event type from both event_values and capi_event_types
  const removeEventType = async (eventType: string) => {
    if (!workspacePixel) return
    const newEventValues = { ...workspacePixel.event_values }
    delete newEventValues[eventType]
    const newCapiTypes = workspacePixel.capi_event_types.filter(t => t !== eventType)

    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ event_values: newEventValues, capi_event_types: newCapiTypes })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? {
          ...prev,
          event_values: newEventValues,
          capi_event_types: newCapiTypes,
        } : prev)
      }
    } catch (err) {
      console.error('Failed to remove event type:', err)
    }
  }
```

- [ ] **Step 3: Replace "Event Values" section with "Events & CAPI" table**

Replace the entire section 6 block (lines 833-908, from `{/* ───────────────────── 6. Event Values ───────────────────── */}` to the closing `</div>`) with:

```tsx
      {/* ───────────────────── 6. Events & CAPI ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium text-sm">Events & CAPI</h3>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 z-10">
              Configure which pixel events forward to Meta CAPI and their dollar values for ROAS calculation.
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Events with CAPI enabled are forwarded server-side to Meta for ad optimization. Values are used for ROAS: (Events x Value) / Spend.
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_100px_60px_32px] gap-2 px-3 pb-2 text-[11px] text-zinc-500 uppercase tracking-wider">
          <span>Event</span>
          <span className="text-right">Value</span>
          <span className="text-center">CAPI</span>
          <span />
        </div>

        {/* Event type rows */}
        <div className="space-y-1.5 mb-3">
          {(() => {
            // Build unified list from event_values keys + capi_event_types
            const allTypes = new Set([
              ...Object.keys(wp.event_values || {}),
              ...(wp.capi_event_types || []),
            ])
            const rows = Array.from(allTypes)
            if (rows.length === 0) {
              return (
                <div className="text-sm text-zinc-500 py-2 px-3">
                  No event types configured. Add events below or click &quot;+ Add to CAPI&quot; on an event in the log.
                </div>
              )
            }
            return rows.map(eventType => {
              const event = STANDARD_EVENTS.find(e => e.key === eventType)
              const value = (wp.event_values || {})[eventType]
              const capiOn = (wp.capi_event_types || []).includes(eventType)
              const isPurchase = eventType === 'purchase'

              return (
                <div
                  key={eventType}
                  className={cn(
                    'grid grid-cols-[1fr_100px_60px_32px] gap-2 items-center p-3 bg-bg-dark rounded-lg border border-border',
                    !capiOn && 'opacity-60'
                  )}
                >
                  {/* Event name badge */}
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium w-fit',
                    eventType === 'purchase' ? 'bg-verdict-scale/20 text-verdict-scale' :
                    eventType === 'pageview' ? 'bg-zinc-700 text-zinc-400' :
                    'bg-accent/20 text-accent'
                  )}>
                    {event?.label || eventType}
                  </span>

                  {/* Value input */}
                  <div className="flex items-center gap-1 justify-end">
                    {isPurchase ? (
                      <span className="text-xs text-zinc-500 italic">from order</span>
                    ) : (
                      <>
                        <span className="text-zinc-500 text-sm">$</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={value ?? 0}
                          onChange={(e) => {
                            const num = parseFloat(e.target.value)
                            if (!isNaN(num) && num >= 0) {
                              updateEventValues({ ...wp.event_values, [eventType]: num })
                            }
                          }}
                          className="w-16 px-2 py-1.5 bg-bg-card border border-border rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent text-right"
                        />
                      </>
                    )}
                  </div>

                  {/* CAPI toggle */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        const newTypes = capiOn
                          ? (wp.capi_event_types || []).filter(t => t !== eventType)
                          : [...(wp.capi_event_types || []), eventType]
                        updateCapiEventTypes(newTypes)
                      }}
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: capiOn ? '#a855f7' : '#3f3f46' }}
                      title={capiOn ? 'Forwarding to CAPI' : 'Not forwarding'}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                        style={{
                          background: capiOn ? 'white' : '#71717a',
                          left: capiOn ? '18px' : '2px',
                        }}
                      />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeEventType(eventType)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })
          })()}
        </div>

        {/* Add event dropdown */}
        {STANDARD_EVENTS.filter(e => {
          const allTypes = new Set([...Object.keys(wp.event_values || {}), ...(wp.capi_event_types || [])])
          return !allTypes.has(e.key)
        }).length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                updateEventValues({ ...wp.event_values, [e.target.value]: 0 })
                e.target.value = ''
              }
            }}
            className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer"
          >
            <option value="" disabled>Add an event type...</option>
            {STANDARD_EVENTS.filter(e => {
              const allTypes = new Set([...Object.keys(wp.event_values || {}), ...(wp.capi_event_types || [])])
              return !allTypes.has(e.key)
            }).map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add components/account-settings/pixel-panel.tsx
git commit -m "feat: unified Events & CAPI table in pixel panel"
```

---

### Task 6: Event Log — Discovery Shortcut

**Files:**
- Modify: `components/account-settings/pixel-panel.tsx`

- [ ] **Step 1: Add "+ Add to CAPI" button and "checkmark CAPI" indicator to event rows**

In the event log rendering (around line 1117), update each event row. Between the existing notes section and the `<div className="flex items-center gap-2 flex-shrink-0">` right-side controls, add the CAPI shortcut.

Replace the entire event row `<div>` (lines 1117-1174, inside the `.map()`) with:

```tsx
                <div
                  key={event.id}
                  className={cn(
                    'flex items-center justify-between p-2.5 bg-bg-dark rounded-lg text-sm group',
                    // Highlight unconfigured event types
                    wp && !(event.event_type in (wp.event_values || {})) && !(wp.capi_event_types || []).includes(event.event_type) && event.event_type !== 'pageview'
                      ? 'border border-purple-500/15 bg-purple-500/[0.03]'
                      : ''
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Event type badge */}
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0",
                      event.event_type === 'purchase' ? 'bg-verdict-scale/20 text-verdict-scale' :
                      event.event_type === 'pageview' ? 'bg-zinc-700 text-zinc-400' :
                      'bg-accent/20 text-accent'
                    )}>
                      {event.event_type}
                    </span>
                    {/* NEW badge for unconfigured types */}
                    {wp && !(event.event_type in (wp.event_values || {})) && !(wp.capi_event_types || []).includes(event.event_type) && event.event_type !== 'pageview' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 flex-shrink-0">
                        NEW
                      </span>
                    )}
                    {/* Manual indicator */}
                    {event.source === 'manual' && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 flex-shrink-0">
                        manual
                      </span>
                    )}
                    {/* Value */}
                    {event.event_value && (
                      <span className="text-zinc-400 flex-shrink-0">${event.event_value.toFixed(2)}</span>
                    )}
                    {/* Attribution */}
                    {event.utm_content && (
                      <span className="text-xs text-zinc-600 font-mono truncate max-w-[80px]" title={`Attributed to: ${event.utm_content}`}>
                        &rarr; {event.utm_content.slice(-8)}
                      </span>
                    )}
                    {/* Notes */}
                    {event.event_metadata?.notes && (
                      <span className="text-xs text-zinc-500 truncate" title={event.event_metadata.notes}>
                        &quot;{event.event_metadata.notes}&quot;
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* CAPI status: configured + on */}
                    {wp && (wp.capi_event_types || []).includes(event.event_type) && (
                      <span className="text-[11px] text-purple-400 flex-shrink-0">&#x2713; CAPI</span>
                    )}
                    {/* + Add to CAPI shortcut for unconfigured types */}
                    {wp && !(event.event_type in (wp.event_values || {})) && !(wp.capi_event_types || []).includes(event.event_type) && event.event_type !== 'pageview' && (
                      <button
                        onClick={() => addEventToCapi(event.event_type)}
                        className="text-[11px] text-purple-400 bg-purple-500/15 border border-purple-500/30 rounded-md px-2 py-0.5 hover:bg-purple-500/25 transition-colors flex-shrink-0 whitespace-nowrap"
                      >
                        + Add to CAPI
                      </button>
                    )}
                    {/* Date */}
                    <span className="text-xs text-zinc-600" title={new Date(event.event_time).toLocaleString()}>
                      {new Date(event.event_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {/* Delete button */}
                    <button
                      onClick={() => deleteEvent(event.id)}
                      disabled={deletingEventId === event.id}
                      className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                      title="Delete event"
                    >
                      {deletingEventId === event.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/account-settings/pixel-panel.tsx
git commit -m "feat: event log discovery shortcut — NEW badge + Add to CAPI button"
```

---

### Task 7: CAPI Credentials — Status Summary

**Files:**
- Modify: `components/account-settings/pixel-panel.tsx`

- [ ] **Step 1: Add forwarding status below CAPI save button**

In the Meta CAPI section (section 4b), after the Save button (around line 776), add a status summary. Insert after the closing `</button>` of the Save CAPI Settings button:

```tsx
          {/* CAPI forwarding status */}
          <div className="mt-3 pt-3 border-t border-border">
            {(wp.capi_event_types || []).length > 0 ? (
              wp.meta_pixel_id && wp.meta_capi_token ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-500">Forwarding:</span>
                  {(wp.capi_event_types || []).map(type => (
                    <span key={type} className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium',
                      type === 'purchase' ? 'bg-verdict-scale/15 text-verdict-scale' : 'bg-purple-500/15 text-purple-400'
                    )}>
                      {STANDARD_EVENTS.find(e => e.key === type)?.label || type}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-400">
                  {(wp.capi_event_types || []).length} event type{(wp.capi_event_types || []).length > 1 ? 's' : ''} ready &mdash; add your Meta Pixel ID and token to start forwarding.
                </p>
              )
            ) : (
              <p className="text-xs text-zinc-500">
                No events configured for CAPI. Add them in Events &amp; CAPI below.
              </p>
            )}
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/account-settings/pixel-panel.tsx
git commit -m "feat: CAPI credentials section shows forwarding status summary"
```

---

### Task 8: Final Integration Test

- [ ] **Step 1: Test the full flow end-to-end**

1. Open Settings → Pixel panel
2. Verify "Events & CAPI" section shows (replaces old "Event Values")
3. Add `complete_registration` from dropdown → row appears with $0 value, CAPI off
4. Toggle CAPI on → toggle turns purple
5. Set value to $50
6. Check CAPI credentials section shows: "1 event type ready — add your Meta Pixel ID and token..."
7. Enter Meta Pixel ID and CAPI token → save → status shows "Forwarding: Complete Registration"
8. Fire a test event from the website → see it in event log with "✓ CAPI"
9. Fire a new event type (e.g., `subscribe`) → see it with "NEW" badge and "+ Add to CAPI" button
10. Click "+ Add to CAPI" → row added to table above, button replaced with "✓ CAPI"
11. Delete the test event with X
12. Verify server logs show `[CAPI] Forwarded: complete_registration → CompleteRegistration`

- [ ] **Step 2: Final commit and push**

```bash
git push
```
