# Plan: Shopify as Source of Truth + Business Type Modes

## Context

KillScale currently shows revenue from Meta API or KillScale pixel events. We have a Shopify integration that syncs orders with UTM attribution data, but **this data is never used in the dashboard**.

This plan:
1. Adds a **Business Type** setting (E-commerce vs Lead Gen) per workspace
2. Makes **Shopify the source of truth** for e-commerce revenue when connected
3. Implements **waterfall attribution** for e-commerce: Shopify → Pixel → Meta → Unattributed
4. Shows **appropriate metrics** based on business type (ROAS vs CPL/CPR)

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Explicit Business Type toggle | User declares intent, not just inferred from connections |
| Shopify supersedes Pixel | Actual orders > pixel fires |
| Waterfall attribution | Try each source in order, use best available |
| Attribution settings only for Pixel | Shopify provides last-touch natively |
| CPL/CPR for lead-gen | No revenue = cost-per-result metrics |

---

## Business Type Modes

### E-commerce Mode
- **Trigger:** User selects "E-commerce" AND Shopify connected
- **Revenue source:** Shopify orders (via `last_utm_content` UTM attribution)
- **Fallback chain:** Shopify UTM → KillScale Pixel → Meta API → Unattributed
- **Primary metrics:** Revenue, Orders, ROAS, AOV
- **Verdict logic:** Based on ROAS thresholds

### Lead Gen Mode
- **Trigger:** User selects "Lead Gen" OR no Shopify connected
- **Results source:** Meta API `results` field (auto-maps to campaign objective)
- **Optional:** KillScale pixel for custom event tracking
- **Primary metrics:** Results, CPL/CPR, Conversion Rate
- **Verdict logic:** Based on CPR thresholds (not ROAS)

---

## Waterfall Attribution (E-commerce)

```
For each ad, try sources in order:

1. Shopify UTM Match
   └─ Query: shopify_orders WHERE last_utm_content = ad_id
   └─ If found: Use this revenue (ground truth)

2. KillScale Pixel
   └─ Query: pixel_events WHERE utm_content = ad_id
   └─ If found: Use pixel-attributed revenue

3. Meta API Reported
   └─ Use: ad_data.revenue from Meta sync
   └─ Least reliable but always available

4. Unattributed
   └─ Shopify orders with no UTM = organic/email/direct
   └─ Counted in totals, not assigned to ads
```

---

## Phase 1: Database & Types

### Task 1.1: Add Business Type to Workspaces

**Migration:** `supabase/migrations/032_workspace_business_type.sql`

```sql
-- Add business_type column to workspaces
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'ecommerce'
CHECK (business_type IN ('ecommerce', 'leadgen'));

-- Add index for queries
CREATE INDEX IF NOT EXISTS idx_workspaces_business_type ON workspaces(business_type);
```

### Task 1.2: Update TypeScript Types

**Modify:** `lib/supabase.ts`

Add to Workspace type:
```typescript
type Workspace = {
  // ... existing fields
  business_type: 'ecommerce' | 'leadgen'
}
```

---

## Phase 2: Shopify Attribution API

### Task 2.1: Create Shopify Attribution Endpoint

**Create:** `app/api/shopify/attribution/route.ts`

```typescript
// GET /api/shopify/attribution?workspaceId=X&dateStart=Y&dateEnd=Z

// Query shopify_orders for workspace within date range
// Filter: financial_status IN ('PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED')
// Group by last_utm_content (ad_id)

// Response:
{
  attribution: {
    [ad_id: string]: { revenue: number; orders: number }
  },
  totals: {
    total_revenue: number,
    total_orders: number,
    attributed_revenue: number,  // Has UTM
    attributed_orders: number,
    unattributed_revenue: number, // No UTM (organic)
    unattributed_orders: number
  }
}
```

### Task 2.2: Add Connection Check Helper

**Modify:** `lib/shopify/auth.ts`

```typescript
export async function hasShopifyConnection(workspaceId: string): Promise<boolean>
export async function getShopifyConnectionStatus(workspaceId: string): Promise<{
  connected: boolean
  shop_domain?: string
  last_sync_at?: string
  order_count?: number
}>
```

---

## Phase 3: Attribution Context Updates

### Task 3.1: Extend Attribution Context

**Modify:** `lib/attribution.tsx`

```typescript
type AttributionContextType = {
  // Existing fields...

  // NEW: Business type from workspace
  businessType: 'ecommerce' | 'leadgen'

  // NEW: Shopify state
  hasShopify: boolean
  shopifyAttribution: Record<string, { revenue: number; orders: number }>
  shopifyTotals: {
    total_revenue: number
    attributed_revenue: number
    unattributed_revenue: number
  } | null

  // NEW: Computed source (result of waterfall)
  revenueSource: 'shopify' | 'pixel' | 'meta'

  // NEW: Actions
  refreshShopifyAttribution: (dateStart: string, dateEnd: string) => Promise<void>
}
```

