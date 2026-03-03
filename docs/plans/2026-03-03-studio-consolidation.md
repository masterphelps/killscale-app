# Studio Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate three overlapping video workflows (url-to-video component, Direct Studio page, Video Studio page) into one unified Video Studio page, and extract a shared product-input component used by both Ad Studio and Video Studio.

**Architecture:** A shared `product-input.tsx` component handles URL analysis, image upload/library, and pill selection. Video Studio becomes the single video creation page with Explore (4 concepts) and Direct (single script) sub-modes. Ad Studio shrinks by ~3,500 lines as all video state/handlers/renders are removed and video chips navigate to Video Studio instead.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS. No new dependencies.

**Design Doc:** `docs/plans/2026-03-03-studio-consolidation-design.md`

---

## Task 1: Create `product-input.tsx` — Shared Input Component

The most important piece. Extracts the duplicated URL+images+pills pattern from three files into one component.

**Files:**
- Create: `components/creative-studio/product-input.tsx`
- Reference: `components/creative-studio/url-to-video.tsx` (lines 41-53 for constants, 220-251 for state, 337-502 for handlers, 1207-1360 for JSX)
- Reference: `app/dashboard/creative-studio/direct/page.tsx` (lines 41-53, 191-229, 406-487, 1004-1177)
- Reference: `lib/video-prompt-templates.ts` (lines 3-24 for `ProductKnowledge`, `ProductImage` types)

**What this component owns internally:**
- All state: `productUrl`, `isAnalyzing`, `analyzeError`, `hasAnalyzed`, `pools`, `selected`, `extraContext`, `videoIntel`, `productImages`, `selectedProductImageIndices`, `includeProductImage`, `inputMode` (always 'url' | 'manual' since URL is always optional now)
- All handlers: `handleAnalyzeUrl`, `togglePill`, `addToPool`, `handleImageUpload`, `assembleProductKnowledge`
- All pill constants: `PillCategory`, `SINGLE_SELECT`, `PILL_SECTIONS`
- The `PillGroup` sub-component (duplicated in all 3 files — extract once)

**Props interface:**
```typescript
interface ProductInputProps {
  onChange: (knowledge: ProductKnowledge, images: ProductImage[], selectedIndices: number[]) => void
  onOpenMediaLibrary?: () => void
  onImageFromLibrary?: { base64: string; mimeType: string; preview: string } | null
  initialUrl?: string
  initialProductKnowledge?: ProductKnowledge
  initialProductImages?: ProductImage[]
  autoAnalyze?: boolean            // auto-analyze initialUrl on mount
  collapsed?: boolean              // accordion collapsed state
  onCollapsedChange?: (v: boolean) => void
  accentColor?: 'amber' | 'purple' // drives tailwind classes
}

// Expose via ref for parent to read assembled state on-demand
interface ProductInputRef {
  assemble: () => ProductKnowledge
  getProductImages: () => { images: ProductImage[]; selectedIndices: number[]; include: boolean }
  hasAnalyzed: boolean
  canProceed: boolean              // name pill selected
}
```

**Key behavioral rules:**
- URL field is always visible (not hidden behind a toggle)
- Pills are always visible — empty if no URL analyzed (user types their own)
- Product Name and Description pills are marked required (red asterisk, `required: true` in PILL_SECTIONS)
- Description pill should also be required (add `required: true` to PILL_SECTIONS entry)
- Image grid always visible with [+] button for Upload / Media Library
- When `collapsed=true`, render a single-line summary: "{name} | {imageCount} images | {pillCount} pills selected" with Edit button
- `autoAnalyze` prop triggers `handleAnalyzeUrl()` on mount when `initialUrl` is provided (from url-to-video lines 476-482)
- `onChange` fires whenever pill selection or images change (debounced or on explicit action)
- Image picker: drag-drop zone + "Upload" button + "Media Library" button (from url-to-video lines 1307-1326)
- Accept library image via `onImageFromLibrary` prop (from url-to-video lines 394-413)

**Step 1:** Create the file with props interface, internal state, and constants (PillCategory, PILL_SECTIONS, SINGLE_SELECT). Import types from `lib/video-prompt-templates.ts`.

**Step 2:** Implement the `PillGroup` sub-component. Copy from `url-to-video.tsx:91-193`, parameterize the accent color.

