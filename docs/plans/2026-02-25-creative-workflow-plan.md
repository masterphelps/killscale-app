# Creative Workflow Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI-generated videos instantly available in the Creative Studio media catalog, and let the RVE editor browse that same catalog via a modal — creating a seamless Generate → Browse → Edit → Export workflow.

**Architecture:** Auto-insert AI videos into `media_library` on generation complete (server-side, in the video-status polling endpoint). Add source-type filtering to the Creative Studio Media page. Build a media picker modal (reusing existing gallery components) that replaces the RVE editor's sidebar panels. Only rendered exports can be saved to library or used in ads.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL), React, TypeScript, Tailwind CSS, RVE editor

---

## Task 1: Auto-insert AI videos into `media_library` on generation complete

**Files:**
- Modify: `app/api/creative-studio/video-status/route.ts`

The video-status endpoint handles polling for three providers (Runway, Veo, Sora). Each has a block where status transitions to `'complete'` and `raw_video_url` is stored. After each of these blocks, insert into `media_library`.

**Step 1: Add helper function at top of file**

After the existing imports and `supabase` client initialization (around line 15), add:

```typescript
/**
 * Auto-insert a completed AI video into media_library so it's
 * instantly browsable in Creative Studio. Uses upsert to be idempotent.
 */
async function autoInsertToMediaLibrary(
  jobId: string,
  userId: string,
  adAccountId: string,
  rawVideoUrl: string,
  videoStyle?: string | null,
  canvasId?: string | null,
) {
  const cleanAccountId = adAccountId.replace(/^act_/, '')
  const styleName = videoStyle
    ? videoStyle.charAt(0).toUpperCase() + videoStyle.slice(1)
    : 'Generated'

  const { error } = await supabase
    .from('media_library')
    .upsert(
      {
        user_id: userId,
        ad_account_id: cleanAccountId,
        media_hash: `ai_video_raw_${jobId}`,
        media_type: 'video',
        name: `AI Video - ${styleName}`,
        storage_url: rawVideoUrl,
        url: rawVideoUrl,
        source_type: 'ai_video',
        source_job_id: jobId,
        download_status: 'complete',
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ad_account_id,media_hash' }
    )

  if (error) {
    console.error(`[VideoStatus] Failed to auto-insert job ${jobId} to media_library:`, error)
  }
}
```

**Step 2: Call the helper after each provider's completion block**

There are multiple places where a job transitions to `complete`. Search for every instance of:
```
.update({ status: 'complete', progress_pct: 100, raw_video_url:
```

After each such block (and before the `return NextResponse.json`), add:

```typescript
await autoInsertToMediaLibrary(job.id, userId, job.ad_account_id, rawVideoUrl, job.video_style, job.canvas_id)
```

The key locations are:
- **Runway completion** (~line 594): After `downloadAndStoreRunwayVideo` succeeds
- **Veo completion** (~line 467, ~line 508): After Veo video download completes
- **Veo extension completion** (~line 730): After final extension downloads
- **Sora completion** (~line 828): After Sora video download completes
- **Sora multi-job completion** (~lines 990, 1055, 1080, 1112): After partial/full completions
- **Sora extension completion** (~line 1195): After extension downloads

**Important:** Only insert for the final video — not intermediate extension steps. Check `job.extension_step` and `job.extension_total`: only insert when `extension_step === extension_total - 1` (last extension) or when there are no extensions.

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add app/api/creative-studio/video-status/route.ts
git commit -m "feat: auto-insert AI videos into media_library on generation complete"
```

---

## Task 2: Add source type filter to Creative Studio Media page

**Files:**
- Modify: `components/creative-studio/types.ts` (verify `sourceType` exists — it does at line 65)
- Modify: `app/dashboard/creative-studio/layout.tsx` (add `sourceFilter` state + context)
- Modify: `app/dashboard/creative-studio/creative-studio-context.tsx` (expose `sourceFilter`)
- Modify: `app/dashboard/creative-studio/media/page.tsx` (add filter chips UI, apply filter)

**Step 1: Add sourceFilter state to the layout context**

In `app/dashboard/creative-studio/layout.tsx`, add state alongside existing filter state:

```typescript
const [sourceFilter, setSourceFilter] = useState<'all' | 'meta' | 'ai'>('all')
```

Pass `sourceFilter` and `setSourceFilter` through the context provider (same pattern as existing `datePreset`, `viewMode`, etc.).

**Step 2: Add sourceFilter to the context type**

In `app/dashboard/creative-studio/creative-studio-context.tsx`, add to the context interface:

```typescript
sourceFilter: 'all' | 'meta' | 'ai'
setSourceFilter: (filter: 'all' | 'meta' | 'ai') => void
```

**Step 3: Apply filter in the Media page**

In the Media page (`app/dashboard/creative-studio/media/page.tsx`), filter assets before rendering:

```typescript
const { assets, sourceFilter, setSourceFilter } = useCreativeStudio()

