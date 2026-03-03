# RVE Render Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple the render/export/save workflow so users save versions, render in background with toast notifications, and only access Export/Library/Create Ad when a version is rendered.

**Architecture:** The render-video API already handles Remotion rendering via Vercel Sandbox, SSE progress streaming, and Supabase Storage upload. The change is primarily UI restructuring: (1) add a Render button that fires the existing API in background with toast updates, (2) add render status indicators to the version dropdown, (3) gate Export/Library/Create Ad behind `render_status === 'complete'`, (4) modify the render-video API to accept an `overlayId` param to update existing versions instead of always creating new ones.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase, Remotion/Vercel, SSE

---

### Task 1: Modify render-video API to accept `overlayId`

**Files:**
- Modify: `app/api/creative-studio/render-video/route.ts:49-201`

Currently the API always creates a new `video_overlays` row. When `overlayId` is provided, it should update the existing row instead.

**Step 1: Add `overlayId` to the request body type**

In `route.ts:49-59`, add `overlayId?: string` to the body type:

```typescript
let body: {
  videoJobId?: string
  compositionId?: string
  overlayId?: string  // ← NEW: render an existing saved version
  overlayConfig: OverlayConfig
  userId: string
  adAccountId: string
  videoUrl?: string
  durationInSeconds?: number
  width?: number
  height?: number
}
```

**Step 2: Update the overlay record creation block**

In `route.ts:156-201`, add a branch: if `overlayId` is provided, update the existing row to `render_status='rendering'` instead of inserting a new one. Replace the entire "Create overlay record" block:

```typescript
// ── Create or update overlay record with render_status = 'rendering' ──
let overlayIdToUse: string

if (body.overlayId) {
  // Render an existing saved version — update its status
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('video_overlays')
    .update({
      render_status: 'rendering',
      overlay_config: overlayConfig, // Update with latest config
      rendered_video_url: null,      // Clear any previous render
    })
    .eq('id', body.overlayId)
    .eq('user_id', userId)
    .select('id')
    .single()

  if (existingError || !existing) {
    console.error('Failed to update overlay record:', existingError)
    await send({ type: 'error', message: 'Failed to find overlay version to render' })
    return
  }
  overlayIdToUse = existing.id
} else {
  // Original behavior: create a new overlay record
  const parentField = compositionId
    ? { composition_id: compositionId, video_job_id: null }
    : videoJobId
      ? { video_job_id: videoJobId, composition_id: null }
      : { video_job_id: null, composition_id: null }

  let nextVersion = 1
  const versionFilter = compositionId
    ? { composition_id: compositionId }
    : videoJobId
      ? { video_job_id: videoJobId }
      : null

  if (versionFilter) {
    const filterKey = Object.keys(versionFilter)[0]
    const filterVal = Object.values(versionFilter)[0]
    const { data: maxVersionRow } = await supabaseAdmin
      .from('video_overlays')
      .select('version')
      .eq(filterKey, filterVal)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    nextVersion = (maxVersionRow?.version ?? 0) + 1
  }

  const { data: overlay, error: overlayError } = await supabaseAdmin
    .from('video_overlays')
    .insert({
      ...parentField,
      user_id: userId,
      version: nextVersion,
      overlay_config: overlayConfig,
      render_status: 'rendering',
    })
    .select('id')
    .single()

  if (overlayError || !overlay) {
    console.error('Failed to create overlay record:', overlayError)
    await send({ type: 'error', message: 'Failed to create render record' })
    return
  }
  overlayIdToUse = overlay.id
}
overlayId = overlayIdToUse
```

**Step 3: Update error cleanup for overlayId mode**

In the two error catch blocks (lines ~367-396), when `body.overlayId` was provided, do NOT delete the row on failure — instead revert it to `render_status='failed'`:

```typescript
// In both catch blocks, replace the delete with:
if (overlayId) {
  if (body.overlayId) {
    // Revert existing version to failed (don't delete it)
    await supabaseAdmin
      .from('video_overlays')
      .update({ render_status: 'failed' })
      .eq('id', overlayId)
  } else {
    // Delete newly created row on failure (original behavior)
    await supabaseAdmin
      .from('video_overlays')
      .delete()
      .eq('id', overlayId)
  }
}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 5: Commit**

```bash
git add app/api/creative-studio/render-video/route.ts
git commit -m "feat: render-video API accepts overlayId to render existing versions"
```

---

### Task 2: Restructure the video editor toolbar

**Files:**
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx:66-79` (state), `page.tsx:1050-1253` (toolbar JSX)

This task restructures the toolbar to: `[Save] [Render] [v3 ▾] ··· [Export ↓] [Library +] [Create Ad →]` with Export/Library/Create Ad disabled when the selected version isn't rendered.

**Step 1: Add render state variables**

At `page.tsx:66-79`, replace the export state block with render state:

```typescript
// Render (background job)
const [isRendering, setIsRendering] = useState(false)
const [renderingVersionId, setRenderingVersionId] = useState<string | null>(null)
const [renderToastMessage, setRenderToastMessage] = useState<string | null>(null)
const [renderToastType, setRenderToastType] = useState<'progress' | 'success' | 'error'>('progress')
```

Keep the existing export modal state — we'll remove it later in this task.

**Step 2: Compute `selectedVersionData` and `isRendered`**

After the `versions` state declaration (~line 94), add a derived value:

```typescript
// Derive the currently selected version's data
const selectedVersionData = activeVersion !== null
  ? versions.find(v => v.version === activeVersion)
  : null
const isRendered = selectedVersionData?.render_status === 'complete'
const renderedVideoUrl = selectedVersionData?.rendered_video_url || null
```

**Step 3: Add the `handleRender` function**

After the `handleLaunchAsAd` function (~line 980), add:

```typescript
// Render current version in background
const handleRender = useCallback(async () => {
  if (!user?.id || !currentAccountId || isRendering) return

  // Must have a saved version selected
  if (!selectedVersionData) {
    alert('Save a version first before rendering.')
    return
  }

  setIsRendering(true)
  setRenderToastMessage(`Rendering v${selectedVersionData.version}...`)
  setRenderToastType('progress')
  setRenderingVersionId(selectedVersionData.id)

  try {
    const config = selectedVersionData.overlay_config || overlayConfigRef.current || { style: 'clean' as const }

    const body: Record<string, any> = {
      overlayId: selectedVersionData.id,
      overlayConfig: config,
      userId: user.id,
      adAccountId: currentAccountId,
      durationInSeconds: durationSec,
    }
    if (isComposition && compositionId) {
      body.compositionId = compositionId
    } else if (jobId) {
      body.videoJobId = jobId
    } else if (videoUrl) {
      body.videoUrl = videoUrl
    }

    const res = await fetch('/api/creative-studio/render-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    // Handle non-SSE error responses
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = await res.json()
      setRenderToastMessage(data.error || 'Render failed')
      setRenderToastType('error')
      setIsRendering(false)
      setTimeout(() => setRenderToastMessage(null), 5000)
      return
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response stream')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'phase') {
            setRenderToastMessage(`v${selectedVersionData.version}: ${data.phase}`)
          } else if (data.type === 'done') {
            setRenderToastMessage(`v${selectedVersionData.version} rendered successfully`)
            setRenderToastType('success')
            setIsRendering(false)
            // Refresh versions to pick up the new render_status
            if (isComposition) loadCompositionVersions()
            else loadVersions()
            setTimeout(() => setRenderToastMessage(null), 4000)
          } else if (data.type === 'error') {
            setRenderToastMessage(`Render failed: ${data.message}`)
            setRenderToastType('error')
            setIsRendering(false)
            if (isComposition) loadCompositionVersions()
            else loadVersions()
            setTimeout(() => setRenderToastMessage(null), 5000)
          }
        } catch { /* skip malformed SSE */ }
      }
    }
  } catch (err) {
    setRenderToastMessage(`Render failed: ${(err as Error).message}`)
    setRenderToastType('error')
    setIsRendering(false)
    setTimeout(() => setRenderToastMessage(null), 5000)
  }
}, [user?.id, currentAccountId, isRendering, selectedVersionData, durationSec, isComposition, compositionId, jobId, videoUrl, loadVersions, loadCompositionVersions])
```