**Step 3:** Implement handlers: `handleAnalyzeUrl` (from url-to-video:417-473), `togglePill` (from url-to-video:337-347), `addToPool` (from url-to-video:349-361), `handleImageUpload` (from url-to-video:365-391), `assembleProductKnowledge` (from url-to-video:486-502).

**Step 4:** Implement the JSX: URL input row, image grid with [+] upload/library, pill sections grid, collapsed summary view. Use url-to-video's JSX (lines 1207-1360) as the base, add the URL/Manual toggle from direct/page (lines 1012-1033) but always show both URL field and pills.

**Step 5:** Implement `useImperativeHandle` for the ref, exposing `assemble()`, `getProductImages()`, `hasAnalyzed`, `canProceed`.

**Step 6:** Implement `autoAnalyze` — copy the auto-analyze useEffect from url-to-video:476-482.

**Step 7:** Implement accordion collapse — when `collapsed=true`, render summary pill with product name, image count, pill count, and Edit button that calls `onCollapsedChange(false)`.

**Step 8:** Run `npm run build` to verify no type errors.

**Step 9:** Commit.
```bash
git add components/creative-studio/product-input.tsx
git commit -m "feat: create shared product-input component for Ad Studio + Video Studio"
```

---

## Task 2: Rewrite Video Studio Page — Unified Video Creation

Replace the current video-studio page (concepts-only, 1,997 lines) with the unified page that has both Explore and Direct sub-modes.

**Files:**
- Rewrite: `app/dashboard/creative-studio/video-studio/page.tsx`
- Reference: `components/creative-studio/url-to-video.tsx` (the most complete implementation — has both sub-modes)
- Reference: `app/dashboard/creative-studio/direct/page.tsx` (Oracle handoff handling)
- Reference: `components/creative-studio/directors-review.tsx` (shared component, import `QUALITY_COSTS` from here — fixes the cost bug)

**URL params accepted:**
```typescript
const promptParam = searchParams?.get('prompt')           // Direct script pre-fill
const styleParam = searchParams?.get('style')             // Video style pre-select
const modeParam = searchParams?.get('mode')               // 'ugc' | 'direct' | 'explore'
const productNameParam = searchParams?.get('productName') // Described product name
const productDescParam = searchParams?.get('productDescription')
const productUrlParam = searchParams?.get('productUrl')   // Already-analyzed URL
const canvasIdParam = searchParams?.get('canvasId')       // AI Tasks restore
const tabParam = searchParams?.get('tab')                 // 'image' for image-to-video
```

**Page state structure:**
```typescript
// Step management (accordion)
const [step, setStep] = useState(1)                       // 1=input, 2=path, 3=review
const [step1Collapsed, setStep1Collapsed] = useState(false)
const [step2Collapsed, setStep2Collapsed] = useState(false)

// Product input ref
const productInputRef = useRef<ProductInputRef>(null)

// Sub-mode choice
const [subMode, setSubMode] = useState<'explore' | 'direct'>('explore')

// Explore sub-mode (4 concepts)
const [concepts, setConcepts] = useState<AdConcept[]>([])
const [generatingConcepts, setGeneratingConcepts] = useState(false)
const [expandedConcept, setExpandedConcept] = useState<number | null>(null)
const [reviewingConceptIndex, setReviewingConceptIndex] = useState<number | null>(null)
const [conceptQuality, setConceptQuality] = useState<Record<number, 'standard' | 'premium'>>({})
const [conceptJobs, setConceptJobs] = useState<Record<number, VideoJob[]>>({})
const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)

// Direct sub-mode
const [directPrompt, setDirectPrompt] = useState('')
const [directResult, setDirectResult] = useState<DirectConceptResult | null>(null)
const [directWriting, setDirectWriting] = useState(false)

// Director's Review shared state (used by both sub-modes)
const [editScene, setEditScene] = useState('')
const [editSubject, setEditSubject] = useState('')
const [editAction, setEditAction] = useState('')
const [editMood, setEditMood] = useState('')
const [editVideoPrompt, setEditVideoPrompt] = useState('')
const [editExtensionPrompts, setEditExtensionPrompts] = useState<string[]>([])
const [editHook, setEditHook] = useState('')
const [editCta, setEditCta] = useState('Shop Now')
const [editCaptions, setEditCaptions] = useState<string[]>([])
const [editAdCopy, setEditAdCopy] = useState<...>(null)
const [editDuration, setEditDuration] = useState(8)
const [overlaysEnabled, setOverlaysEnabled] = useState(true)
const [quality, setQuality] = useState<'standard' | 'premium'>('standard')
const [segmentImageIndices, setSegmentImageIndices] = useState<number[][]>([])

// Canvas
const [canvasId, setCanvasId] = useState<string | null>(null)

// Video style
const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic')

// Credits
const [credits, setCredits] = useState<{ remaining: number; totalAvailable: number } | null>(null)
```

