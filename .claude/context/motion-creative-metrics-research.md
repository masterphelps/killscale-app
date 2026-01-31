# Research: Motion App Creative Metrics + AI Creative Analysis

**Date:** 2026-01-29
**Status:** Research complete — informs Creative Studio feature roadmap

---

## TL;DR

1. **Motion's core creative metrics** (Thumbstop Rate, Hold Rate, etc.) are all calculated from Meta API fields we already have access to but **don't currently fetch** in our sync. Adding them requires expanding our insights `fields` parameter — zero extra API calls.
2. **Thumbstop Rate** = 3-second video views / impressions. The 3-second views come from the `actions` array (`action_type: "video_view"`), not a standalone field.
3. **Hold Rate** = ThruPlays / 3-second video views. ThruPlays come from `video_thruplay_watched_actions`.
4. **AI creative analysis is feasible today** using Claude's vision API on thumbnails we already store. Full video analysis requires frame extraction (ffmpeg) or switching to Gemini for native video input.
5. **The unique KillScale angle**: Tie visual creative analysis to Andromeda Entity ID prediction — no competitor does this. "These 5 ads look the same to Andromeda, that's why your CPMs are rising."

---

## Part 1: Motion's Complete Metric List

Motion organizes metrics around a **5-stage customer journey framework**:

### Stage 1: Attention Capture (Hooking)

| Metric | Formula | Meta API Fields |
|--------|---------|-----------------|
| **Thumbstop Rate (Hook Rate)** | 3-sec video views / impressions × 100 | `actions[video_view]` / `impressions` |
| **1st Frame Retention** | Video plays / impressions × 100 | `video_play_actions` / `impressions` |

**Benchmarks (Thumbstop):** <25% needs work, 25-35% decent, 35%+ strong, 50%+ outstanding

### Stage 2: Attention Hold (Watching)

| Metric | Formula | Meta API Fields |
|--------|---------|-----------------|
| **Hold Rate** | ThruPlays / 3-sec video views × 100 | `video_thruplay_watched_actions` / `actions[video_view]` |
| **ThruPlay Rate** | ThruPlays / impressions × 100 | `video_thruplay_watched_actions` / `impressions` |
| **Video Completion Rate** | 100% views / impressions × 100 | `video_p100_watched_actions` / `impressions` |
| **Avg Watch Time** | Direct from API | `video_avg_time_watched_actions` |

**Benchmarks (Hold Rate):** <20% weak, 20% benchmark, 30% great, 35%+ outstanding

### Stage 3: Clicking (Intent)

| Metric | Formula | Meta API Fields |
|--------|---------|-----------------|
| **CTR (All)** | All clicks / impressions × 100 | `clicks` / `impressions` |
| **CTR (Link)** | Link clicks / impressions × 100 | `outbound_clicks` / `impressions` |
| **Thumbstop CTR** | Link clicks / 3-sec video views × 100 | `outbound_clicks` / `actions[video_view]` |
| **CPC (Link)** | Spend / link clicks | `cost_per_inline_link_click` |

### Stage 4: Site Engagement (requires GA4 — Motion feature, not Meta)

| Metric | Source |
|--------|--------|
| Bounce Rate | GA4 integration |
| Time on Site | GA4 integration |
| Click-to-Cart | GA4 / custom conversion |

### Stage 5: Conversion

| Metric | Formula | Meta API Fields |
|--------|---------|-----------------|
| **CVR** | Purchases / link clicks × 100 | `actions[purchase]` / `outbound_clicks` |
| **CPA** | Spend / conversions | `spend` / `actions[purchase]` |
| **ROAS** | Revenue / spend | `action_values[purchase]` / `spend` |
| **AOV** | Revenue / purchases | `action_values[purchase]` / `actions[purchase]` |

### Motion's Composite Scores (0-100)

Motion rolls raw metrics into **4 proprietary scores**:

| Score | What It Measures | Applies To |
|-------|-----------------|------------|
| **Hook Score** | Can the ad stop the scroll? | Video only |
| **Watch Score** | Does content sustain attention? | Video only |
| **Click Score** | Does the ad drive clicks? | Video + Static |
| **Convert Score** | Does it drive conversions? | Video + Static |

