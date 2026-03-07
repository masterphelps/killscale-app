# Fix Open Prompt Video Flow

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Oracle video mode to use the existing Quick Review flow (not Video Studio), support up to 3 source images, and pass images through to Veo.

**Architecture:** Oracle video submissions route into Ad Studio's open-prompt flow (which has Quick Review / scene planner). The single `openPromptSourceImage` state becomes a `openPromptSourceImages` array (max 3). Oracle box `MAX_IMAGES` bumps from 2 to 3. All downstream generate calls send the array as `productImages`.

**Tech Stack:** React state refactor, no new APIs or DB changes.

---

### Task 1: Bump Oracle Box MAX_IMAGES to 3

**Files:**
- Modify: `components/creative-studio/oracle-box.tsx:52`

**Step 1: Change the constant**

```tsx
// Line 52: change from
const MAX_IMAGES = 2
// to
const MAX_IMAGES = 3
```

**Step 2: Verify** — Dev server hot-reloads. Oracle box should now accept 3 images.

---

### Task 2: Convert openPromptSourceImage to openPromptSourceImages array

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Replace state declaration (line 424)**

```tsx
// FROM:
const [openPromptSourceImage, setOpenPromptSourceImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)

// TO:
const [openPromptSourceImages, setOpenPromptSourceImages] = useState<Array<{ base64: string; mimeType: string; preview: string }>>([])
```

**Step 2: Update all references** — Search for `openPromptSourceImage` and update each:

| Line | Old | New |
|------|-----|-----|
| 622 | `setOpenPromptSourceImage({...})` | `setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, {...}])` |
| 2321 | `if (_image) setOpenPromptSourceImage({...})` | `if (_image) setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, { base64: _image.base64, mimeType: _image.mimeType, preview: _image.preview }])` |
| 2349 | `setOpenPromptSourceImage({...})` | `setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, {...}])` |
| 3111 | `setOpenPromptSourceImage(null)` | `setOpenPromptSourceImages([])` |
| 3303 | `setOpenPromptSourceImage({ base64, mimeType: file.type, preview: URL.createObjectURL(file) })` | `setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, { base64, mimeType: file.type, preview: URL.createObjectURL(file) }])` |
| 3919 | `setOpenPromptSourceImage(img)` | `setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, img])` |
| 5590 | `setOpenPromptSourceImage({...})` | `setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, {...}])` |

**Step 3: Update image generation call (line 3340-3342)**

```tsx
// FROM:
product: openPromptSourceImage
  ? { name: 'Open Prompt', imageBase64: openPromptSourceImage.base64, imageMimeType: openPromptSourceImage.mimeType }
  : { name: 'Open Prompt' },

// TO:
product: openPromptSourceImages.length > 0
  ? { name: 'Open Prompt', imageBase64: openPromptSourceImages[0].base64, imageMimeType: openPromptSourceImages[0].mimeType }
  : { name: 'Open Prompt' },
```

**Step 4: Update plan-scene call (line 3417)**

```tsx
// FROM:
hasSourceImage: !!openPromptSourceImage,
// TO:
hasSourceImage: openPromptSourceImages.length > 0,
```

**Step 5: Update useCallback deps (line 3432)**

Replace `openPromptSourceImage` with `openPromptSourceImages` in the dependency array.

**Step 6: Update concept sourceImage (line 3484)**

```tsx
// FROM:
...(openPromptSourceImage ? { sourceImage: { base64: openPromptSourceImage.base64, mimeType: openPromptSourceImage.mimeType } } : {}),
// TO:
...(openPromptSourceImages.length > 0 ? { sourceImage: { base64: openPromptSourceImages[0].base64, mimeType: openPromptSourceImages[0].mimeType } } : {}),
```

**Step 7: Update video generate call (lines 3538-3540)**

