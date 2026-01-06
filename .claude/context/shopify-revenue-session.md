# Session Context: Shopify as Source of Truth

**Date:** 2026-01-02
**Status:** Plan agent executing in background

---

## What We Decided

### The Core Insight
Shopify orders are synced to `shopify_orders` with UTM attribution (`last_utm_content` = ad_id), but this data was **never used** in the dashboard. Revenue was only coming from Meta API or KillScale pixel.

### Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| **Shopify = source of truth** for e-commerce | Actual orders > pixel fires > Meta claims |
| **Business Type toggle** | Explicit E-commerce vs Lead Gen per workspace |
| **Waterfall attribution** | Shopify UTM → Pixel → Meta → Unattributed |
| **Pixel not needed for Shopify stores** | Shopify has UTMs natively via customerJourneySummary |
| **Attribution settings only for Pixel** | Shopify is last-touch only, no model config needed |
| **CPR metrics for Lead Gen** | No revenue = cost-per-result verdicts |

### Questions Answered

1. **"Do we still need the KillScale pixel?"**
   - For Shopify stores: No (Shopify handles attribution)
   - For lead-gen: Yes (track form submissions, signups)
   - For non-Shopify e-commerce: Yes (until WooCommerce integration)

2. **"Do we show total revenue or just attributed?"**
   - Both. Total Shopify revenue + attributed (has UTM) + unattributed (organic)
   - The split is valuable insight

3. **"Do we still need UTM tags?"**
   - Yes. `last_utm_content` is how we join orders to ads
   - Shopify captures these automatically from customerJourneySummary

---

## What's Being Built

**Plan file:** `.claude/plans/shopify-source-of-truth.md`

### Phase Summary

1. **Database** - Add `business_type` to workspaces, CPR thresholds to rules
2. **Shopify Attribution API** - `/api/shopify/attribution` endpoint
3. **Attribution Context** - Extend `lib/attribution.tsx` with Shopify state
4. **Dashboard** - Mode-based metrics, source indicator, revenue breakdown bar
5. **Settings UI** - Business type toggle, reorganized sections
6. **Verdict Logic** - CPR-based verdicts for lead-gen

### Files Being Created/Modified

| File | Change |
|------|--------|
| `supabase/migrations/032_workspace_business_type.sql` | New migration |
| `app/api/shopify/attribution/route.ts` | New endpoint |
| `lib/shopify/auth.ts` | Add helpers |
| `lib/supabase.ts` | Types, verdict logic |
| `lib/attribution.tsx` | Shopify state, waterfall |
| `app/dashboard/page.tsx` | Revenue source, metrics |
| `app/dashboard/settings/workspaces/page.tsx` | Business type UI |

---

## Madgicx Comparison (Research)

From https://academy.madgicx.com/lessons/how-to-pick-your-one-click-report-template:

- Shows blended metrics across Facebook, Shopify, Google
- Separate templates for e-commerce (Business Dashboard) vs lead-gen
- Displays "Shopify revenue" alongside "ad spend" for profitability
- No explicit guidance on discrepancy handling

**Our differentiation:** We show the discrepancy between Meta-claimed and Shopify-actual revenue.

---

## Agent History

| Agent | Task | Status |
|-------|------|--------|
| Plan agent (a269d7c) | Analyze codebase, refine plan | Completed - produced analysis, no code |
| Implementation agent (a3989ef) | Phases 1-4 (DB, API, helpers, context) | ✅ Completed |
| Settings UI agent (a054d5d) | Phase 5 - Business type toggle | ✅ Completed |
| Dashboard agent (a7ddf7f) | Phase 6 - Shopify revenue integration | ✅ Completed |

## Files Created/Modified

| File | Change |
|------|--------|
| `supabase/migrations/032_workspace_business_type.sql` | Created - business_type + CPR thresholds |
| `app/api/shopify/attribution/route.ts` | Created - revenue aggregation by ad_id |
| `lib/shopify/auth.ts` | Extended - hasShopifyConnection, getShopifyConnectionStatus |
| `lib/attribution.tsx` | Extended - Shopify state, waterfall logic, revenueSource |
| `lib/account.tsx` | Updated - Workspace type includes business_type |
| `app/dashboard/settings/workspaces/page.tsx` | Phase 5 - Business type toggle, contextual Shopify messaging |
| `app/dashboard/page.tsx` | Phase 6 - Shopify revenue in totals, source indicator, breakdown bar |

## Remaining Work

- **Phase 7**: Verdict logic - CPR-based verdicts for lead-gen mode (deferred)

## Resume Instructions

If continuing this work:

1. Run migration: `032_workspace_business_type.sql`
2. Implement Settings UI toggle for business type
3. Update dashboard to use `shopifyAttribution` when `revenueSource === 'shopify'`
4. Update verdict logic for CPR thresholds in lead-gen mode
5. Key test: Workspace with Shopify should show Shopify revenue in dashboard

## Related Files for Context

- Current Shopify sync: `app/api/shopify/sync/route.ts`
- Shopify orders table: `shopify_orders` with `last_utm_content`
- Attribution context: `lib/attribution.tsx`
- Dashboard: `app/dashboard/page.tsx` (large file, ~2500 lines)
