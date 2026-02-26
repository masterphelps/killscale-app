# Video Ads Reorganization — Design Doc

**Date:** 2026-02-22
**Status:** Approved

## Problem

Video creation is scattered across 7 entry points on 3 pages. Users see overlapping modes that start with the same "Enter product URL" step, making it unclear which to pick. The Direct and Video Studio pages are standalone routes that duplicate the product-input UI. The Ad Studio landing page has two video cards that are just redirects to other pages.

## Solution

Consolidate into **4 modes organized by primary input**, all living on the Ad Studio page. Each mode leads with what makes it unique — URL field, text box, image uploader, or actor configurator — instead of a generic "What product is this for?" step.

## The 4 Modes

### 1. URL to Video
**Primary input:** Product URL (or manual entry)
**What it replaces:** Video Studio (concepts) + Direct (custom vision) — merged with a toggle

**Flow:**
1. User enters product URL → auto-extract product knowledge + pill pools
2. Toggle: **"Generate Concepts"** (AI picks 4 diverse angles) vs **"Direct"** (user writes their own concept)
   - Generate Concepts path: select pills → AI generates 4 concept cards → inline video gen per card
   - Direct path: select pills → write concept prompt in textarea → Director's Review → generate
3. Director's Review with editable prompts, extensions, overlays, quality selector
4. Video generation via Veo

**Product context:** Required (URL or manual). This is the most structured mode — AI needs product knowledge to generate diverse concepts.

### 2. Text to Video
**Primary input:** Text prompt
**What it replaces:** Open Prompt video path

**Flow:**
1. User writes a free-form prompt describing their video vision (no product URL needed)
2. Optional: attach source image for visual reference
3. AI scene planner (GPT 5.2) analyzes prompt → determines optimal duration → segments into Veo-ready prompts
4. Director's Review: editable scene, mood, prompts, extensions, overlays, quality
5. Video generation via Veo

**Product context:** None required. The user's prompt IS the context. Total creative freedom.

### 3. Image to Video
**Primary input:** Image (upload or Media Library)
**What it replaces:** Product Video mode (promoted from buried option)

**Flow:**
1. User uploads an image OR selects from Media Library
2. User writes a short prompt describing what should happen (e.g., "product rotating on marble surface, camera orbiting slowly")
3. AI scene planner → Director's Review with segmented prompts
4. Video generation via Veo with image as reference input

**Image input supports:**
- Drag-and-drop upload
- Media Library browser (existing `media-library-modal.tsx` component)
- Paste from clipboard

**Product context:** None required. The image + prompt are the context.

### 4. UGC Video
**Primary input:** Actor configuration + product info
**What it replaces:** Current UGC Video mode (unchanged core logic)

**Flow:**
1. User configures presenter: gender, age, tone, clothing, appearance features
2. User enters product info (URL for auto-extract or manual)
3. User selects scene/setting + optional direction notes
4. AI generates UGC testimonial script with dialogue, overlay, ad copy
5. Director's Review with editable script segments
6. Video generation via Veo

**Product context:** Required but can be manual entry (no URL needed).

## Landing Page Layout

The Ad Studio landing page gets a new **"Video Ads"** section above the existing "Guided Video Ads" section:

```
┌─────────────────────────────────────────────┐
│  Guided Image Ads                           │
│  [Create] [Clone] [Inspiration] [Upload]    │
├─────────────────────────────────────────────┤
│  Video Ads                          [NEW]   │
│  [URL to Video] [Text to Video]             │
│  [Image to Video] [UGC Video]               │
├─────────────────────────────────────────────┤
│  Guided Video Ads (Legacy)                  │
│  [Create] [Product] [UGC] [Direct]          │
│  (Subtle deprecation note)                  │
├─────────────────────────────────────────────┤
│  Open Prompt                                │
│  [text area + image/video toggle]           │
└─────────────────────────────────────────────┘
```

Each card click sets the appropriate mode and enters the mode's step-1 view on the same page (no page navigation).

## Transition Plan

1. **Phase 1 (this work):** Add "Video Ads" section with 4 new mode cards. Keep "Guided Video Ads (Legacy)" below with subtle deprecation styling. Both sections functional.
2. **Phase 2 (later):** Remove legacy section. Redirect `/video-studio` and `/direct` routes to `/ad-studio` with appropriate mode params.

## Modes → Existing Code Mapping

| New Mode | Reuses From | New Code Needed |
|----------|-------------|-----------------|
| URL to Video | `video-studio/page.tsx` (concepts + pills), `direct/page.tsx` (custom concept) | Merge both flows into ad-studio with toggle. Port product-input, pill selector, concept generation, direct concept textarea, Director's Review |
| Text to Video | Open Prompt video path + `plan-scene` API | Already partially built (scene planner API exists). Need to wire Director's Review |
| Image to Video | Product Video mode's image handling, `plan-scene` API pattern | New image uploader step + scene planner integration. Media Library picker integration |
| UGC Video | Current UGC mode (ad-studio) | Minimal changes — already on ad-studio page |

## Key Design Decisions

- **Primary input first:** Each mode opens with its unique input, not a generic product URL step
- **All on Ad Studio page:** No new routes. Modes are states within ad-studio, like existing Product Video and UGC modes
- **Director's Review for all:** Every video mode goes through Director's Review before generation (editable prompts, extensions, overlays, quality)
- **URL-to-Video has sub-toggle:** "Generate Concepts" (4 AI angles) vs "Direct" (write your own). One product input, two paths
- **Image input flexibility:** Upload, Media Library, or clipboard paste
- **Graceful transition:** Legacy section stays until new flows are battle-tested
