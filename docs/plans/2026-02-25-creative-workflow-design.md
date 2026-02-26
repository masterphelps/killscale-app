# Creative Workflow Redesign

**Date:** 2026-02-25
**Status:** Approved

## Problem

AI-generated videos are disconnected from the creative workflow. Users must: generate a video → navigate to AI Tasks → open the task → manually save to library → navigate to the editor → find the video → use it. This friction kills the creative flow.

## Desired Workflow

Generate → Auto-available in Media → Edit in RVE → Export/Render → Save to Library / Make an Ad

## Design

### 1. Auto-insert AI videos into `media_library` on generation complete

When video generation completes (status polling returns `complete`), auto-insert into `media_library`:

```
source_type: 'ai_video'
source_job_id: job.id
media_hash: 'ai_video_raw_{jobId}'
storage_url: raw_video_url
download_status: 'complete'
```

No manual save step. Every generated video is instantly browsable in Creative Studio Media as a working asset.

**Where to trigger:** In the video-status polling endpoint or client-side when status transitions to `complete`.

**Same for AI images:** Generated images from Ad Studio should auto-insert with `source_type: 'ai_image'` and `source_session_id`.

### 2. Source filter on Creative Studio Media page

Add a source type filter to the Media page: **All** / **Meta** / **AI Generated**.

The `/api/creative-studio/media` endpoint already returns `sourceType` per asset (`'meta'`, `'ai_video'`, `'ai_image'`, `'project'`). This is frontend-only filtering on the existing response.

Implementation: chip/pill filter alongside existing funnel filter bar, or as a dropdown.

### 3. Creative Studio Media Modal for RVE editor

Build a `CreativeStudioMediaModal` component that renders the same view as the Creative Studio Media page:

- Gallery cards with thumbnails, scores, source badges
- Filters: media type (image/video), source type (Meta/AI), fatigue status
- Sort: spend, ROAS, date, name
- Search by name
- Selection mode: click to select, callback returns selected items with `storageUrl`

This modal **replaces** the current RVE editor sidebar video and image panels, and the "Browse Library" header button. The editor gets a single "Add Media" button that opens this modal.

**Editor integration:**
- Selected video → added to timeline as clip overlay (using existing `handleAddClip` logic)
- Selected image → added as image overlay (using existing image overlay logic)
- Modal returns `{ storageUrl, mediaType, name, width, height, thumbnailUrl }`

**Files affected:**
- Remove: `video-overlay-panel.tsx` sidebar usage, `image-overlay-panel.tsx` sidebar usage, "Browse Library" button + modal in `video-editor/page.tsx`
- Add: `CreativeStudioMediaModal` component
- Modify: RVE editor sidebar to show "Add Media" button instead of video/image panels

### 4. Renders-only for Library / Make an Ad

Raw AI generations are working material. Only rendered/exported output is eligible for "Save to Library" or "Make an Ad".

**Distinction:**
| Type | `media_hash` pattern | Browsable in Media | Save to Library | Make an Ad |
|------|---------------------|-------------------|----------------|-----------|
| Raw AI video | `ai_video_raw_{jobId}` | Yes | No | No |
| Rendered export | `ai_video_rendered_{jobId}` | Yes | Yes | Yes |
| Meta synced | `{meta_hash}` | Yes | N/A (already in Meta) | Yes |

The `save-video-to-library` endpoint already differentiates via the `renderedVideoUrl` parameter. UI buttons ("Save to Library", "Make an Ad") should be hidden/disabled for raw AI assets.

**How to detect raw vs rendered:** Check `sourceType === 'ai_video'` and `mediaHash` prefix. Raw = `ai_video_raw_*`, rendered = `ai_video_rendered_*`.

## What stays the same

- RVE editor core (overlays, timeline, preview, Remotion render pipeline)
- Creative Studio Media API (`/api/creative-studio/media`) — already returns all needed fields
- `media_library` table schema — already has `source_type`, `source_job_id`, `source_session_id`, `source_composition_id`
- Video generation flow in Ad Studio — unchanged, just auto-inserts at completion
- `save-video-to-library` endpoint — already handles raw vs rendered

## Key files

| File | Change |
|------|--------|
| `app/api/creative-studio/video-status/route.ts` | Auto-insert into `media_library` on `complete` |
| `app/dashboard/creative-studio/page.tsx` | Add source type filter chips |
| `components/creative-studio/creative-studio-media-modal.tsx` | New: full media catalog modal |
| `app/dashboard/creative-studio/video-editor/page.tsx` | Replace sidebar panels + Browse Library with "Add Media" → modal |
| `lib/rve/components/overlay/video/video-overlay-panel.tsx` | No longer used in editor sidebar |
| `lib/rve/components/overlay/images/image-overlay-panel.tsx` | No longer used in editor sidebar |
| `components/creative-studio/media-gallery-card.tsx` | May need selection mode variant |
| `components/creative-studio/theater-modal.tsx` | Hide "Save to Library" for raw AI assets |
