# Creative Studio: Next Steps Roadmap

**Date:** 2026-01-29
**Status:** Active — reference this file when starting new sessions

---

## Completed This Session

- [x] Media Library storage architecture (`luminous-conjuring-puffin.md`) — full video/image download to Supabase Storage
- [x] Media tab rewrite — inventory view from `media_library`, not `ad_data`
- [x] Creative video derivative fallback — creatives now resolve to original video via `creative_id` linkage
- [x] Research: Meta API v21 rate limits, POST vs GET (no difference), BUC system
- [x] Research: Motion app metrics, AI creative analysis feasibility

## Next Steps (Priority Order)

### 1. Add Video Metrics to Sync (Zero Extra API Calls)

**What:** Add video performance fields to the insights query in `app/api/meta/sync/route.ts` (line ~323). These fields come in the same API response — no additional calls needed.

**Fields to add:**
```
video_thruplay_watched_actions
video_p25_watched_actions
video_p50_watched_actions
video_p75_watched_actions
video_p95_watched_actions
video_p100_watched_actions
video_avg_time_watched_actions
video_play_actions
cost_per_thruplay
outbound_clicks
inline_link_click_ctr
cost_per_inline_link_click
```

**Also need:** New columns in `ad_data` table (migration), parsing the `actions` array for `video_view` (3-second views — already fetched but not parsed).

**Unlocks:** Thumbstop Rate, Hold Rate, Completion Rate, ThruPlay Rate, Thumbstop CTR

**Formulas:**
- Thumbstop Rate = `actions[video_view]` / impressions × 100
- Hold Rate = `video_thruplay_watched_actions` / `actions[video_view]` × 100
- Completion Rate = `video_p100_watched_actions` / impressions × 100

**Research:** `.claude/context/motion-creative-metrics-research.md` (Part 2)

### 2. Display Creative Metrics in Creative Studio

**What:** Show Thumbstop Rate, Hold Rate, Completion Rate on creative cards and in the detail modal. Add Motion-style composite scores (Hook Score, Hold Score, Click Score, Convert Score).

**Research:** `.claude/context/motion-creative-metrics-research.md` (Part 3)

### 3. AI Thumbnail Analysis (MVP — Nearly Free)

**What:** Send creative thumbnails (already in Supabase Storage) to Claude Sonnet via existing API key. Return structured analysis: hook type, format classification, text overlay OCR, product visibility, CTA presence, color palette.

**Cost:** ~$0.005 per creative, ~$2.50 for 500 ads.

**New endpoint:** `app/api/creative-studio/analyze/route.ts`
**New table:** `creative_analysis` (store AI results)

**Research:** `.claude/context/motion-creative-metrics-research.md` (Part 4)

### 4. Andromeda Entity ID Clustering

**What:** Use AI visual analysis to predict which creatives Andromeda groups as the same Entity ID. Surface "these 5 ads look the same to Andromeda" warnings.

**Unique angle:** No competitor does this. Ties into existing Andromeda Score's creative consolidation factor (25% weight in `lib/andromeda-score.ts`).

**Research:** `.claude/context/motion-creative-metrics-research.md` (Part 4, "Entity-Aware Performance Sets" section)

### 5. Entity-Aware Performance Sets

**What:** When building a Performance Set from starred ads, show Entity ID clusters and warn about selecting multiple ads from the same cluster. "Smart Build" auto-picks top performer per cluster.

**Files:** `components/starred-ads-popover.tsx`, `components/launch-wizard.tsx`

**Research:** `.claude/context/motion-creative-metrics-research.md` ("Entity-Aware Performance Sets" section has full UI wireframe)

### 6. BUC Header Monitoring

**What:** Read `X-Business-Use-Case-Usage` headers from Meta API responses. Log usage percentages, back off at 85%, respect `estimated_time_to_regain_access`.

**Research:** `.claude/context/meta-api-v21-rate-limits-research.md` (section 6)

### 7. Auto-Trigger Media Sync from Main Sync

**What:** Currently media sync requires manual "Sync Media" button. Should fire-and-forget from main sync (like alert generation). Then chain download phase automatically.

**File:** `app/api/meta/sync/route.ts` (~line 989, after ad_data saved)

---

## Key Reference Files

| File | What |
|------|------|
| `.claude/context/meta-api-v21-rate-limits-research.md` | Rate limits, BUC system, POST vs GET, batch API |
| `.claude/context/motion-creative-metrics-research.md` | Motion metrics, video fields, AI analysis, entity clustering |
| `~/.claude/plans/luminous-conjuring-puffin.md` | Media storage plan (completed) |
| `~/.claude/plans/media-tab-inventory-rewrite.md` | Media tab rewrite (completed) |
| `~/.claude/plans/creative-video-id-fallback.md` | Derivative→original fix (completed) |

## Key Findings to Remember

- **POST vs GET makes zero difference for Meta rate limits** — scoring is by operation type (read=1pt, write=3pt), not HTTP method
- **Batch API counts each item individually** — 50 items in a batch = 50 calls against quota
- **Field expansion IS efficient** — adding fields to existing query = 0 extra calls
- **Creative fetches fall under `ads_management` BUC** — lower quota (100K + 40× active ads) than insights (190K + 400×)
- **Meta video IDs are derivatives** — same video gets different IDs per placement. `advideos` endpoint returns only originals. `media_library` has originals, `ad_data` has derivatives.
- **3-second video views** come from `actions` array (`action_type: "video_view"`), not a standalone field — we already fetch `actions`
- **Deprecated (don't use):** `video_10_sec_watched_actions` (Jan 2026), `video_15_sec_watched_actions`, 7d/28d view-through windows