- Minimum $50 spend before scores calculate
- Benchmarked per-campaign (not account-wide)
- Exact weightings are proprietary (not published)

### Motion's AI Features

| Feature | What It Does |
|---------|-------------|
| **AI Tagging** | Auto-tags creatives across 8 categories (hook type, format, audience, offer, etc.) |
| **Agent Chat** | Conversational AI for asking questions about creative data |
| **AI Recommendations** | Data-backed suggestions for what to iterate on |
| **AI Tasks** | One-click creative diversity reviews and gap analysis |

### Motion's 5 Report Types

1. **Top Performing** — best creatives by any metric
2. **Comparative Analysis** — UGC vs produced, format A vs B, etc.
3. **Launch Analysis** — which new tests are scaling vs declining
4. **Winning Combinations** — cross-tabulate dimensions (creator × offer = best ROAS)
5. **Creative Highlights** — weekly leaderboard, shareable as GIFs

---

## Part 2: Meta API Fields We Need to Add

### Currently Fetched (sync/route.ts line 323-335)

```typescript
const fields = [
  'campaign_name', 'campaign_id',
  'adset_name', 'adset_id',
  'ad_name', 'ad_id',
  'impressions', 'clicks',
  'spend', 'actions', 'action_values',
].join(',')
```

### Fields to Add for Creative Analytics

**Priority 1 — Unlocks Thumbstop + Hold Rate (no extra API calls):**
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

**Priority 2 — Retention Curve (heavier payload, consider fetching separately):**
```
video_play_curve_actions              # second-by-second retention array
video_play_retention_0_to_15s_actions # first 15 seconds detail
video_play_retention_20_to_60s_actions
```

**Priority 3 — Additional (useful but not critical):**
```
video_continuous_2_sec_watched_actions
cost_per_2_sec_continuous_video_view
video_30_sec_watched_actions
reach
frequency
cpm
cpc
ctr
```

### Important: 3-Second Video Views

3-second views are NOT a standalone field. They come from the `actions` array:
```json
{
  "actions": [
    { "action_type": "video_view", "value": "1234" }
  ]
}
```

We already fetch `actions` — we just need to parse out `video_view` from the array. This means **Thumbstop Rate can be calculated from data we already have** if the `video_view` action type is present in the response.

### Deprecated Fields (Do NOT Use)

| Field | Status |
|-------|--------|
| `video_10_sec_watched_actions` | Deprecated Jan 2026 — returns empty |
| `video_15_sec_watched_actions` | Deprecated — returns empty, use `video_thruplay_watched_actions` |
| `unique_video_continuous_2_sec_watched_actions` | Deprecated Oct 2024 |
| `unique_video_view_15_sec` | Deprecated Oct 2024 |
| `video_complete_watched_actions` | Deprecated — use `video_p100_watched_actions` |
| 7d/28d view-through attribution windows | Removed Jan 12, 2026 |

### Database Impact

The `ad_data` table will need new columns for the video metrics. These are per-ad, per-date metrics (same grain as existing data). Options:
1. **Add columns to `ad_data`** — simple, matches existing pattern
2. **Separate `ad_video_metrics` table** — cleaner but requires JOINs
3. **JSONB column on `ad_data`** — flexible, no migration for new fields

Recommendation: Add columns to `ad_data` to match existing pattern. The video fields are stable (not frequently changing) and benefit from direct querying.

---

## Part 3: Calculated Metrics (Our Version)

### KillScale Creative Metrics (matching Motion + our own)