**Step 4: Update `handleLaunchAsAd` to use rendered video**

Replace the existing `handleLaunchAsAd` (~line 952-980) to use the rendered video URL instead of the raw video:

```typescript
const handleLaunchAsAd = useCallback(async () => {
  if (!user?.id || !currentAccountId || !renderedVideoUrl) return
  setIsPreparingLaunch(true)
  try {
    // Download rendered video to create a File for the wizard
    const videoRes = await fetch(renderedVideoUrl)
    const videoBlob = await videoRes.blob()
    const videoFile = new File([videoBlob], 'video-ad.mp4', { type: 'video/mp4' })

    const creative: Creative = {
      file: videoFile,
      preview: renderedVideoUrl,
      type: 'video',
      uploaded: false,
    }

    setWizardCreatives([creative])
    setWizardCopy(adCopy ? {
      primaryText: adCopy.primaryText,
      headline: adCopy.headline,
      description: adCopy.description,
    } : null)
    setShowLaunchWizard(true)
  } catch (err) {
    console.error('Failed to prepare ad launch:', err)
  } finally {
    setIsPreparingLaunch(false)
  }
}, [user?.id, currentAccountId, renderedVideoUrl, adCopy])
```

**Step 5: Rewrite the toolbar JSX**

Replace the entire toolbar `<div className="flex items-center gap-2">` block (lines 1050-1253) with the new layout:

```tsx
<div className="flex items-center gap-2">
  {/* Version dropdown */}
  <div className="relative">
    <button
      onClick={() => setShowVersions(!showVersions)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-400 bg-bg-card hover:bg-bg-hover transition-colors"
    >
      <History className="w-3.5 h-3.5" />
      {activeVersion !== null ? `v${activeVersion}` : 'Versions'}
      {versions.length > 0 && <span className="text-zinc-600 ml-0.5">({versions.length})</span>}
      <ChevronDown className="w-3 h-3" />
    </button>
    {showVersions && (
      <div className="absolute right-0 top-full mt-1 w-56 bg-bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
        <button
          onClick={() => { setActiveVersion(null); setShowVersions(false) }}
          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
            activeVersion === null ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-bg-hover'
          }`}
        >
          Current (unsaved)
        </button>
        {versions.map(v => (
          <VersionButton
            key={v.id}
            version={v}
            isActive={activeVersion === v.version}
            isRendering={renderingVersionId === v.id}
            videoUrl={videoUrl}
            durationSec={durationSec}
            onLoad={(config) => {
              overlayConfigRef.current = config
              setAiGeneratedConfig(config)
              setActiveVersion(v.version)
              setShowVersions(false)
            }}
          />
        ))}
      </div>
    )}
  </div>

  {/* Save button */}
  <SaveButton
    jobId={effectiveJobId}
    compositionId={compositionId}
    isComposition={isComposition}
    userId={user?.id}
    adAccountId={currentAccountId}
    videoUrl={videoUrl}
    durationSec={durationSec}
    canvasIdRef={canvasIdRef}
    isSaving={isSaving}
    setIsSaving={setIsSaving}
    overlayConfigRef={overlayConfigRef}
    setActiveVersion={setActiveVersion}
    loadVersions={isComposition ? loadCompositionVersions : loadVersions}
    projectName={projectName}
    onNameRequired={() => {
      setPendingSaveAfterName(true)
      setNameInput(projectName || '')
      setShowNamePrompt(true)
    }}
    onSaved={() => setIsDirty(false)}
    setCompositionId={setCompositionId}
    setIsComposition={setIsComposition}
  />

  {/* Render button */}
  <button
    onClick={handleRender}
    disabled={isRendering || activeVersion === null}
    title={activeVersion === null ? 'Save a version first' : isRendering ? 'Rendering...' : `Render v${activeVersion}`}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  >
    {isRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
    Render
  </button>

  {/* Separator */}
  <div className="w-px h-5 bg-border mx-1" />

  {/* Export (download rendered MP4) */}
  <a
    href={isRendered && renderedVideoUrl ? renderedVideoUrl : undefined}
    download={isRendered ? 'exported-video.mp4' : undefined}
    onClick={(e) => { if (!isRendered) e.preventDefault() }}
    title={!isRendered ? 'Render this version first' : 'Download rendered video'}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      isRendered
        ? 'bg-zinc-700/50 text-zinc-200 hover:bg-zinc-600/50 border border-zinc-600/30'
        : 'bg-zinc-800/30 text-zinc-600 border border-zinc-700/20 cursor-not-allowed'
    }`}
  >
    <Download className="w-3.5 h-3.5" />
    Export
  </a>

  {/* Save to Library */}
  <button
    onClick={async () => {
      if (!isRendered || !renderedVideoUrl || !user?.id || !currentAccountId) return
      setIsSavingToLibrary(true)
      try {
        const saveBody: Record<string, string> = {
          userId: user.id,
          adAccountId: currentAccountId,
          renderedVideoUrl,
        }
        if (isComposition && compositionId) {
          saveBody.compositionId = compositionId
        } else if (jobId) {
          saveBody.videoJobId = jobId
        }
        const res = await fetch('/api/creative-studio/save-video-to-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveBody),
        })
        const data = await res.json()
        if (data.success) setSavedToLibrary(true)
        else alert(`Failed to save: ${data.error}`)
      } catch (err) {
        console.error('Save to library failed:', err)
      } finally {
        setIsSavingToLibrary(false)
      }
    }}
    disabled={!isRendered || isSavingToLibrary || savedToLibrary}
    title={!isRendered ? 'Render this version first' : savedToLibrary ? 'Already saved' : 'Save to media library'}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      isRendered
        ? savedToLibrary
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 disabled:opacity-50'
        : 'bg-zinc-800/30 text-zinc-600 border border-zinc-700/20 cursor-not-allowed'
    }`}
  >
    {isSavingToLibrary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedToLibrary ? <CheckCircle className="w-3.5 h-3.5" /> : <Library className="w-3.5 h-3.5" />}
    {savedToLibrary ? 'Saved' : 'Library'}
  </button>

  {/* Create Ad */}
  <button
    onClick={handleLaunchAsAd}
    disabled={!isRendered || isPreparingLaunch}
    title={!isRendered ? 'Render this version first' : 'Launch as Meta ad'}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      isRendered
        ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/20 disabled:opacity-50'
        : 'bg-zinc-800/30 text-zinc-600 border border-zinc-700/20 cursor-not-allowed'
    }`}
  >
    {isPreparingLaunch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
    Create Ad
  </button>
</div>
```

**Step 6: Remove the old Export modal**

Delete the entire Export Progress Modal block (lines ~1392-1500, the `showExportModal && (...)` section). Also remove the state variables that are no longer needed:

Remove from state declarations:
- `isExporting`, `showExportModal`, `exportPhase`, `exportProgress`, `exportError` (lines 74-78)
- `renderedVideoUrl` state (line 79) — replaced by derived `renderedVideoUrl` from selected version

**Step 7: Add toast notification UI**

After the Launch Wizard closing `</div>` and before the final `</div>` of the component (line ~1540), add the toast:

```tsx
{/* Render toast notification */}
{renderToastMessage && (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm transition-all ${
    renderToastType === 'success'
      ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
      : renderToastType === 'error'
        ? 'bg-red-950/90 border-red-500/30 text-red-200'
        : 'bg-zinc-900/90 border-zinc-700/50 text-zinc-200'
  }`}>
    {renderToastType === 'progress' && <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />}
    {renderToastType === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
    {renderToastType === 'error' && <X className="w-4 h-4 text-red-400 flex-shrink-0" />}
    <span className="text-sm">{renderToastMessage}</span>
    <button
      onClick={() => setRenderToastMessage(null)}
      className="ml-2 p-0.5 rounded hover:bg-white/10 transition-colors"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
)}
```

**Step 8: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 9: Commit**

```bash
git add app/dashboard/creative-studio/video-editor/page.tsx
git commit -m "feat: restructure video editor toolbar with Render button and gated Export/Library/Create Ad"
```

---

### Task 3: Update VersionButton with render status indicators

**Files:**
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx:1733-1756` (VersionButton component)

