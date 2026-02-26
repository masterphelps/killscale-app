# Media Gallery Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Creative Studio media page from a performance-dashboard-hybrid into a clean, Creatify-style media gallery with masonry layout, natural aspect ratios, and minimal cards.

**Architecture:** Strip performance filters/overlays from the media page and cards. Keep all performance data in the TheaterModal (opened on click). Restructure tabs to Media/Collections/Projects with simple type filter pills and gallery-oriented sort options.

**Tech Stack:** React, Tailwind CSS, react-masonry-css (already installed), Lucide icons

**Design Doc:** `docs/plans/2026-02-25-media-gallery-redesign-design.md`

---

### Task 1: Simplify MediaGalleryCard — Strip Performance Overlays

**Files:**
- Modify: `components/creative-studio/media-gallery-card.tsx`

**Step 1: Add a `minimal` prop to MediaGalleryCard**

Add a new optional prop `minimal?: boolean` to the component. When `true`, the card renders in clean gallery mode. This preserves backwards compatibility for other pages (Active Ads, Best Ads) that still use the full card.

In the `MediaGalleryCardProps` interface, add:
```typescript
minimal?: boolean
```

**Step 2: Strip score-based border glow when `minimal`**

Find the card's outer `div` that applies `scoreStyles.glow` and `scoreStyles.border`. When `minimal` is true, skip those styles entirely. The card should have:
- `rounded-xl overflow-hidden` (no border, no glow)
- Background: transparent (the image fills edge to edge)

Replace the card wrapper conditional:
```typescript
// When minimal, clean card with no border/glow
const cardClasses = minimal
  ? 'rounded-xl overflow-hidden cursor-pointer group'
  : `rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group border ${scoreStyles.border} ${scoreStyles.glow}`
```

**Step 3: Use natural aspect ratio when `minimal`**

Replace the fixed `aspect-[4/3]` container with a natural-height container when `minimal`. If the item has `width` and `height`, compute `paddingBottom` as `(height/width * 100)%`. Fallback to `aspect-[4/3]` if dimensions unknown.

```typescript
const naturalAspect = minimal && item.width && item.height
  ? { paddingBottom: `${(item.height / item.width) * 100}%` }
  : undefined
```

Then in JSX:
```tsx
<div
  className={minimal ? 'relative w-full' : 'relative aspect-[4/3]'}
  style={naturalAspect}
>
  {/* existing media content */}
</div>
```

**Step 4: Simplify top-left badge when `minimal`**

When `minimal`, replace the fatigue ring / rank badge with a small semi-transparent media type icon:
```tsx
{minimal ? (
  <div className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm">
    {item.mediaType === 'video' ? (
      <Film className="w-3.5 h-3.5 text-white/80" />
    ) : (
      <ImageIcon className="w-3.5 h-3.5 text-white/80" />
    )}
  </div>
) : (
  /* existing fatigue ring / rank badge logic */
)}
```

**Step 5: Remove footer content when `minimal`**

When `minimal`, replace the entire card footer (score pills, revenue/spend, metrics grid, ad count row) with just the filename below the card:
```tsx
{minimal ? (
  <div className="flex items-center justify-between mt-2 px-0.5">
    <p className="text-sm text-zinc-300 truncate flex-1">{item.name || `${item.mediaType === 'video' ? 'Video' : 'Image'}`}</p>
    <div className="flex items-center gap-1 flex-shrink-0">
      {onStar && (
        <button
          onClick={(e) => { e.stopPropagation(); onStar() }}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 transition-colors"
        >
          <Star className={cn('w-4 h-4', item.isStarred && 'fill-amber-400 text-amber-400')} />
        </button>
      )}
      {onMenuClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onMenuClick(e) }}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
) : (
  /* existing full footer */
)}
```

**Step 6: Remove media type pill (top-right) when `minimal`**

The top-right "video" / "image" badge is redundant when the top-left icon already shows type. Skip it when `minimal`.

