# Research: Meta Graph API v21.0 — Rate Limits, GET vs POST, and Creative Fetching

**Date:** 2026-01-29
**Status:** Research complete — informs `luminous-conjuring-puffin.md` plan

---

## TL;DR

1. **POST vs GET does NOT reduce rate limit impact.** Meta scores by operation type (read=1pt, write=3pt), not HTTP method. Switching lazy loading from GET to POST would change nothing.
2. **Batch API does NOT reduce rate limit points.** A batch of 50 items counts as 50 calls. It only saves network round-trips.
3. **Field expansion IS the right optimization.** `creative{id,thumbnail_url,video_id}` within a node read counts as 1 call. The main sync already does this correctly.
4. **The real fix is the plan in `luminous-conjuring-puffin.md`** — sync media into DB, read from DB at browse time = zero Meta API calls when browsing Creative Studio.
5. **We should add BUC header monitoring** to detect approaching limits before hitting error 17.

---

## Key Findings

### 1. GET vs POST — No Rate Limit Difference

Meta supports an HTTP method override: you can send `POST` with `method=GET` in the body to perform a read operation via POST. This is a **transport-level convenience**, useful for:
- Avoiding URL length limits (move params to body)
- Keeping access tokens out of URLs/logs
- HTTP clients that don't support all methods

**But it does NOT change rate limit scoring.** Meta's BUC system scores based on the logical operation:
- **Read operation:** 1 point (whether GET or POST-with-method=GET)
- **Write operation:** 3 points

Switching the Creative Studio lazy loader from GET to POST would have zero effect on rate limits.

### 2. Batch API — Network Optimization, NOT Rate Limit Optimization

From Meta's docs:
> "Each call within the batch is counted separately for the purposes of calculating API call limits and resource limits. For example, a batch of 10 API calls will count as 10 calls."

**What batching helps:** Reduces HTTP round-trips (1 TCP connection instead of 50), reduces latency.
**What batching does NOT help:** Rate limit point consumption. 50 items in a batch = 50 points.

Our sync's batch approach (`sync/route.ts` lines 434-438) is correct for **network efficiency** but each sub-request still counts individually against the BUC quota.

### 3. Field Expansion IS the Right Approach

Field expansion combines multiple data requests into a single API call:
```
GET /{ad_id}?fields=name,creative{id,thumbnail_url,video_id}
```
This counts as **1 API call** (though complex expansions may consume more CPU time). The sync already does this:
```
ads?fields=id,name,adset_id,effective_status,creative{id,thumbnail_url,image_url,video_id,image_hash}&thumbnail_width=1080&thumbnail_height=1080
```
This is the most efficient pattern — zero extra API calls for creative metadata.

### 4. BUC (Business Use Case) Rate Limit System

Rate limits are tracked per ad account in separate buckets:

| BUC Type | What It Covers | Standard Quota |
|----------|----------------|----------------|
| `ads_insights` | `/insights` endpoints | 190,000 + 400 × Active Ads |
| `ads_management` | CRUD on campaigns/adsets/ads + creative fetches | 100,000 + 40 × Active Ads |
| `custom_audience` | Audience operations | Separate |

**Key insight:** Creative fetches (`/adcreative`, `/adimages`, `/advideos`) fall under `ads_management`, which has a **lower multiplier** (40× vs 400× per active ad). This is why the Creative Studio lazy loader hits limits faster than expected — it's competing with a smaller quota bucket.

**Scoring:**
- Read call: 1 point
- Write call: 3 points
- Decay window: 300 seconds (5 minutes)
- Standard tier block: ~60 seconds recovery
- Development tier: 60 points / 300s (very low)
- Standard tier: 9,000 points / 300s

### 5. Error Code 17 Details

| Code | Name | Meaning |
|------|------|---------|
| 17 | `API_EC_USER_TOO_MANY_CALLS` | User request limit reached |
| 18 | `API_EC_REQUEST_RESOURCES_EXCEEDED` | CPU/time resource limits |
| 4 | `API_TOO_MANY_CALLS` | Application-level rate limit |
| 32 | `API_EC_INDIVIDUAL_ACCOUNT_LIMIT` | Individual account limit |
| 80004 | — | Marketing API rate limit |

Recovery time: 60s (standard tier), up to 1 hour for heavy violations.

### 6. Rate Limit Headers We Should Monitor

Every Meta API response includes:
```
X-Business-Use-Case-Usage: {
  "ad_account_id": [{
    "type": "ads_management",
    "call_count": 28,        // percentage 0-100
    "total_cputime": 15,     // percentage 0-100
    "total_time": 20,        // percentage 0-100
    "estimated_time_to_regain_access": 0  // minutes
  }]
}
```
Throttling begins when ANY of `call_count`, `total_cputime`, or `total_time` reaches **100**.