**Step 1:** Create the new page file with imports, state declarations, and credit fetching. Import `QUALITY_COSTS` from `directors-review.tsx` (NOT define locally — this fixes the cost bug from old video-studio).

**Step 2:** Implement Step 1 render — `<ProductInput ref={productInputRef} />` with accordion collapse. Wire `onOpenMediaLibrary` to a `MediaLibraryModal` state. Wire `collapsed`/`onCollapsedChange` for accordion. Add "Next" button that calls `productInputRef.current.assemble()`, validates `canProceed`, collapses step 1, expands step 2.

**Step 3:** Implement Step 2 — sub-mode selector (Explore vs Direct cards). Copy the toggle UI from url-to-video:1366-1391. When Explore is selected, show concept generation. When Direct is selected, show the script textarea + "Write Script" button.

**Step 4:** Implement Explore path — `handleGenerateConcepts` from url-to-video:506-556. Concept cards from url-to-video:1394-2116. Include the `imageMatchText` enrichment from video-studio:547-661 (the more correct version). "Director's Review" button per concept card calls `enterDirectorsReview(i)`.

**Step 5:** Implement Direct path — textarea + `handleWriteDirectConcept` from url-to-video:932-977 (calls `/api/creative-studio/generate-direct-concept`). Populates all `edit*` state. Shows DirectorsReview when script is written.

**Step 6:** Implement Step 3 — `<DirectorsReview>` component wiring. Two handler variants: `handleGenerateFromReview` for Explore (from url-to-video:734-799), `handleDirectGenerate` for Direct (from url-to-video:987-1110). Video result display below with Edit in Video Editor link.

**Step 7:** Implement job polling — canvas-based polling via `refreshJobs` (from url-to-video:lines around the polling useEffect). 15-second interval while jobs are in progress.

**Step 8:** Implement canvas persistence — create on first generation, update on concept changes.

**Step 9:** Implement Oracle handoff — the auto-advance useEffect from direct/page:350-404. Read URL params, read `ks_oracle_handoff` from sessionStorage, pre-fill product input + direct prompt, auto-advance to step 2 Direct.

**Step 10:** Implement canvas restoration — read `?canvasId=` param, fetch canvas, restore concepts/product state. Handle `angle === 'Direct'` canvases (from direct/page:322-341).

**Step 11:** Implement UGC mode — when `?mode=ugc`, skip step 2, go straight to UGC-specific script generation + Director's Review.

**Step 12:** Run `npm run build` to verify no type errors.

**Step 13:** Commit.
```bash
git add app/dashboard/creative-studio/video-studio/page.tsx
git commit -m "feat: rewrite Video Studio as unified video creation page"
```

---