**Step 7: Verify hover-to-play and scroll-to-play still work**

These are driven by IntersectionObserver and mouseenter/mouseleave events on the media container. They don't depend on any of the removed elements. No changes needed — just verify they still function after the card cleanup.

**Step 8: Commit**

```bash
git add components/creative-studio/media-gallery-card.tsx
git commit -m "feat: add minimal mode to MediaGalleryCard for clean gallery display"
```

---

### Task 2: Update GalleryGrid — Wider Layout, More Columns, Tighter Gaps

**Files:**
- Modify: `components/creative-studio/gallery-grid.tsx`

**Step 1: Add `minimal` prop and update breakpoints**

Add `minimal?: boolean` prop. When true, use wider layout with 5 columns and tighter gaps.

```typescript
interface GalleryGridProps {
  // ... existing props
  minimal?: boolean
}
```

Update breakpoint columns:
```typescript
const defaultBreakpoints = {
  default: 4,
  1536: 4,
  1280: 3,
  1024: 3,
  768: 2,
  640: 1,
}

const minimalBreakpoints = {
  default: 5,
  1536: 5,
  1280: 4,
  1024: 3,
  768: 2,
  640: 1,
}
```

**Step 2: Update Masonry wrapper classes when `minimal`**

```tsx
<div className={minimal ? '' : 'max-w-[1200px] mx-auto'}>
  <Masonry
    breakpointCols={minimal ? minimalBreakpoints : defaultBreakpoints}
    className={minimal ? 'flex -ml-4 w-auto' : 'flex -ml-6 w-auto'}
    columnClassName={minimal ? 'pl-4 bg-clip-padding' : 'pl-6 bg-clip-padding'}
  >
    {items.map((item, index) => (
      <div key={item.id} className={minimal ? 'mb-4' : 'mb-6'}>
        <MediaGalleryCard
          item={item}
          index={index}
          minimal={minimal}
          // ... rest of props unchanged
        />
      </div>
    ))}
  </Masonry>
</div>
```

**Step 3: Update loading skeleton for minimal mode**

```tsx
if (isLoading) {
  return (
    <div className={minimal ? '' : 'max-w-[1200px] mx-auto'}>
      <div className={cn(
        'grid gap-4',
        minimal
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
      )}>
        {Array.from({ length: minimal ? 10 : 8 }).map((_, i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add components/creative-studio/gallery-grid.tsx
git commit -m "feat: add minimal mode to GalleryGrid with wider layout and tighter gaps"
```

---

### Task 3: Redesign Media Page — New Tabs, Filters, and Sort

**Files:**
- Modify: `app/dashboard/creative-studio/media/page.tsx`

**Step 1: Update types and default state**

Replace the old type definitions:
```typescript
// OLD
type ViewMode = 'gallery' | 'table'
type SortOption = 'hookScore' | 'holdScore' | ... (17 options)
type MediaTab = 'video' | 'image' | 'collection' | 'project'

// NEW
type SortOption = 'name' | 'syncedAt' | 'fileSize' | 'mediaType'
type MediaTab = 'media' | 'collection' | 'project'
type TypeFilter = 'all' | 'video' | 'image'
```

Update default state:
```typescript
const [mediaTab, setMediaTab] = useState<MediaTab>('media')
const [sortBy, setSortBy] = useState<SortOption>('syncedAt')
const [sortDesc, setSortDesc] = useState(true)
const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
```

**Step 2: Remove old state and imports**

Remove these state variables:
- `viewMode` / `setViewMode`
- `funnelThresholds` / `setFunnelThresholds`

Remove these imports:
- `FunnelFilterBar` from creative-studio components
- `MediaTable` from creative-studio components
- `DatePicker`, `DatePickerButton`, `DATE_PRESETS` from date-picker
- `LayoutGrid`, `List` from lucide (view mode toggle icons)
- `FunnelStage` type