```typescript
// === ATTENTION (Hook) ===
// Thumbstop Rate: Did the creative stop the scroll?
thumbstopRate = (videoViews3s / impressions) * 100

// 1st Frame Retention: Did the video even start playing?
firstFrameRetention = (videoPlays / impressions) * 100

// === RETENTION (Hold) ===
// Hold Rate: Of those hooked, how many stayed?
holdRate = (thruPlays / videoViews3s) * 100

// Completion Rate: How many watched the whole thing?
completionRate = (videoP100 / impressions) * 100

// Average Watch Time: How long do people watch?
avgWatchTime = videoAvgTimeWatched // seconds

// Retention Curve: Second-by-second dropoff
retentionCurve = videoPlayCurveActions // array

// === ENGAGEMENT (Click) ===
// Thumbstop CTR: Of those hooked, how many clicked?
thumbstopCTR = (outboundClicks / videoViews3s) * 100

// Standard CTR
ctrLink = (outboundClicks / impressions) * 100

// === CONVERSION ===
// CVR: Of clickers, how many converted?
cvr = (purchases / outboundClicks) * 100

// === COST EFFICIENCY ===
costPerThruPlay = spend / thruPlays
costPer3sView = spend / videoViews3s  // custom calc

// === KILLSCALE EXCLUSIVE ===
// Creative Fatigue (already have in health-score.ts)
// Andromeda Entity ID Similarity (NEW — via AI analysis)
// True ROAS with affiliate costs (already have via UpPromote)
```

### KillScale Composite Scores (our version of Motion's 4 scores)

| Score | Signals | Weight Ideas |
|-------|---------|-------------|
| **Hook Score** | Thumbstop rate, 1st frame retention | Video only |
| **Hold Score** | Hold rate, completion rate, avg watch time | Video only |
| **Click Score** | CTR (link), thumbstop CTR, CPC trend | Video + Static |
| **Convert Score** | CVR, CPA, ROAS | Video + Static |
| **Fatigue Score** | CPC trend, frequency, CTR decline (already in health-score.ts) | Video + Static |

---

## Part 4: AI Creative Analysis ("KillScale-meda")

### What Meta's Andromeda Actually Analyzes

Andromeda uses computer vision + NLP + audio analysis on creatives:
- **Visual**: Colors, faces, text overlays, emotion, offers, visual style
- **Copy**: Ad text analysis
- **Audio**: For video ads
- **Semantic signatures**: Deep understanding of what the ad is "about"

It groups visually similar ads into **Entity IDs**. If you have 10 ads with the same footage but different text overlays, Andromeda sees ONE creative concept. High similarity = higher CPMs (Andromeda penalizes repetitive content).

### Technical Approach Options

#### Option A: Thumbnail Analysis (MVP — ships fast, nearly free)

```
Thumbnails already in Supabase (from sync)
  → Send to Claude Sonnet via existing API key
  → Structured JSON response
  → Store in Supabase
```

**Cost:** ~$0.005 per creative, ~$2.50 for 500 ads. Essentially free.

**What it catches:** Hook type, format classification, text overlays (OCR), product visibility, CTA presence, color palette, brand consistency, Andromeda similarity clustering.

**What it misses:** Video pacing, audio, temporal hooks, scene transitions.

**Infrastructure needed:** Nothing new — thumbnails are already stored, Claude API key already configured.

#### Option B: Frame Extraction (Full Video — Pro feature)

```
Video source URL (fetched on-demand from Meta)
  → Server-side ffmpeg frame extraction (e.g., 1 frame/second)
  → Resize to 1568px max
  → Send 10-20 key frames to Claude Sonnet
  → Structured JSON response
  → Store in Supabase
```

**Cost:** ~$0.05-$0.10 per video ad. ~$25-$50 for 500 video ads.

**What it catches:** Everything in Option A + hook quality across frames, scene structure, pacing, visual transitions, CTA timing.