## Task 3: Update Oracle Routing — All Video Handoffs Go to Video Studio

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`
- Modify: `components/creative-studio/oracle-chips.tsx`
- Modify: `app/api/creative-studio/oracle-creative/route.ts`

**Step 1:** In `ad-studio/page.tsx`, update `handleOracleAction` (around line 2162):
- `text-to-video` case: change nav destination from `/direct` to `/video-studio`
- `url-to-video` case (line 2216): change from `setMode('url-to-video')` to `navigateFromOracle('/dashboard/creative-studio/video-studio')`
- `ugc-video` case (line 2219): change from `setMode('ugc-video')` to `navigateFromOracle('/dashboard/creative-studio/video-studio?mode=ugc')`
- `image-to-video` case (line 2222): change from `setMode('image-to-video')` to `navigateFromOracle('/dashboard/creative-studio/video-studio?tab=image')`

**Step 2:** In `ad-studio/page.tsx`, update `handleOracleChipAction` (around line 2940):
- `url-to-video` chip: change from `setMode('url-to-video')` to `router.push('/dashboard/creative-studio/video-studio')`
- `ugc-video` chip: change from `setMode('ugc-video')` to `router.push('/dashboard/creative-studio/video-studio?mode=ugc')`

**Step 3:** In `ad-studio/page.tsx`, update video mode submit in `handleOracleSubmit` (around line 2275):
- Change from in-page `handleOracleAction({ workflow: 'open-prompt', ... })` to `router.push('/dashboard/creative-studio/video-studio?prompt=...')`

**Step 4:** In `oracle-creative/route.ts`, update Opus system prompt handoff URL:
- Change `"text-to-video"` action description to mention Video Studio (cosmetic, the actual URL is built client-side)

**Step 5:** In `oracle-chips.tsx`, update to 5 chips:
- Remove "Generate Image" and "Generate Video" switch-mode chips (lines 28-29)
- Rename "Product → Video Ad" to "Create Video Ad"
- Rename "Product → Ad" to "Create Image Ad"
- Keep Clone Ad, Inspiration, UGC Video Ad

**Step 6:** Run `npm run build`.

**Step 7:** Commit.
```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx components/creative-studio/oracle-chips.tsx app/api/creative-studio/oracle-creative/route.ts
git commit -m "feat: route all video workflows to unified Video Studio"
```

---

## Task 4: Strip Video Code from Ad Studio

The big cleanup — remove ~3,500 lines of video state, handlers, and render blocks from ad-studio.

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1:** Remove imports (lines 18-19):
- Delete `import ImageToVideo from '@/components/creative-studio/image-to-video'`
- Delete `import URLToVideo from '@/components/creative-studio/url-to-video'`
- Remove unused type imports: `UGCSettings`, `UGCPromptResult`, `ProductVideoScript`, `buildUGCVeoPrompt`

**Step 2:** Trim the `mode` type union (line 292):
- Remove `'product-video' | 'ugc-video' | 'text-to-video' | 'image-to-video' | 'url-to-video'`
- Result: `'create' | 'clone' | 'inspiration' | 'upload' | 'open-prompt' | null`

**Step 3:** Delete i2v state block (lines 404-419, ~16 state vars), UGC state (lines 422-434), product-video state (lines 437-439), helper functions (lines 442-447).

**Step 4:** Delete media library bridge state for video components (lines 514-519): `i2vMediaLibraryOpen`, `i2vImageFromLibrary`, `u2vMediaLibraryOpen`, `u2vImageFromLibrary`.

**Step 5:** Delete i2v constants, polling, and handlers (lines 3195-3425): `VEO_EXTENSION_STEP`, `I2V_QUALITY_COSTS`, `refreshI2vJobs`, `handleI2vGenerate`, `handleI2vExtend`.

**Step 6:** Delete UGC and product-video handlers (lines 3883-4213): `handleUgcWriteScript`, `handleUgcApproveGenerate`, `handleProductVideoWriteScript`, `handleProductVideoGenerate`.

**Step 7:** Clean `resetToModeSelection` (lines 2984-3048): remove all i2v, ugc, product-video state resets.

**Step 8:** Delete the `url-to-video` render block (lines 4973-5024) and `image-to-video` render block (lines 5026-5076).

**Step 9:** Delete product-video/ugc-video JSX in the shared step render (lines 5237-7228 — scattered references to these modes in headers, progress steps, step 2 image selection, UGC settings, video job display). Remove all `mode === 'product-video'` and `mode === 'ugc-video'` conditionals and their associated JSX.

**Step 10:** Clean up the `oracleAutoAnalyzeRef` trigger (line 2157): remove `'url-to-video'` and `'ugc-video'` from the workflow list.

**Step 11:** Run `npm run build` — this is the critical verification. Fix any broken references from the deletion.

**Step 12:** Commit.
```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "refactor: strip video workflows from Ad Studio (~3500 lines removed)"
```

---

## Task 5: Wire Ad Studio Step 1 to ProductInput Component

Replace ad-studio's inline product analysis for the `create` mode with the shared `product-input.tsx`.

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1:** Add import for `ProductInput` and `ProductInputRef`.

**Step 2:** Add `productInputRef = useRef<ProductInputRef>(null)` state.

**Step 3:** Replace the create mode's inline product URL input + pill sections with `<ProductInput ref={productInputRef} ... />`. Wire existing state (`productUrl`, `productInfo`, etc.) to the component's `onChange` callback. The image generation pipeline downstream (Step 2: ad copy + Gemini image gen) must receive the same `ProductKnowledge` and `ProductImage[]` it gets today — do NOT change any downstream data shapes.

**Step 4:** Verify the create mode flow end-to-end: URL → analyze → pills → Step 2 ad copy + image gen. The image generation prompts must produce identical results — they consume `ProductKnowledge` which hasn't changed.

**Step 5:** Run `npm run build`.

**Step 6:** Commit.
```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "refactor: Ad Studio create mode uses shared product-input component"
```

---

## Task 6: Delete Old Files

**Files:**
- Delete: `components/creative-studio/url-to-video.tsx` (2,335 lines)
- Delete: `components/creative-studio/image-to-video.tsx` (859 lines)
- Delete: `app/dashboard/creative-studio/direct/page.tsx` (1,682 lines)
- Modify: `components/creative-studio/index.ts` (remove exports for deleted components)

**Step 1:** Delete the three files.

**Step 2:** Update `components/creative-studio/index.ts` — remove any re-exports of `URLToVideo`, `ImageToVideo`.

**Step 3:** Search codebase for any remaining imports of the deleted files:
```bash
grep -r "url-to-video\|image-to-video\|creative-studio/direct" --include="*.tsx" --include="*.ts" app/ components/ lib/
```
Fix any broken references.

**Step 4:** Check `app/dashboard/creative-studio/ai-tasks/page.tsx` — it may link to `/direct` for "Continue in Direct Studio". Update those links to `/video-studio`.

**Step 5:** Run `npm run build`.

**Step 6:** Commit.
```bash
git add -A
git commit -m "chore: delete url-to-video, image-to-video, direct page (4,876 lines removed)"
```

---

## Task 7: Update Sidebar Navigation & AI Tasks Links

**Files:**
- Modify: `components/sidebar.tsx` (if Video Studio nav item needs updating)
- Modify: `app/dashboard/creative-studio/ai-tasks/page.tsx` (studio navigation links)

**Step 1:** Verify sidebar nav — "Video Studio" should already point to `/dashboard/creative-studio/video-studio`. If "Direct Studio" exists as a nav item, remove it.

**Step 2:** In AI Tasks page, update all "Continue in Direct Studio" / "Continue in Video Studio" links to point to `/dashboard/creative-studio/video-studio` with appropriate params (`?canvasId=...` for canvas restore).

**Step 3:** Run `npm run build`.

**Step 4:** Commit.
```bash
git add components/sidebar.tsx app/dashboard/creative-studio/ai-tasks/page.tsx
git commit -m "fix: update nav links for unified Video Studio"
```

---

## Task 8: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Update the Creative Studio section to reflect the new architecture:
- Document `product-input.tsx` as a shared component
- Update Video Studio description (unified page with Explore + Direct)
- Remove references to `url-to-video.tsx`, `image-to-video.tsx`, and `/direct` page
- Update Oracle handoff documentation (all video routes go to `/video-studio`)
- Update chip documentation (5 chips)
- Update the "Key Files by Feature" tables

**Step 2:** Commit.
```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for studio consolidation"
```

---

## Execution Order & Dependencies

```
Task 1 (product-input.tsx) ─── no dependencies
Task 2 (Video Studio rewrite) ─── depends on Task 1
Task 3 (Oracle routing) ─── no dependencies (can parallel with Task 2)
Task 4 (Strip video from Ad Studio) ─── depends on Task 3
Task 5 (Ad Studio uses product-input) ─── depends on Task 1 and Task 4
Task 6 (Delete old files) ─── depends on Task 2, 4, 5
Task 7 (Nav/link updates) ─── depends on Task 6
Task 8 (CLAUDE.md) ─── depends on Task 7
```

**Parallelizable:** Tasks 1 + 3 can run in parallel. Task 2 can start once Task 1 is done.

**Critical path:** Task 1 → Task 2 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

**Build verification:** Run `npm run build` after EVERY task. The build must pass before moving to the next task.

**CRITICAL — DO NOT MODIFY:**
- `lib/prompts/*` — all prompt files
- `app/api/creative-studio/generate-image/*` — image generation pipeline
- `app/api/creative-studio/generate-video/*` — video generation API
- `app/api/creative-studio/generate-ad-concepts/*` — concept generation
- `app/api/creative-studio/plan-scene/*` — scene planning
- `remotion/*` — overlay system
- `components/creative-studio/directors-review.tsx` — already extracted, just import it