### Task 3.2: Implement Waterfall Logic

In the provider:

```typescript
// Determine revenue source based on business type and connections
const revenueSource = useMemo(() => {
  if (businessType === 'leadgen') return 'meta' // Lead gen uses Meta results
  if (hasShopify) return 'shopify'
  if (isKillScaleActive) return 'pixel'
  return 'meta'
}, [businessType, hasShopify, isKillScaleActive])
```

### Task 3.3: Load Workspace Business Type

When workspace changes, fetch `business_type` from workspace record and set in context.

---

## Phase 4: Dashboard Integration

### Task 4.1: Update Stat Cards Based on Business Type

**Modify:** `app/dashboard/page.tsx`

**E-commerce mode shows:**
- Spend | Revenue | ROAS | Orders | AOV

**Lead-gen mode shows:**
- Spend | Results | CPR | Conv Rate

```typescript
const { businessType, revenueSource } = useAttribution()

// In stat cards section:
{businessType === 'ecommerce' ? (
  <>
    <StatCard label="Revenue" value={formatCurrency(totals.revenue)} />
    <StatCard label="ROAS" value={formatROAS(totals.roas)} />
    <StatCard label="Orders" value={totals.orders} />
  </>
) : (
  <>
    <StatCard label="Results" value={totals.results} />
    <StatCard label="CPR" value={formatCurrency(totals.cpr)} />
  </>
)}
```

### Task 4.2: Update Totals Calculation

In `totals` useMemo:

```typescript
if (businessType === 'ecommerce' && revenueSource === 'shopify') {
  // Sum Shopify-attributed revenue for selected ads
  const shopifyRev = selectedAds.reduce((sum, adId) => {
    return sum + (shopifyAttribution[adId]?.revenue || 0)
  }, 0)
  // ... calculate ROAS from Shopify revenue
}

if (businessType === 'leadgen') {
  // Use Meta results field, calculate CPR
  // No revenue - cost per result metrics
}
```

### Task 4.3: Update Per-Row Data

When building table data:

```typescript
if (revenueSource === 'shopify') {
  row.revenue = shopifyAttribution[row.ad_id]?.revenue || 0
  row.purchases = shopifyAttribution[row.ad_id]?.orders || 0
  row._metaRevenue = originalMetaRevenue // Keep for comparison
}
```

### Task 4.4: Add Source Indicator

Near stat cards:

```tsx
<div className="flex items-center gap-2 text-xs text-zinc-500">
  {revenueSource === 'shopify' && (
    <><ShoppingBag className="w-3 h-3" /> Revenue from Shopify</>
  )}
  {revenueSource === 'pixel' && (
    <><Activity className="w-3 h-3" /> Revenue from KillScale Pixel</>
  )}
  {businessType === 'leadgen' && (
    <><Target className="w-3 h-3" /> Lead Gen Mode (CPR metrics)</>
  )}
</div>
```

### Task 4.5: Business Overview Bar (E-commerce + Shopify)

When Shopify connected, show revenue breakdown:

```tsx
{revenueSource === 'shopify' && shopifyTotals && (
  <div className="bg-bg-card border border-border rounded-lg p-4 mb-4">
    <div className="flex justify-between text-sm mb-2">
      <span>Total Shopify Revenue: {formatCurrency(shopifyTotals.total_revenue)}</span>
      <span className="text-zinc-500">
        {Math.round(shopifyTotals.attributed_revenue / shopifyTotals.total_revenue * 100)}% from ads
      </span>
    </div>
    <div className="h-2 bg-bg-dark rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500"
        style={{ width: `${shopifyTotals.attributed_revenue / shopifyTotals.total_revenue * 100}%` }}
      />
    </div>
    <div className="flex justify-between text-xs text-zinc-500 mt-1">
      <span>Ad-Attributed: {formatCurrency(shopifyTotals.attributed_revenue)}</span>
      <span>Organic: {formatCurrency(shopifyTotals.unattributed_revenue)}</span>
    </div>
  </div>
)}
```

---

## Phase 5: Settings UI

### Task 5.1: Add Business Type Toggle

**Modify:** `app/dashboard/settings/workspaces/page.tsx`

Add at top of each workspace card:

```tsx
<div className="flex items-center gap-4 p-4 border-b border-border">
  <span className="text-sm font-medium">Business Type</span>
  <div className="flex gap-2">
    <button
      onClick={() => updateBusinessType(workspace.id, 'ecommerce')}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm transition-colors',
        workspace.business_type === 'ecommerce'
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
      )}
    >
      E-commerce
    </button>
    <button
      onClick={() => updateBusinessType(workspace.id, 'leadgen')}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm transition-colors',
        workspace.business_type === 'leadgen'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
      )}
    >
      Lead Gen
    </button>
  </div>
</div>
```