```tsx
// FROM:
if (openPromptSourceImage) {
  ;(videoBody as any).productImages = [{ base64: openPromptSourceImage.base64, mimeType: openPromptSourceImage.mimeType }]
}

// TO:
if (openPromptSourceImages.length > 0) {
  ;(videoBody as any).productImages = openPromptSourceImages.map(img => ({ base64: img.base64, mimeType: img.mimeType }))
}
```

**Step 8: Update useCallback deps (line 3567)**

Replace `openPromptSourceImage` with `openPromptSourceImages`.

**Step 9: Update media library maxSelection (line 3925)**

```tsx
// FROM:
maxSelection={1}
// TO:
maxSelection={3}
```

---

### Task 3: Route Oracle video mode to open-prompt Quick Review

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx:2379-2388`

**Step 1: Replace video mode handler in handleOracleSubmit**

```tsx
// FROM (lines 2379-2388):
// ── Video mode: navigate to Video Studio with prompt ──
if (mode === 'video') {
  const videoPrompt = submission.text.trim()
  if (videoPrompt) {
    router.push(`/dashboard/creative-studio/video-studio?prompt=${encodeURIComponent(videoPrompt)}&mode=direct`)
  } else {
    router.push('/dashboard/creative-studio/video-studio')
  }
  return
}

// TO:
// ── Video mode: route to open-prompt Quick Review ──
if (mode === 'video') {
  const videoPrompt = submission.text.trim()
  setOpenPromptText(videoPrompt)
  setOpenPromptMediaType('video')
  // Pass attached images as source images (up to 3)
  if (submission.images.length > 0) {
    setOpenPromptSourceImages(submission.images.slice(0, 3).map(img => ({
      base64: img.base64,
      mimeType: img.mimeType,
      preview: img.preview,
    })))
  }
  setMode('open-prompt')
  // Auto-trigger scene planning if there's a prompt
  if (videoPrompt) {
    oracleAutoGenRef.current = true
  }
  return
}
```

This routes video submissions into the existing open-prompt flow. The `oracleAutoGenRef` flag triggers the auto-generate useEffect (line 3436) which calls `handleOpenPromptGenerate()`, which for video mediaType calls the scene planner and shows the Quick Review.

---

### Task 4: Update open-prompt UI for multiple source image thumbnails

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx` (open-prompt source image thumbnail area)

**Step 1: Find the source image thumbnail rendering** — Search for where `openPromptSourceImage.preview` is rendered and replace single thumbnail with a row of up to 3.

The thumbnail display should show:
- Row of image thumbnails (max 3)
- Each with an X button to remove
- "Add" button if < 3 images

```tsx
{/* Source Images (up to 3) */}
{openPromptSourceImages.length > 0 && (
  <div className="flex items-center gap-2 flex-wrap">
    {openPromptSourceImages.map((img, idx) => (
      <div key={idx} className="relative group">
        <img src={img.preview} alt="" className="w-12 h-12 object-cover rounded-lg border border-border" />
        <button
          onClick={() => setOpenPromptSourceImages(prev => prev.filter((_, i) => i !== idx))}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-2.5 h-2.5 text-zinc-400" />
        </button>
      </div>
    ))}
    {openPromptSourceImages.length < 3 && (
      <button
        onClick={() => setOpenPromptShowImageMenu(true)}
        className="w-12 h-12 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-500 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    )}
  </div>
)}
```

**Step 2: Find and update the existing single-image thumbnail** — The exact location needs to be found by searching for `openPromptSourceImage?.preview` or the image thumbnail rendering in the open-prompt panel section.

---

### Task 5: Build and verify

**Step 1: Run build**

```bash
npm run build
```

Fix any type errors from the rename.

**Step 2: Manual test**

1. Open Oracle box, select Video mode
2. Attach 1-3 images
3. Type a prompt, submit
4. Verify: lands in open-prompt Quick Review (NOT Video Studio)
5. Verify: source image thumbnails visible
6. Verify: click Generate, images pass to Veo as `productImages`

**Step 3: Commit**

```bash
git add components/creative-studio/oracle-box.tsx app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "fix: route Oracle video to Quick Review, support up to 3 source images"
```
