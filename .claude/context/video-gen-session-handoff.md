# Video Generation + Credits + Remotion Editor — Session Handoff

## Branch: `video`
## Build: CLEAN (all phases 1-5 pass `npm run build`)
## Status: ALL PHASES COMPLETE

---

## What's DONE:

### Phase 1: Unified Credit System ✅
- **Migration**: `supabase/migrations/052_unified_credits.sql` — added `credit_cost`, `generation_label` to `ai_generation_usage`, created `ai_credit_purchases` table
- **API**: `app/api/ai/usage/route.ts` — rewritten for credit-based (SUM of credit_cost), plan limits (Pro/Scale/Launch=500, Trial=25), purchased credits, `?includeHistory=true` param
- **API**: `app/api/credits/purchase/route.ts` — NEW, Stripe Checkout for credit packs (100/$25, 250/$50, 500/$100, 1000/$175)
- **API**: `app/api/webhook/route.ts` — added `checkout.session.completed` handler for `type: 'credit_pack'` metadata
- **API**: `app/api/creative-studio/generate-image/route.ts` — credit check uses SUM(credit_cost), inserts with `credit_cost: 5, generation_label`
- **Component**: `components/creative-studio/credits-gauge.tsx` — NEW, pill shows remaining/total, click opens buy modal
- **Layout**: `app/dashboard/creative-studio/layout.tsx` — CreditsGauge added to header bar
- **UI**: `ad-studio/page.tsx` — credit badge shows "X credits remaining — Image (5 cr) · Video (50 cr)", disabled at <5 remaining
- **UI**: `ai-tasks/page.tsx` — same credit updates
- **UI**: `settings/page.tsx` — credit bar + "See Usage" expandable log table + purchase info

### Phase 5: Image Persistence Fix ✅
- **API**: `save-generated-image/route.ts` — added retry logic (3 attempts with backoff) for both storage-only and full-save Supabase uploads

### Phase 2: Video Generation Jobs System ✅
- **Migration**: `supabase/migrations/053_video_generation.sql` — `video_generation_jobs` table, `video_overlays` table, `source_type` column on `media_library`
- **API**: `app/api/creative-studio/generate-video/route.ts` — NEW, credit check (50cr), Sora 2 Pro via OpenAI SDK, creates job record, returns jobId
- **API**: `app/api/creative-studio/video-status/route.ts` — NEW, GET polls Sora status + downloads to Supabase on complete, POST lists all jobs for user
- **Remotion**: `remotion/types.ts` — all types (OverlayConfig, VideoJob, VIDEO_STYLES, VideoStyle, PromptSections, etc.)
- **Remotion**: `remotion/AdOverlay.tsx` — full composition with HookText, Caption, CTASection, GraphicItem components, 4 style presets (capcut/minimal/bold/clean), spring/fade/slide animations
- **Remotion**: `remotion/Root.tsx` — 3 compositions (9:16, 1:1, 16:9), uses `as any` cast for strict typing
- **Remotion**: `remotion/index.ts` — registerRoot
- **Lib**: `lib/video-prompt-templates.ts` — 8 video style prompt templates + `generatePromptSections()` + `buildSoraPrompt()`
- **Packages installed**: `openai`, `sharp`, `@types/sharp`, `remotion`, `@remotion/cli`, `@remotion/player`, `@remotion/transitions`, `@remotion/renderer` (all 4.0.242)

### Phase 3: UI Pages ✅
- **Component**: `components/creative-studio/video-style-picker.tsx` — NEW, 2x4 grid of style cards
- **Component**: `components/creative-studio/prompt-builder.tsx` — NEW, 5-section editable prompt form
- **Component**: `components/creative-studio/video-job-card.tsx` — NEW, status display with video player, progress bar, edit/save buttons, compact mode
- **Page**: `app/dashboard/creative-studio/video-studio/page.tsx` — NEW, 3-step wizard (Input → Style → Generate)
- **Page**: `app/dashboard/creative-studio/video-editor/page.tsx` — NEW, Remotion Player + overlay control panels + playback controls + mini timeline
- **Sidebar**: `components/sidebar.tsx` — added Video Studio with `Video` icon and `isNew: true`
- **API**: `app/api/creative-studio/render-overlay/route.ts` — NEW (MVP), saves overlay config to `video_overlays` table + updates `video_generation_jobs.overlay_config`
- **Ad Studio video tab** (`ad-studio/page.tsx`):
  - Image|Video toggle per generated ad card in Step 3
  - Video mode: style selector (8 VIDEO_STYLES) + "Generate Video (50 credits)" button
  - Calls `/api/creative-studio/generate-video` with prompt from `generatePromptSections()` + `buildSoraPrompt()`
  - Inline VideoJobCard when generating/complete, polls every 5s
  - "Edit Video" routes to `/dashboard/creative-studio/video-editor?jobId=X`