**Best practice:** Start backing off when any value exceeds **85%**.

**Current codebase gap:** We only check `X-Business-Use-Case-Usage` in `sync/route.ts` via Retry-After. We do NOT proactively monitor the BUC headers anywhere. The creative lazy loader has no rate limit awareness at all.

---

## Current Codebase Analysis

### What's Working (Low Risk)

| Pattern | File | Why It's Fine |
|---------|------|---------------|
| Main sync batch | `sync/route.ts` L434 | Field expansion gets creative data at zero extra cost |
| UTM batch (50/batch, 1s delay) | `sync-utm-status/route.ts` | Proper batching + delay |
| Creative Studio browse | `creative-studio/creatives/route.ts` | DB reads only, zero API calls |
| On-demand video source | `creative-studio/video-source/route.ts` | Single call on user click |

### What's Broken (High Risk)

| Pattern | File | Problem |
|---------|------|---------|
| Creative lazy loader | `creative-studio/page.tsx` L64-116 | 100+ uncached creatives → 60+ API calls in rapid succession |
| No BUC header monitoring | All API routes | Can't detect approaching limits |
| No retry on creative fetch | `meta/creative/route.ts` | No error 17 handling |

### The Lazy Loader Problem in Detail

`creative-studio/page.tsx` fires on mount:
1. Filters all creatives with no `imageUrl` (= uncached)
2. Batches in groups of 3 with 500ms delay between batches
3. Each creative makes 1 call to `/api/meta/creative`
4. That endpoint makes 1 GET to `/{creative_id}?fields=...`
5. If video detected, makes a **2nd call** for video details

For an account with 100 uncached creatives (50 videos):
- 100 creative fetches + 50 video detail fetches = **150 Meta API calls**
- All under `ads_management` bucket (lower quota)
- 500ms delays are insufficient — completes in ~17s but burns through quota
- No BUC header checking → no awareness of approaching limits

---

## Recommendations

### Fix 1: Implement `luminous-conjuring-puffin.md` Plan (Primary)

The "Sync Once, Read Forever" approach is the correct architecture:
- Sync `adimages` + `advideos` into `media_library` table during main sync
- Creative Studio reads from DB (zero Meta API calls at browse time)
- Video source still fetched on-demand (correct — URLs expire)

This eliminates the lazy loader entirely and the rate limit problem with it.

### Fix 2: Add BUC Header Monitoring (Secondary)

Add a utility that reads `X-Business-Use-Case-Usage` from responses and:
- Logs current usage percentages
- Pauses/backs off when any value exceeds 85%
- Returns `estimated_time_to_regain_access` when throttled

This protects ALL Meta API calls, not just Creative Studio.

### Fix 3: Until Fix 1 Ships — Add Retry Logic to Creative Loader

If the lazy loader must stay temporarily:
- Check `X-Business-Use-Case-Usage` after each batch
- Back off when any metric > 85%
- Handle error 17 with exponential backoff
- Consider increasing batch delay from 500ms to 2000ms

### What NOT To Do

| Bad Idea | Why |
|----------|-----|
| Switch GET to POST | Zero rate limit benefit — only changes transport |
| Increase batch size | More concurrent calls = faster quota burn |
| Remove sync delays | Will immediately trigger error 17 on large accounts |
| Prefetch video source URLs | They expire — wastes quota for URLs that go stale |
| In-memory cache of Meta API responses | Serves stale data when creative changes |

---

## Budget Change Hard Cap (Separate from Rate Limits)

Independent of BUC rate limits, Meta enforces:
- **Ad set budget changes:** 4 per hour per ad set (exceeding = 1 hour lockout for that ad set)
- **Account spending limit:** 10 changes per day

This is relevant to `app/api/meta/bulk-budget-scale/route.ts`. These limits cannot be avoided with batching or delays.

---

## Meta API Version Notes

- Currently using **v21.0** (correct as of Jan 2026)
- Meta sunsets API versions ~2 years after release
- v18.0 was sunset Jan 2026
- No breaking changes in v21.0 related to GET vs POST or rate limit calculation
- Rate limit structure (BUC system) has been stable since v13+

---

## Sources

- Meta Developer Docs: Graph API rate limiting
- Meta Developer Docs: Marketing API rate limits
- Meta Developer Docs: Batch API documentation
- Fivetran: Facebook API Rate Limit troubleshooting guide
- Rollout.com: Facebook Marketing API Essentials
- AdManage: Meta Ads API Complete Guide
- GitHub phwd/fbec: Facebook API error code reference