### Task 5.2: Reorganize Integration Sections

**New structure:**

```
Workspace Card
├── Business Type Toggle [E-commerce | Lead Gen]
│
├── Shopify Integration (show for all, emphasize for e-commerce)
│   ├── Connect/Disconnect
│   ├── Sync status
│   └── [If connected + ecommerce]: "✓ Shopify is your revenue source"
│
└── KillScale Pixel
    ├── [If Shopify connected]: "Optional - Shopify handles attribution"
    ├── [If Lead Gen]: "Track conversions for lead attribution"
    ├── Pixel ID & code
    ├── Attribution Settings (hide if Shopify is source)
    │   ├── Attribution Model
    │   ├── Window
    │   └── Time Decay
    └── Event Log
```

### Task 5.3: Contextual Guidance

Show different helper text based on business type:

**E-commerce + No Shopify:**
> "Connect Shopify to see real revenue from your store, not Meta's estimates."

**E-commerce + Shopify Connected:**
> "✓ Revenue data comes directly from Shopify orders."

**Lead Gen:**
> "Tracking results like leads and signups. Install the KillScale pixel for custom event tracking, or use Meta's reported results."

---

## Phase 6: Verdict Logic Updates

### Task 6.1: Update Verdict Calculation

**Modify:** `lib/supabase.ts` - `calculateVerdict()`

```typescript
function calculateVerdict(
  spend: number,
  revenue: number,
  results: number,
  rules: Rules,
  businessType: 'ecommerce' | 'leadgen'
): Verdict {
  if (businessType === 'ecommerce') {
    // Existing ROAS-based logic
    const roas = spend > 0 ? revenue / spend : 0
    if (spend < rules.learning_spend) return 'LEARN'
    if (roas >= rules.scale_roas) return 'SCALE'
    if (roas >= rules.min_roas) return 'WATCH'
    return 'KILL'
  } else {
    // Lead gen: CPR-based logic
    const cpr = results > 0 ? spend / results : Infinity
    if (spend < rules.learning_spend) return 'LEARN'
    if (cpr <= rules.target_cpr) return 'SCALE'
    if (cpr <= rules.max_cpr) return 'WATCH'
    return 'KILL'
  }
}
```

### Task 6.2: Add CPR Thresholds to Rules

**Migration:** Add to `workspace_rules` table:

```sql
ALTER TABLE workspace_rules
ADD COLUMN IF NOT EXISTS target_cpr DECIMAL(10,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS max_cpr DECIMAL(10,2) DEFAULT 25.00;
```

### Task 6.3: Update Rules Settings UI

Show different threshold inputs based on business type:

**E-commerce:**
- Scale ROAS (default 3.0)
- Min ROAS (default 1.5)
- Learning Spend (default $100)

**Lead Gen:**
- Target CPR (default $10)
- Max CPR (default $25)
- Learning Spend (default $100)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/032_workspace_business_type.sql` | CREATE | Add business_type column |
| `app/api/shopify/attribution/route.ts` | CREATE | Shopify attribution endpoint |
| `lib/shopify/auth.ts` | MODIFY | Add connection check helpers |
| `lib/supabase.ts` | MODIFY | Update types, verdict logic |
| `lib/attribution.tsx` | MODIFY | Add Shopify state, waterfall logic |
| `app/dashboard/page.tsx` | MODIFY | Use Shopify revenue, mode-based UI |
| `app/dashboard/settings/workspaces/page.tsx` | MODIFY | Business type toggle, reorganize sections |

---

## Testing Checklist

### E-commerce Mode + Shopify
- [ ] Business type set to "E-commerce"
- [ ] Shopify connected and synced
- [ ] Dashboard shows "Revenue from Shopify" indicator
- [ ] Per-ad revenue matches Shopify orders grouped by `last_utm_content`
- [ ] Total revenue bar shows attributed vs organic split
- [ ] Verdicts calculated from Shopify ROAS

### E-commerce Mode + No Shopify
- [ ] Falls back to KillScale pixel if active
- [ ] Falls back to Meta API if no pixel
- [ ] Shows prompt to connect Shopify

### Lead Gen Mode
- [ ] Dashboard shows Results, CPR instead of Revenue, ROAS
- [ ] Verdicts based on CPR thresholds
- [ ] Pixel section shows lead-gen guidance
- [ ] Shopify section shows "Not applicable for lead gen"

### Settings
- [ ] Business type toggle saves to database
- [ ] Switching type updates dashboard immediately
- [ ] Attribution settings hidden when Shopify is source
- [ ] CPR threshold inputs shown for lead gen

---

## Out of Scope (Future)

- First-touch vs last-touch toggle for Shopify
- Meta vs Shopify comparison column in table
- Multiple Shopify stores per workspace
- WooCommerce/BigCommerce integrations
- Stripe integration for SaaS subscriptions
