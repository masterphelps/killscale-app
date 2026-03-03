# RVE Render Workflow Redesign

**Date:** 2026-02-27
**Status:** Approved

## Problem

The video editor has a broken "Add to Library" button and an "Export" button that blocks the editor with a modal while Remotion renders on Vercel. The render/export/save actions are conflated. Users need a clear separation: save versions, render in background, then export/use rendered output.

## Design

### Toolbar Layout

```
[Save] [Render] [v3 ▾] ··· [Export ↓] [Library +] [Create Ad →]
```

- **Save** — saves overlay config as new version (`render_status='saved'`). Existing behavior.
- **Render** — kicks off Remotion render for the currently selected version. Fire-and-forget with toast notification.
- **Version dropdown** — shows all versions with status indicators (green dot = rendered, spinner = rendering, no indicator = saved only).
- **Export** — downloads the rendered MP4. Disabled if selected version isn't rendered.
- **Library** — adds rendered video to `media_library`. Disabled if not rendered.
- **Create Ad** — navigates to Launch Wizard with rendered video preloaded. Disabled if not rendered.

### Render Flow

1. User clicks **Render** → toast: "Rendering v3..."
2. API call to `render-video` endpoint with `overlayId` of the selected version
3. SSE progress read in background, toast updates with phase info
4. On completion: toast "v3 rendered successfully", green dot appears in version dropdown
5. User can keep editing during render — saving new versions while a render is in progress is fine

### Version Dropdown

Each row shows:
- Version number + relative timestamp ("2m ago")
- Green filled circle = `render_status='complete'`
- Spinner = `render_status='rendering'`
- No indicator = `render_status='saved'`

### Disabled State Logic

```typescript
const isRendered = selectedVersion?.render_status === 'complete'
```

When `!isRendered`: Export, Library, Create Ad are grayed out with tooltip "Render this version first".

When `isRendered`: all three buttons active.

### Backend Changes

**render-video API** — add optional `overlayId` param. When provided, update the existing `video_overlays` row (change `render_status` from `'saved'` → `'rendering'` → `'complete'`) instead of creating a new row. When not provided, current behavior (create new row).

### Create Ad Flow

1. Click "Create Ad"
2. Ensure rendered video is in `media_library` (insert via register-upload if missing)
3. Navigate to `/dashboard/launch?mediaHash={hash}&mediaType=video`
4. Launch Wizard picks up the video from URL params

### Future Work (Post-Implementation)

- Media library source badges: uploaded, generated, from Meta, rendered, etc.
- Could use a `source_type` column on `media_library` to distinguish origin

## Files to Modify

- `app/dashboard/creative-studio/video-editor/page.tsx` — toolbar buttons, render trigger, version dropdown indicators, disabled state logic
- `app/api/creative-studio/render-video/route.ts` — accept `overlayId` param to update existing row instead of creating new
- No new tables or migrations needed — `video_overlays` already has `render_status` and `rendered_video_url`