**What it misses:** Audio (Claude can't process audio).

**Infrastructure needed:** ffmpeg on server (or use a service like AWS MediaConvert). Video URLs expire so must be fetched on-demand.

**Claude limits:** Up to 100 images per API request. A 30-second video at 1fps = 30 frames = well within limits.

#### Option C: Gemini for Video + Claude for Strategy (Maximum capability)

```
Video URL → Gemini API (native video, up to 2 hours)
  → Gemini extracts visual + audio + temporal analysis
  → Pass to Claude for strategic recommendations + Andromeda context
  → Store in Supabase
```

**Cost:** Higher (two API providers). Worth it only if audio analysis is critical.

**What it catches:** Everything including audio, spoken words, music, pacing.

**Infrastructure needed:** Google Cloud API key, Gemini API integration.

### Claude Vision Specs (for reference)

- Max 100 images per request (20 on claude.ai web)
- Images via base64, URL, or Files API
- Max 5MB per image, 8000×8000px hard limit
- Optimal: 1568px on long edge (~1,600 tokens per image)
- Token formula: `(width × height) / 750`
- No native video support — must extract frames
- No audio support

### Recommended MVP Implementation

**Phase 1: Thumbnail Analysis (Launch tier)**
- Analyze creative thumbnails already in DB
- Return: hook type, format, text overlays, product visibility, CTA, color palette
- Cost: negligible (~$0.005/creative)
- UI: New tab in Creative Studio

**Phase 2: Video Frame Analysis (Scale/Pro tier)**
- Extract 10-15 key frames via ffmpeg
- Return: scene structure, hook quality, pacing, visual transitions
- Cost: ~$0.05-$0.10/video
- UI: Deep-dive modal in Creative Studio

**Phase 3: Andromeda Similarity Clustering**
- Compare visual analysis across all creatives in account
- Predict which ads Andromeda groups as same Entity ID
- Surface: "These 5 ads look the same to Andromeda — diversify"
- Cross-reference with existing Andromeda Score (creative consolidation factor)

**Phase 4: Performance-Linked Insights**
- Correlate visual elements with performance data
- "Ads with product-first hooks have 2.3× higher thumbstop rate in your account"
- "UGC format outperforms studio by 40% on ROAS"
- Winning pattern extraction + creative brief generation

### The Unique KillScale Angle (What No Competitor Has)

1. **Andromeda-aware creative analysis** — "Andromeda sees these as the same creative, that's why your CPMs are rising"
2. **Creative + Account Structure** — Tie visual analysis to existing Andromeda Score (CBO adoption, ad set count, etc.)
3. **Creative + Fatigue** — Cross-reference visual similarity with Health Score fatigue detection
4. **Creative + True ROAS** — Visual analysis correlated with Shopify-attributed revenue (not Meta's inflated numbers)
5. **Creative + Verdict System** — "Your SCALE verdict ads share these visual patterns: [...]"

No other tool combines creative visual analysis + Andromeda structural audit + multi-source attribution. Motion has the best creative analytics but zero account structure awareness. Andromeda Score tools have no visual analysis. KillScale can be both.

### Entity-Aware Performance Sets (Key Feature Idea)

The existing **Performance Set** flow (star winning ads → build CBO campaign) can be made Andromeda-optimal by integrating Entity ID clustering:

**Problem it solves:** A user stars 8 winning ads and builds a Performance Set. But 5 of those 8 ads are visually similar (same footage, different text overlays). Andromeda clusters them into ~2 Entity IDs, meaning the ad set effectively has 2 creative concepts, not 8. CPMs rise because Andromeda sees low diversity.

**Entity-Aware Build Flow:**

```
1. User stars ads from Performance Table
2. Opens StarredAdsPopover → clicks "Build Performance Set"
3. AI analyzes all starred ad thumbnails/frames
4. Groups starred ads into predicted Entity ID clusters
5. UI shows clusters visually:
   ┌─────────────────────────────────────────────┐
   │ Entity Cluster A (3 ads — UGC testimonial)  │
   │  [thumb1] [thumb2] [thumb3]                 │
   │  ★ Best performer: thumb1 (3.2 ROAS)        │
   ├─────────────────────────────────────────────┤
   │ Entity Cluster B (2 ads — product demo)     │
   │  [thumb4] [thumb5]                          │
   │  ★ Best performer: thumb4 (2.8 ROAS)        │
   ├─────────────────────────────────────────────┤
   │ Entity Cluster C (1 ad — lifestyle)         │
   │  [thumb6]                                   │
   ├─────────────────────────────────────────────┤
   │ Entity Cluster D (2 ads — founder story)    │
   │  [thumb7] [thumb8]                          │
   │  ★ Best performer: thumb7 (4.1 ROAS)        │
   └─────────────────────────────────────────────┘

   ⚠ Warning: Clusters A has 3 similar ads.
     Andromeda will treat them as ~1 creative concept.

   [Smart Build: Pick top performer per cluster]
   [Manual: Choose your own]
```

6. **Smart Build** auto-selects the top performer from each cluster
   → Result: 4 ads from 4 distinct Entity IDs = maximum Andromeda diversity
7. **Manual mode** lets user pick freely but warns when selecting
   multiple ads from the same cluster

**Why this matters:**
- Andromeda's creative-as-targeting means each distinct Entity ID can find its own audience segment
- Duplicate Entity IDs compete with each other in the auction (cannibalization)
- A Performance Set with 1 ad per Entity ID gives Andromeda maximum signal diversity
- This is the logical extension of the Andromeda Score's "creative consolidation" factor — but precise instead of heuristic

**Implementation notes:**
- Clustering happens at AI analysis time (thumbnail comparison), stored in Supabase
- The StarredAdsPopover already shows all starred ads — add cluster badges/grouping
- Launch Wizard Performance Set path already exists — add cluster warnings to the review step
- The Andromeda Score's creative consolidation factor (25% weight) could use actual Entity ID clusters instead of ad count heuristics

**Files that would change:**
- `components/starred-ads-popover.tsx` — Add cluster grouping UI + Smart Build button
- `components/launch-wizard.tsx` — Add cluster warning in Performance Set review step
- `lib/andromeda-score.ts` — Optionally replace creative consolidation heuristic with Entity ID cluster count
- New: `app/api/creative-studio/analyze/route.ts` — AI analysis endpoint
- New: `lib/entity-clustering.ts` — Clustering logic + similarity scoring

---

## Part 5: Competitive Landscape

| Tool | Creative Metrics | AI Analysis | Andromeda Awareness | Price |
|------|-----------------|-------------|--------------------|----|
| **Motion** | Full (Hook, Hold, Click, Convert scores) | AI tagging, agent chat, recommendations | No structural audit | Premium |
| **BestEver** | Frame-by-frame scoring | 4-scene structure detection, fatigue | No | Mid-range |
| **GoMarble** | Basic scoring | Visual + copy + hook analysis | No | Free tool |
| **AdSkate** | Computer vision correlation | Audience prediction from visuals | No | Enterprise |
| **KillScale (current)** | Fatigue detection only | Andromeda AI chat, health recs | Yes (structure only) | $29-99 |
| **KillScale (proposed)** | Full Motion-equivalent + fatigue | Visual analysis + Andromeda similarity | Yes (structure + visual) | $29-99 |

---

## Action Items

1. **Immediate (no new infra):** Check if `actions[video_view]` is already in our synced data — if so, we can calculate Thumbstop Rate today
2. **Short-term:** Add video metric fields to sync insights query + new `ad_data` columns
3. **Medium-term:** Build calculated metrics (thumbstop, hold rate, etc.) into Creative Studio
4. **Medium-term:** Implement thumbnail-based AI analysis (MVP, nearly free)
5. **Longer-term:** Frame extraction for video analysis, Andromeda similarity clustering
6. **Longer-term:** Performance-linked creative insights ("ads with X pattern perform Y% better")

---

## Sources

- Motion Help Center: Metrics for Meta and TikTok
- Motion Help Center: Metrics Cheat Sheet
- Motion Blog: Key Creative Performance Metrics
- Motion: AI Tagging release notes
- Motion: LLM Info page
- Meta Graph API: Ads Insights field reference
- Facebook Python Business SDK: adsinsights.py (authoritative field list)
- Fivetran: How to get 3-second video views
- Emplifi: Facebook Metric Deprecation January 2026
- Vaizle: Hook Rate and Hold Rate guide
- Claude API: Vision documentation
- Google Gemini: Video Understanding docs
- Winterberry Group: Creative Intelligence market report (Jan 2026)
- Jon Loomer: Meta Andromeda and Creative Diversification
- MTM Agency: Andromeda October 2025 Update