const filteredBySource = useMemo(() => {
  if (sourceFilter === 'all') return assets
  if (sourceFilter === 'meta') return assets.filter(a => !a.sourceType || a.sourceType === 'meta')
  // 'ai' — includes ai_video, ai_image, ai_edited, open_prompt, project
  return assets.filter(a => a.sourceType && a.sourceType !== 'meta')
}, [assets, sourceFilter])
```

Then use `filteredBySource` instead of `assets` for downstream rendering.

**Step 4: Add filter pills UI**

Above the gallery grid (or next to existing filter controls), add source filter pills:

```tsx
<div className="flex items-center gap-2">
  {(['all', 'meta', 'ai'] as const).map(filter => (
    <button
      key={filter}
      onClick={() => setSourceFilter(filter)}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        sourceFilter === filter
          ? 'bg-accent/20 text-accent border border-accent/30'
          : 'bg-bg-card text-zinc-400 border border-border hover:text-white'
      )}
    >
      {filter === 'all' ? 'All' : filter === 'meta' ? 'Meta' : 'AI Generated'}
    </button>
  ))}
</div>
```

**Step 5: Verify build**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add app/dashboard/creative-studio/layout.tsx app/dashboard/creative-studio/creative-studio-context.tsx app/dashboard/creative-studio/media/page.tsx
git commit -m "feat: add source type filter (All/Meta/AI) to Creative Studio Media"
```

---

## Task 3: Build the Creative Studio Media Modal

**Files:**
- Create: `components/creative-studio/creative-studio-media-modal.tsx`

This modal shows the full Creative Studio media catalog with the same gallery cards, filters, and scores. It accepts a selection callback so the RVE editor can receive picked items.

**Step 1: Create the modal component**

The modal should:
- Accept props: `isOpen`, `onClose`, `userId`, `adAccountId`, `onSelect: (item: SelectedMediaItem) => void`, `allowedTypes?: ('image' | 'video')[]`
- Fetch from `/api/creative-studio/media` on open (same endpoint the Media page uses)
- Render a search bar, source filter pills (All/Meta/AI), media type filter (All/Image/Video)
- Render gallery cards using the same `MediaGalleryCard` component or a simplified version
- On card click: call `onSelect` with `{ storageUrl, mediaType, name, width, height, thumbnailUrl, mediaHash, sourceType }`
- Full-screen overlay like existing `MediaLibraryModal` pattern (backdrop + modal container)

**Key type:**

```typescript
export interface SelectedMediaItem {
  storageUrl: string
  mediaType: 'image' | 'video'
  name: string
  width: number | null
  height: number | null
  thumbnailUrl: string | null
  mediaHash: string
  sourceType: string | null
}
```

**Step 2: Reuse existing gallery card or build lightweight variant**

Check if `MediaGalleryCard` (`components/creative-studio/media-gallery-card.tsx`) can be used in selection mode. It currently supports hover/click for theater modal. For the picker, clicking should select (not open theater). Options:
- Add a `selectionMode` prop that changes click behavior
- Or render a simpler card (thumbnail + name + type badge + score badges) inside the modal