Remove from `useCreativeStudio()` destructuring:
- `sourceFilter`, `setSourceFilter`
- `datePreset`, `setDatePreset`, `customStartDate`, `customEndDate`, `setCustomStartDate`, `setCustomEndDate`, `showDatePicker`, `setShowDatePicker`

**Step 3: Remove deleted callbacks and memos**

Remove:
- `toggleFunnelFilter`, `setFunnelThreshold`, `clearFunnelFilters` callbacks
- `scaleThreshold` useMemo
- `funnelStats` useMemo
- `handleTableSort` callback

**Step 4: Simplify `filteredAssets` memo**

Replace the complex funnel-filtering + performance-sorting logic with simple gallery sorts:

```typescript
const filteredAssets = useMemo(() => {
  let items = [...assets]

  // Type filter
  if (typeFilter === 'video') items = items.filter(a => a.mediaType === 'video' && (a as any).sourceType !== 'project')
  else if (typeFilter === 'image') items = items.filter(a => a.mediaType === 'image')

  // Sort
  items.sort((a, b) => {
    let comparison = 0
    switch (sortBy) {
      case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
      case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
      case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
      case 'mediaType': comparison = a.mediaType.localeCompare(b.mediaType); break
    }
    return sortDesc ? -comparison : comparison
  })

  return items.map(item => ({
    ...item,
    isStarred: starredIds.has(item.mediaHash),
  }))
}, [assets, typeFilter, sortBy, sortDesc, starredIds])
```

**Step 5: Remove `sourceFilteredAssets` memo**

Remove the `sourceFilteredAssets` memo entirely. Update `videos`, `images`, `projects` to derive from `filteredAssets` directly:

```typescript
const projects = useMemo(() => assets.filter(a => (a as any).sourceType === 'project').map(item => ({ ...item, isStarred: starredIds.has(item.mediaHash) })), [assets, starredIds])
```

The `videos` and `images` memos can be removed — `filteredAssets` already handles the type filter for the Media tab.

**Step 6: Rewrite the JSX toolbar and tabs**

Replace the entire section from "Funnel Filters + Sort Controls" through "Source Filter Pills" with:

```tsx
{/* Tabs */}
<div className="flex items-center gap-1 border-b border-border">
  <button
    onClick={() => setMediaTab('media')}
    className={cn(
      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
      mediaTab === 'media'
        ? 'border-white text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    )}
  >
    Media ({filteredAssets.length})
  </button>
  <button
    onClick={() => setMediaTab('collection')}
    className={cn(
      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
      mediaTab === 'collection'
        ? 'border-white text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    )}
  >
    <FolderOpen className={cn('w-4 h-4', mediaTab === 'collection' ? 'text-amber-400' : '')} />
    Collections ({collections.length})
  </button>
  <button
    onClick={() => setMediaTab('project')}
    className={cn(
      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
      mediaTab === 'project'
        ? 'border-white text-white'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    )}
  >
    <FolderKanban className={cn('w-4 h-4', mediaTab === 'project' ? 'text-emerald-400' : '')} />
    Projects ({projects.length})
  </button>
</div>

{/* Media tab controls */}
{mediaTab === 'media' && (
  <div className="flex items-center justify-between">
    {/* Type filter pills */}
    <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
      {(['all', 'video', 'image'] as const).map(filter => (
        <button
          key={filter}
          onClick={() => setTypeFilter(filter)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            typeFilter === filter
              ? 'bg-white/10 text-white'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          {filter === 'all' ? 'All' : filter === 'video' ? 'Videos' : 'Images'}
        </button>
      ))}
    </div>

    {/* Sort dropdown */}
    <div className="relative" ref={sortDropdownRef}>
      <button
        onClick={() => setShowSortDropdown(!showSortDropdown)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-zinc-400 hover:text-white transition-colors"
      >
        <span>Sort: {
          sortBy === 'name' ? 'Name' :
          sortBy === 'syncedAt' ? 'Date added' :
          sortBy === 'fileSize' ? 'File size' :
          'Type'
        }</span>
        <span>{sortDesc ? '↓' : '↑'}</span>
      </button>

      {showSortDropdown && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {([
            { value: 'syncedAt', label: 'Date added' },
            { value: 'name', label: 'Name' },
            { value: 'fileSize', label: 'File size' },
            { value: 'mediaType', label: 'Type' },
          ] as const).map((option) => (
            <button
              key={option.value}
              onClick={() => {
                if (sortBy === option.value) {
                  setSortDesc(!sortDesc)
                } else {
                  setSortBy(option.value)
                  setSortDesc(true)
                }
                setShowSortDropdown(false)
              }}
              className={cn(
                'w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors',
                sortBy === option.value
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-300 hover:bg-white/5'
              )}
            >
              <span>{option.label}</span>
              {sortBy === option.value && (
                <span className="text-xs text-zinc-500">{sortDesc ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
)}
```