**Step 1: Update VersionButton props and rendering**

Replace the entire `VersionButton` component:

```typescript
function VersionButton({
  version,
  isActive,
  isRendering,
  videoUrl,
  durationSec,
  onLoad,
}: {
  version: { id: string; version: number; overlay_config: OverlayConfig; render_status: string; rendered_video_url?: string | null; created_at: string }
  isActive: boolean
  isRendering?: boolean
  videoUrl: string
  durationSec: number
  onLoad: (config: OverlayConfig) => void
}) {
  const isComplete = version.render_status === 'complete'
  const isFailed = version.render_status === 'failed'

  return (
    <button
      onClick={() => onLoad(version.overlay_config)}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
        isActive ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-bg-hover'
      }`}
    >
      <span className="flex-1">
        v{version.version} &middot; {new Date(version.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </span>
      {isRendering && (
        <Loader2 className="w-3 h-3 animate-spin text-blue-400 flex-shrink-0" />
      )}
      {!isRendering && isComplete && (
        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Rendered" />
      )}
      {!isRendering && isFailed && (
        <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Render failed" />
      )}
    </button>
  )
}
```

Note: The `Loader2` import is already at the top of the file.

**Step 2: Update the version type to include `rendered_video_url`**

At line ~90, update the `versions` state type:

```typescript
const [versions, setVersions] = useState<Array<{
  id: string; version: number; overlay_config: OverlayConfig; render_status: string; rendered_video_url?: string | null; created_at: string
}>>([])
```

**Step 3: Update overlay-versions API to return `rendered_video_url`**

In `app/api/creative-studio/overlay-versions/route.ts`, the SELECT query needs to include `rendered_video_url`. Check if it's already there — if not, add it to the select clause.

**Step 4: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 5: Commit**

```bash
git add app/dashboard/creative-studio/video-editor/page.tsx app/api/creative-studio/overlay-versions/route.ts
git commit -m "feat: version dropdown shows render status indicators (green dot, spinner, red dot)"
```

---

### Task 4: Reset savedToLibrary when switching versions

**Files:**
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx`

When the user switches versions in the dropdown, `savedToLibrary` should reset to `false` so the Library button becomes active again for the new version.

**Step 1: Add effect to reset on version change**

After the version state declarations, add:

```typescript
// Reset library saved state when switching versions
useEffect(() => {
  setSavedToLibrary(false)
}, [activeVersion])
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 3: Commit**

```bash
git add app/dashboard/creative-studio/video-editor/page.tsx
git commit -m "fix: reset Library saved state when switching versions"
```

---

### Task 5: Final cleanup and build verification

**Files:**
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx`

**Step 1: Remove unused imports**

Check if any imports are now unused after removing the export modal. Likely removals: none (most icons are still used in the toast). But verify.

**Step 2: Full build**

Run: `npm run build`
Expected: Clean build with no warnings about unused vars

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: cleanup unused code from render workflow refactor"
```

---

## Key Design Decisions

1. **Render updates existing row** — When `overlayId` is provided, the API updates the existing `video_overlays` row instead of creating a new one. This keeps version history clean (one row per version, not one per render attempt).

2. **Failed renders set `render_status='failed'`** — When rendering an existing version, failures revert to `'failed'` status (not deleted). This lets the user see the failure indicator and retry. New ad-hoc renders (no overlayId) still delete on failure.

3. **Export is a direct download link** — No modal, no re-render. Just an `<a href={renderedVideoUrl} download>` when available. Simpler and faster.

4. **Create Ad always uses rendered video** — The Launch Wizard receives the rendered MP4 (with baked-in overlays), not the raw source video. This ensures what the user previewed is what goes into the ad.

5. **Toast is self-dismissing** — Success toasts auto-dismiss after 4s, errors after 5s. User can also dismiss manually via X button.