Simpler approach recommended: render cards directly in the modal with thumbnail, name, source badge, and score badges. Avoid pulling in the full `MediaGalleryCard` with its hover-to-play video logic.

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add components/creative-studio/creative-studio-media-modal.tsx
git commit -m "feat: add Creative Studio media picker modal"
```

---

## Task 4: Integrate the media modal into the RVE editor

**Files:**
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx`

**Step 1: Import the new modal and remove old Browse Library logic**

In `video-editor/page.tsx`:
- Import `CreativeStudioMediaModal` and `SelectedMediaItem`
- Remove: `showBrowseLibrary` state, `loadLibraryVideos` function, `libraryVideos` state, the Browse Library modal JSX (around lines 1283-1335)
- Remove: the "Browse Library" button in the header (around line 1093)
- Add: `showMediaPicker` state (`useState(false)`)
- Add: an "Add Media" button in the editor toolbar/header that sets `showMediaPicker(true)`

**Step 2: Wire up the selection callback**

When a user selects media from the modal, convert it to the format the editor expects:

```typescript
const handleMediaSelected = async (item: SelectedMediaItem) => {
  setShowMediaPicker(false)

  if (item.mediaType === 'video') {
    // Add as video clip overlay (reuse logic from video-overlay-panel handleAddClip)
    // Need: src URL, duration, dimensions
    const videoUrl = item.storageUrl
    let durationInFrames = 200
    try {
      const result = await getSrcDuration(videoUrl)
      durationInFrames = result.durationInFrames
    } catch {}

    const canvasDimensions = getAspectRatioDimensions()
    const width = item.width || canvasDimensions.width
    const height = item.height || canvasDimensions.height

    // Create overlay and add to timeline
    // (Same pattern as VideoOverlayPanel.handleAddClip)
  }

  if (item.mediaType === 'image') {
    // Add as image overlay
    // (Same pattern as ImageOverlayPanel.handleAddImage)
  }
}
```

**Step 3: Remove sidebar video/image panel buttons**

The editor sidebar currently has Video and Image buttons that toggle the respective panels. Replace both with a single "Media" button that opens the modal. The sidebar panels (`VideoOverlayPanel`, `ImageOverlayPanel`) are no longer rendered.

Note: Keep the sidebar Text, Shape, and other overlay panels unchanged.

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add app/dashboard/creative-studio/video-editor/page.tsx
git commit -m "feat: replace editor sidebar media panels with Creative Studio media modal"
```

---

## Task 5: Hide "Save to Library" / "Make an Ad" for raw AI assets

**Files:**
- Modify: `components/creative-studio/theater-modal.tsx`

**Step 1: Detect raw AI assets**

In the theater modal, check the asset's `sourceType` and `mediaHash`:

```typescript
const isRawAiAsset = asset?.sourceType === 'ai_video' && asset?.mediaHash?.startsWith('ai_video_raw_')
```

**Step 2: Conditionally hide buttons**

Wrap "Save to Library" and "Make an Ad" / "Create Ad" buttons with:

```tsx
{!isRawAiAsset && (
  <button ...>Save to Library</button>
)}
```

Or disable with tooltip: "Export from the editor to save to library"

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add components/creative-studio/theater-modal.tsx
git commit -m "feat: hide Save to Library for raw AI video assets"
```

---

## Task 6: Final build verification and cleanup

**Step 1: Full clean build**

```bash
rm -rf .next && npm run build
```

**Step 2: Check for unused imports**

After removing sidebar panels from the editor, check if `VideoOverlayPanel` and `ImageOverlayPanel` are imported anywhere else. If only used in the editor, their imports can be removed from the editor file (but keep the component files — they may be useful later or in other contexts).

**Step 3: Verify no regressions**

Manual verification checklist:
- [ ] Generate an AI video → appears in Creative Studio Media immediately
- [ ] Source filter chips work (All/Meta/AI Generated)
- [ ] RVE editor "Add Media" button opens the Creative Studio modal
- [ ] Selecting a video from modal adds it to the timeline
- [ ] Selecting an image from modal adds it as overlay
- [ ] Raw AI videos cannot be saved to library from theater modal
- [ ] Rendered exports CAN be saved to library
- [ ] Existing Meta-synced media still works as before

**Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: cleanup unused imports after creative workflow redesign"
```