**Step 7: Simplify content area**

Replace the content area. Remove the Gallery/Table toggle branch. The Media tab always shows GalleryGrid in `minimal` mode:

```tsx
{/* Content */}
<div>
  {mediaTab === 'collection' ? (
    /* existing collection UI — unchanged */
  ) : mediaTab === 'project' ? (
    /* existing project UI — unchanged */
  ) : (
    /* Media tab - clean gallery */
    <GalleryGrid
      items={filteredAssets}
      isLoading={isLoading}
      onSelect={handleSelect}
      onStar={toggleStar}
      onMenu={handleMenuClick}
      videoSources={videoSources}
      onRequestVideoSource={fetchVideoSource}
      minimal
    />
  )}
</div>
```

**Step 8: Remove results count text**

Delete the "24 videos filtered by hook 75+" results count section. The tab already shows the count.

**Step 9: Update header subtitle**

Change:
```tsx
<p className="text-zinc-500 mt-1">Browse and analyze all creative assets by media</p>
```
To:
```tsx
<p className="text-zinc-500 mt-1">Browse and organize your creative assets</p>
```

**Step 10: Widen the max-width container**

Change the outer container from `max-w-[1200px]` to remove the cap (or use `max-w-[1600px]`) so the masonry grid has room for 5 columns:

```tsx
<div className="px-4 lg:px-8 py-6 space-y-6">
  <div className="space-y-6">
```

**Step 11: Clean up unused imports**

Remove imports that are no longer used:
- `LayoutGrid`, `List` (view mode toggle)
- `FunnelFilterBar` component
- `MediaTable` component
- `DatePicker`, `DatePickerButton`, `DATE_PRESETS`

Keep all other imports (collection-related, launch wizard, etc).

**Step 12: Build and verify**

```bash
rm -rf .next && npm run build
```

Expected: Build succeeds with no type errors. Any unused variable warnings should be addressed.

**Step 13: Commit**

```bash
git add app/dashboard/creative-studio/media/page.tsx
git commit -m "feat: redesign media page with clean gallery layout, simplified tabs and filters"
```

---

### Task 4: Verify and Polish

**Step 1: Start dev server and visual check**

```bash
npm run dev
```

Navigate to `/dashboard/creative-studio/media` and verify:
- 3 tabs (Media / Collections / Projects) render correctly
- Type filter pills (All / Videos / Images) work
- Sort dropdown shows 4 options (Date added, Name, File size, Type)
- Cards are clean — no score pills, no colored borders, no fatigue ring
- Natural aspect ratios render (portrait videos tall, landscape images wide)
- Masonry layout fills available width with tighter gaps
- Hover-to-play works on video cards
- Clicking a card opens TheaterModal with full performance data
- Star button and context menu work on cards
- Collections and Projects tabs work unchanged

**Step 2: Mobile check**

Verify responsive behavior:
- 1 column on mobile, 2 on tablet
- Cards stack properly in masonry
- Sort dropdown is accessible on mobile

**Step 3: Fix any issues found**

Address any visual or functional issues discovered during testing.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish media gallery redesign"
```
