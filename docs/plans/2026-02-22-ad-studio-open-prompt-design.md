# Ad Studio: Open Prompt + Hero Sections Redesign

## Problem

The Ad Studio landing page has two sections ("Image" and "Video") with minimal headings that look like afterthoughts. There's no quick way to generate from a raw prompt without going through a guided workflow. Power users want a Gemini-style prompt-to-output experience.

## Solution

Add an **Open Prompt** section at the top of the Ad Studio landing page, then upgrade the existing Image/Video sections to **Guided Images** and **Guided Videos** with gradient hero banners.

---

## Page Structure (top to bottom)

### 1. Open Prompt (new)

A Gemini-style prompt bar. Dominant, first thing you see.

**Prompt textarea**: Large, clean. Placeholder: "Describe what you want to create..."

**Bottom toolbar** (left to right, all inline):

| Control | Position | Behavior |
|---------|----------|----------|
| Image/Video slider | Far left | Toggle switch. Blue = Image, Orange = Video. Changes which settings are visible. |
| Source image button | After slider | Camera icon. Click to upload reference image. Shows thumbnail when uploaded. Click thumbnail to remove. |
| Aspect ratio | After image | Dropdown: `9:16`, `16:9`, `1:1`, `4:5`. Both modes. |
| Duration | After aspect | Dropdown: `8s`, `15s`, `22s`, `29s`. Video mode only (hidden in Image mode). |
| Quality | After duration | Dropdown: `Fast (20 cr)`, `Standard (50 cr + 25/ext)`. Video mode only. Shows credit cost. |
| Generate button | Far right | Shows total credit cost. Disabled when prompt empty or insufficient credits. |

**Image mode credit cost**: 5 credits (flat).
**Video mode credit cost**: Fast = 20 base + 10 per extension. Standard = 50 base + 25 per extension. Extension count derived from duration: `extensions = ceil((duration - 8) / 7)`.

### 2. Guided Images (renamed from "Image")

**Hero banner**: Full-width dark card with subtle purple-to-blue gradient glow on left edge. Larger typography.
- Title: "Guided Images"
- Subtitle: "AI-powered workflows that turn your product into scroll-stopping ad creatives."
- Icon: `ImagePlus` or similar, larger (w-8 h-8), tinted with gradient color.

Below the banner: the existing 4 mode cards (Create, Clone, Inspiration, Upload) unchanged.

### 3. Guided Videos (renamed from "Video")

**Hero banner**: Full-width dark card with subtle rose-to-amber gradient glow on left edge. Larger typography.
- Title: "Guided Videos"
- Subtitle: "Concept-driven video ads with AI direction, overlays, and multi-clip editing."
- Icon: `Film` or similar, larger (w-8 h-8), tinted with gradient color.

Below the banner: the existing 4 mode cards (Video Studio, Product Video, UGC, Direct) unchanged.

---

## Open Prompt Generation Flow

When user hits Generate, the page flips to a step 2 view (not inline on the landing page):

### Image Generation
1. Create an `ad_studio_session` with the prompt + settings for AI Tasks persistence.
2. Call Gemini 2.5 Flash Image API directly with prompt + optional source image + aspect ratio.
3. Show result inline with actions: Download, Save to Library, Edit in Image Editor, Create Ad.
4. "Adjust" field below image for iterative refinement (same pattern as existing Ad Studio image generation).

### Video Generation
1. Create a `video_generation_job` + `video_concept_canvas` for AI Tasks persistence.
2. Call generate-video API directly with prompt (no GPT-5.2 breakdown). Provider determined by `VIDEO_MODEL` env var.
3. Show polling card while generating (progress bar, status).
4. On completion: video player with actions: Edit Video (opens Video Editor), Download, Save.

### Step 2 View Layout
- Back button returns to landing page
- Mode badge: "OPEN PROMPT" in gradient accent
- Shows the original prompt as reference
- Result area below
- Credit usage displayed

---

## API Changes

### Image (Open Prompt)
Reuse existing `/api/creative-studio/generate-image` endpoint. Already accepts prompt + optional source image + aspect ratio.

### Video (Open Prompt)
Reuse existing `/api/creative-studio/generate-video` endpoint. Already accepts raw prompt + optional product image + duration + quality + provider. No concept generation step needed.

### Session Persistence
- **Image results**: Save to `ad_studio_sessions` with `mode: 'open-prompt-image'`.
- **Video results**: Save to `video_generation_jobs` + `video_concept_canvases` with single-concept canvas. Appears in AI Tasks.

---

## Files Modified

1. `app/dashboard/creative-studio/ad-studio/page.tsx` — Landing page restructure (Open Prompt section + hero banners + rename sections). New `'open-prompt'` mode for step 2 generation view.
2. No new API routes needed — reuses existing generate-image and generate-video endpoints.
3. No new database tables — reuses existing session/canvas/job tables.

## Files NOT Changed

- Video Studio, Image Editor, Video Editor — untouched.
- Generate-video, generate-image API routes — reused as-is.
- AI Tasks page — already reads from ad_studio_sessions and video_concept_canvases; open prompt results will appear automatically.

## Future Work (not in this scope)

- **"Add Product Overlays" wizard**: A reusable overlay tool (modal) that scrapes/accepts product details, generates overlay text (hook, captions, CTA) for any video. Decoupled from generation — works on Open Prompt videos, Video Studio videos, or uploaded footage.
- Overlay wizard reuses Ad Studio Step 1 product scraping in a modal context.