- **AI Tasks video jobs** (`ai-tasks/page.tsx`):
  - "Video Generation" collapsible section between Ad Generation and Video Analysis
  - Compact VideoJobCards for all user's video jobs, polls every 5s
  - "Edit Video" navigates to video editor

### Phase 4: Remotion Video Editor Polish ✅
- **API**: `app/api/creative-studio/overlay-versions/route.ts` — NEW, GET fetches all overlay versions for a job (version history), verifies ownership
- **API**: `app/api/creative-studio/save-video-to-library/route.ts` — NEW, POST saves completed video to `media_library` with `source_type: 'ai_video'`, upsert-safe
- **Video Editor** (`video-editor/page.tsx`) enhancements:
  - **Version History panel** — collapsible panel listing all saved overlay versions with timestamp + config summary (Hook/Captions/CTA). Click version to load its overlay_config. "Current (unsaved)" option at top.
  - **Save to Library button** — green "Save to Library" button in top bar, calls `/api/creative-studio/save-video-to-library`, shows checkmark when saved
  - **Save Overlay** — refreshes version list after saving, sets active version indicator
  - **Improved top bar** — Reset All + Save to Library + Save Overlay buttons

---

## Key Architecture Decisions:
- Videos use async job pattern: POST creates job → poll GET for status → video stored in Supabase
- Credits: images = 5cr, videos = 50cr, refund on failure (negative credit_cost row)
- Remotion Player renders overlays in real-time in browser (no server needed for preview)
- Overlay config is JSON stored in `video_generation_jobs.overlay_config` AND versioned in `video_overlays`
- Non-destructive editing: original video + overlay config = rendered output
- OpenAI SDK v6.18.0 — `openai.videos` uses `as any` casts (types incomplete), content download uses raw `fetch()` to `/v1/videos/{id}/content`
- Save to Library inserts raw video URL into media_library (overlays are preview-only via Remotion Player until server render is available)

## Stretch Goal (NOT done):
- **Client-side video export** — Could use MediaRecorder + canvas capture for browser-side export, or deploy `@remotion/renderer` on a Lambda/dedicated server. Currently users save raw video + overlay config for future rendering.

## Env Vars Needed:
```
OPENAI_API_KEY=sk-...    # For Sora 2 Pro video generation
```
Existing vars (already set): `GOOGLE_GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, etc.

## Files Created/Modified Summary:

### New Files (19):
| File | Phase | Purpose |
|------|-------|---------|
| `supabase/migrations/052_unified_credits.sql` | 1 | Credit cost column + purchases table |
| `supabase/migrations/053_video_generation.sql` | 2 | Video jobs + overlays + media_library source_type |
| `app/api/credits/purchase/route.ts` | 1 | Stripe Checkout for credit packs |
| `app/api/creative-studio/generate-video/route.ts` | 2 | Sora 2 Pro video generation (async) |
| `app/api/creative-studio/video-status/route.ts` | 2 | Poll video status + list jobs |
| `app/api/creative-studio/render-overlay/route.ts` | 3 | Save overlay config to DB (MVP) |
| `app/api/creative-studio/overlay-versions/route.ts` | 4 | Fetch overlay version history |
| `app/api/creative-studio/save-video-to-library/route.ts` | 4 | Save video to media library |
| `app/dashboard/creative-studio/video-studio/page.tsx` | 3 | Standalone video creation wizard |
| `app/dashboard/creative-studio/video-editor/page.tsx` | 3,4 | Remotion overlay editor + version history + save to library |
| `components/creative-studio/credits-gauge.tsx` | 1 | Global credits pill |
| `components/creative-studio/video-style-picker.tsx` | 3 | Style selection cards |
| `components/creative-studio/prompt-builder.tsx` | 3 | Prompt section editor |
| `components/creative-studio/video-job-card.tsx` | 3 | Job status/progress card |
| `remotion/types.ts` | 2 | All overlay + video types |
| `remotion/AdOverlay.tsx` | 2 | Main Remotion composition |
| `remotion/Root.tsx` | 2 | Composition registry |
| `remotion/index.ts` | 2 | registerRoot |
| `lib/video-prompt-templates.ts` | 2 | Style-specific prompt builders |

### Modified Files (10):
| File | Phases | Changes |
|------|--------|---------|
| `app/api/ai/usage/route.ts` | 1 | Credit-based calc + history |
| `app/api/creative-studio/generate-image/route.ts` | 1 | 5 credit deduction |
| `app/api/webhook/route.ts` | 1 | Credit pack purchase handler |
| `app/api/creative-studio/save-generated-image/route.ts` | 5 | Retry logic |
| `app/dashboard/settings/page.tsx` | 1 | Credits + usage log |
| `app/dashboard/creative-studio/layout.tsx` | 1 | CreditsGauge in header |
| `app/dashboard/creative-studio/ad-studio/page.tsx` | 1,3 | Credits + Image/Video toggle |
| `app/dashboard/creative-studio/ai-tasks/page.tsx` | 1,3 | Credits + Video Generation section |
| `components/sidebar.tsx` | 3 | Video Studio nav item |
