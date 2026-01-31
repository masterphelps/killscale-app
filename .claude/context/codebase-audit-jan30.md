# KillScale Codebase Audit — January 30, 2026

## Cleanup Progress

**Fixed Jan 30–31, 2026 (commit pending):**
- [x] #1 Duplicate migration numbers — renamed to 024b, 025b, 026b
- [x] #2 SQL injection in Google sync — added date regex validation
- [x] #3 `act_` prefix stripping — anchored with `^` regex in 2 files
- [x] #4 Dead components — deleted 5 files (~670 LOC)
- [x] #5 Backup file — deleted `page.old.tsx` (2,146 LOC)
- [x] #6 Empty API dirs — removed 2 empty directories
- [x] #8 Hardcoded Meta API version — extracted to `lib/meta-api.ts`, replaced across 44 files
- [x] #12 Debug console.logs — removed 3 from creative studio page

**Remaining:**
- [ ] #7 God components (deferred — stable in production, high regression risk)
- [ ] #9 Type safety gaps
- [ ] #10 Inconsistent API error formats
- [ ] #11 Silent error swallowing
- [ ] #13 useEffect anti-patterns
- [ ] #14 Missing input validation
- [ ] #15 Database cleanup (LOW)

---

## CRITICAL — Fix Immediately

### 1. Duplicate Migration Numbers (3 pairs) — FIXED
Renamed second file in each pair: `024b_starred_ads.sql`, `025b_starred_ads_creative_id.sql`, `026b_google_campaign_only.sql`

### 2. SQL Injection Risk in Google Sync — FIXED
Added `^\d{4}-\d{2}-\d{2}$` regex validation before GAQL string interpolation in `app/api/google/sync/route.ts`.

### 3. Inconsistent `act_` Prefix Stripping — FIXED
Changed `.replace('act_', '')` to `.replace(/^act_/, '')` in `update-url-tags/route.ts` and `update-ad-creative/route.ts`.

---

## HIGH — Orphaned Dead Code

### 4. Completely Unused Component Files — FIXED (DELETED)
Deleted: `blended-stat-card.tsx`, `metric-tile.tsx`, `duplicate-modal.tsx`, `action-section.tsx`, `andromeda-score-card.tsx`

### 5. Old Backup File — FIXED (DELETED)
Deleted `app/dashboard/campaigns/page.old.tsx` (2,146 LOC).

### 6. Empty API Directories — FIXED (DELETED)
Removed `app/api/creative-studio/creatives/` and `app/api/creative-studio/detail/`.

---

## HIGH — Architecture Debt

### 7. God Components — DEFERRED
Not worth refactoring right now. These files are stable in production and deeply interconnected. Refactoring risks regressions in critical flows (sync, campaign creation, duplication). Only revisit if these files become hard to modify when adding new features.

| File | LOC | Problem |
|------|-----|---------|
| `app/dashboard/page.tsx` | 3,577 | 79 hooks, 21 modal useState calls, data loading + filtering + sync + modals all in one |
| `components/launch-wizard.tsx` | 3,204 | 38-field state object, 4 entity type flows, 13 wizard steps |
| `components/performance-table.tsx` | 2,711 | 27 props, hierarchy rendering + creative loading + bulk selection + sorting |
| `components/inline-duplicate-modal.tsx` | 1,265 | Campaign + AdSet + Ad duplication with full targeting UI inline |

**If revisited, the approach would be:**
- `page.tsx` → extract hooks (`useSync`, `useDashboardFilters`, `useModalManager`), break modals into `<DashboardModals>` wrapper
- `launch-wizard.tsx` → extract each wizard step into own component, pull 38-field state into `useReducer` or context
- `performance-table.tsx` → split hierarchy/creative/bulk into separate hooks, replace 27 props with context
- `inline-duplicate-modal.tsx` → split into CampaignDuplicate, AdSetDuplicate, AdDuplicate components

### 8. Hardcoded Meta API Version — FIXED
Created `lib/meta-api.ts` with `META_API_VERSION` (env var with v21.0 default) and `META_GRAPH_URL` constant. Replaced all 97 occurrences across 44 files. Added `META_API_VERSION` to `.env.example`.

---

## MEDIUM — Code Quality

### 9. Type Safety Gaps
- **11 `as any` assertions** — `app/signup/page.tsx` (window.fbq), `app/dashboard/trends/page.tsx` (Recharts props), `app/api/webhook/route.ts` (Stripe types)
- **26 non-null assertions (`!`)** — risky map access in `insights/page.tsx:325`, `settings/workspaces/page.tsx:2114+`, `page.tsx:2606`
- **43+ `: any` type declarations** across the codebase

### 10. Inconsistent API Error Response Formats
Three different shapes used across endpoints:
```typescript
{ error: 'string' }                          // Most endpoints
{ success: false, error: 'string' }          // Sync endpoints
{ data: {...} }                              // Some data endpoints (no success key)
```

### 11. Silent Error Swallowing
Several API routes catch errors but continue as if nothing happened:
- `app/api/attribution/merge/route.ts:190-204` — pixel/Meta data fetch failures don't fail the request
- `app/api/meta/delete/route.ts:122-127` — local DB cleanup failure after Meta delete succeeds
- `app/api/auth/shopify/callback/route.ts` — webhook registration failures swallowed

### 12. Debug Console Logs in Production Code — FIXED
Removed 3 `console.log` calls from `app/dashboard/creative-studio/page.tsx`.

### 13. useEffect Anti-Patterns in Dashboard
- `app/dashboard/page.tsx:655-699` — 50+ line useEffect body with ref-based guards, accessing state not in dependency array
- `app/dashboard/page.tsx:701-708` — circular state dependency (sets `pendingInitialSync` to null inside effect triggered by `pendingInitialSync`)
- `app/dashboard/page.tsx:482-498` — paired load/save localStorage effects that should be a `useLocalStorage` hook

### 14. Missing Input Validation
- `app/api/meta/create-campaign/route.ts` — no validation on campaign name length, budget min/max, or character limits (Meta enforces these and will return cryptic errors)
- `app/api/meta/update-url-tags/route.ts` — no validation that URL tags are valid format

---

## LOW — Cleanup

### 15. Database Audit Notes
- **Missing `update_updated_at()` trigger function** — referenced in multiple migrations but never created in migrations (likely in schema.sql or created manually)
- **Non-idempotent migrations** — `012_pixel_tables.sql` uses `CREATE TABLE` without `IF NOT EXISTS`
- **Missing RLS policies** on `kiosk_sessions` (no policies at all) and `user_preferences` (no DELETE policy)
- **3 unused views** in `schema.sql`: `campaign_rollups`, `adset_rollups`, `account_totals`
- **Incomplete routes**: `app/api/google/offline/route.ts` is a placeholder with 22 lines of commented-out code and a TODO
- **Workspace invite email** — `app/api/workspace/invite/route.ts:117` has `// TODO: Send email with invite link`

---

## Summary

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 3 | 3 | 0 |
| HIGH | 4 | 3 (+1 deferred) | 0 |
| MEDIUM | 6 | 1 | 5 |
| LOW | 6 | 0 | 6 |
