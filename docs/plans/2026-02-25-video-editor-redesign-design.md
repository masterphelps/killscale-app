# Video Editor Redesign — Design

**Date:** 2026-02-25
**Status:** Approved
**Inspiration:** Creatify editor v2 (app.creatify.ai/editor-v2)

## Goal

Transform the video editor from RVE's default UI into a Creatify-style full-screen editor with a thin icon sidebar, flyout content panels, AI-powered natural language controls in every section, Pixabay background music, and a streamlined header. Keep RVE's proven timeline engine and overlay system underneath.

## Approach

Skin RVE's existing UI rather than replacing it. RVE's timeline, overlay engine, event bus (`ks-inject-overlays`, `ks-overlays-raw`, `ks-overlay-changed`), and the `rve-bridge.ts` translation layer all stay intact. The changes are purely in the sidebar panels, header, and layout shell.

## Full-Screen Layout

Hide the main KillScale app sidebar when on the video editor route. The editor owns the entire viewport.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Back  │  Project Name •          │  Versions  Save  Library  Export  │
├────┬──────────────────────┬──────────────────────────────────────────────┤
│    │                      │                                              │
│ 📁 │  [Flyout panel       │            [Video Preview]                   │
│ Tt │   ~280px wide,       │            Portrait (9:16) | Background      │
│ 🎵 │   opens on icon      │                                              │
│ CC │   click, closes      │                                              │
│ CTA│   on re-click]       │                                              │
│    │                      │                                              │
├────┴──────────────────────┴──────────────────────────────────────────────┤
│  Timeline (RVE multi-track: Overlay | Scene/Video | Music/Audio)         │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key layout changes:**
- Main app `<Sidebar />` hidden when `pathname.includes('/video-editor')`
- Editor height goes from `h-[calc(100vh-4rem)]` to `h-screen`
- RVE's right properties panel removed (no avatars — not relevant)
- Icon rail ~60px, flyout panel ~280px (Creatify proportions)

## Header Bar

```
← Back  │  Project Name •  │  🕐 Versions  💾 Save  📚 Library  ⬇ Export
```

| Element | Behavior |
|---------|----------|
| **Back** | Context-aware: returns to Video Studio, AI Tasks, Creative Studio, etc. (existing logic) |
| **Project Name** | Click-to-rename, dirty dot indicator (existing) |
| **Versions** | Dropdown of saved overlay versions (existing render-overlay versions) |
| **Save** | Saves overlay config via POST `/api/creative-studio/render-overlay` (existing) |
| **Library** | Saves to media library via `/api/creative-studio/save-video-to-library` (existing) |
| **Export** | Rightmost. Triggers SSE render via `/api/creative-studio/render-video` (existing) |

**Removed from header:** Add Voice button, Add Media button, Create Ad button.

## Sidebar Icon Rail

Thin vertical strip (~60px) with Lucide icons matching main app sidebar sizing:

| Icon | Panel | Lucide Icon |
|------|-------|-------------|
| Media | Browse/add media from library | `FolderOpen` |
| Text | Add text overlays | `Type` |
| Audio | Voiceover + background music | `Music` |
| Captions | Caption styles + content | `Subtitles` |
| CTA | Call-to-action templates | `MousePointerClick` |

Click an icon to open its flyout panel. Click again (or click a different icon) to close/switch.

## AI Actions Pattern

Every sidebar panel has a collapsible section at the top:

```
┌─────────────────────────┐
│  ✦ AI                   │
│  ┌───────────────────┐  │
│  │ Quick action btn  │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Describe what you │  │
│  │ want...           │  │
│  └───────────────────┘  │
│  [Generate]              │
└─────────────────────────┘
```

- Purple sparkle icon (✦) heading
- One-click quick actions specific to the panel
- Natural language text input for custom instructions
- Calls existing `/api/creative-studio/generate-overlay` with panel-specific instruction prefix
- Example: Captions AI section sends `"Generate captions: {user input}"`, CTA sends `"Create CTA: {user input}"`

## Panel 1: Media

```
┌─────────────────────────┐
│  Media | Collections     │  ← tab toggle
├─────────────────────────┤
│  [Upload]                │
│  [All] [Videos] [Images] │  ← type filter pills
├─────────────────────────┤
│  ┌─────┐ ┌─────┐        │
│  │thumb│ │thumb│         │  ← 2-column masonry grid
│  └─────┘ └─────┘         │
│  ┌─────┐ ┌───────┐      │
│  │     │ │       │       │  ← natural aspect ratios
│  │     │ │       │       │
│  └─────┘ └───────┘       │
└─────────────────────────┘
```

- Reuses `MediaGalleryCard` with `minimal` prop (from media gallery redesign)
- Same type filter pills as media page: All / Videos / Images
- Collections sub-tab shows collection folders
- Excludes Projects (WIP items, not rendered)
- 2-column layout (constrained by ~280px flyout width)
- Click media item → adds to timeline as a clip via `ks-inject-overlays` event

## Panel 2: Text

```
┌─────────────────────────┐
│  ✦ AI                   │
│  [Describe text...]     │
│  [Generate]              │
├─────────────────────────┤
│  ┌─────────────────────┐│
│  │     Headline        ││  ← click to add
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │   Subheadline       ││
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │    Body Text        ││
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │   Description       ││
│  └─────────────────────┘│
└─────────────────────────┘
```

- Four text preset buttons (Headline, Subheadline, Body Text, Description)
- Each adds a `TextOverlay` to the timeline at the playhead position with preset sizing
- AI section accepts natural language: "Add a bold headline that says 'Limited Offer'" etc.

## Panel 3: Audio

```
┌─────────────────────────┐
│  ✦ AI                   │
│  [Describe audio...]    │
│  [Generate]              │
├─────────────────────────┤
│  Voiceover              │
│  Voice: [Alloy ▼]       │
│  [Generate Voiceover]   │
├─────────────────────────┤
│  Background Music       │
│  🔍 Search...           │
│  [All] [Upbeat] [Chill] │
│  [Electronic] [Acoustic]│
│  ┌─────────────────────┐│
│  │ 🎵 Track  ▶  1:30  ││  ← play preview
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │ 🎵 Track  ▶  2:45  ││
│  └─────────────────────┘│
└─────────────────────────┘
```

**Voiceover section:**
- Dropdown with 6 OpenAI voices (alloy, echo, fable, onyx, nova, shimmer)
- "Generate Voiceover" button — uses existing `/api/creative-studio/generate-voiceover`
- Existing behavior moved from header dropdown to sidebar panel

**Background Music section (new):**
- Search bar + genre/mood filter pills
- Pixabay Music API integration via new proxy route
- Track list with album art, name, artist, duration, play preview button
- Click track → adds as `SoundOverlay` on the Music timeline track

## Panel 4: Captions

```
┌─────────────────────────┐
│  Style | Content         │  ← tab toggle
├─────────────────────────┤
│  ✦ AI                   │
│  [Generate Captions]     │  ← one-click Whisper transcription
│  [Custom instructions...│
│  [Generate]              │
├─────────────────────────┤
│  Presets                 │
│  ┌─────────────────────┐│
│  │ Hey there! This is  ││  ← visual preview
│  │ Black Block         ││
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │ HEY THERE! THIS IS ││
│  │ Bold Impact         ││
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │ frosted glass text  ││
│  │ Clean Glass         ││
│  └─────────────────────┘│
│  ... more presets        │
└─────────────────────────┘
```

**Style tab:**

| Preset | Maps to `OverlayConfig.style` | Description |
|--------|-------------------------------|-------------|
| Black Block | `capcut` | White text on dark semi-transparent bg |
| Bold Impact | `bold` | Uppercase, high contrast, amber keyword highlight |
| Clean Glass | `clean` | Frosted glass effect, teal highlight |
| Minimal | `minimal` | No background, blue keyword highlight |
| Word Flash | new: `wordflash` | Animated single-word highlight |
| Promo Punch | new: `promopunch` | Red keyword pop with bold text |

Each preset shown as a visual preview card. Click to apply style to all captions.

**Content tab:**
- Shows auto-transcribed caption text broken into timed segments
- Editable text per segment
- Timestamps shown alongside each segment

## Panel 5: CTA

```
┌─────────────────────────┐
│  ✦ AI                   │
│  [Describe CTA...]      │
│  [Generate]              │
├─────────────────────────┤
│  Templates               │
│  ┌─────┐ ┌─────┐        │
│  │ BUY │ │SHOP │         │  ← 2-col visual grid
│  │ NOW │ │ NOW │         │
│  └─────┘ └─────┘         │
│  ┌─────┐ ┌─────┐        │
│  │LEARN│ │SIGN │         │
│  │MORE │ │ UP  │         │
│  └─────┘ └─────┘         │
└─────────────────────────┘
```

- Pre-designed CTA overlay templates in a 2-column visual grid
- Each template is a full-frame preview card showing the CTA style
- Click to add CTA overlay to timeline at current playhead
- AI section: "Create a CTA button that says 'Get 50% Off' with a red background"

## New API Route: Music Search

**`GET /api/creative-studio/music-search`**

Proxies to Pixabay Music API:
- Query params: `q` (search), `genre` (filter), `mood` (filter), `page`
- Returns: `{ tracks: [{ id, title, artist, duration, previewUrl, genre, mood, downloadUrl }] }`
- Free tier: sufficient for browsing. Register for API key for higher limits.
- No attribution required for Pixabay music.

## Files to Modify

### Heavy changes
- `app/dashboard/creative-studio/video-editor/page.tsx` — Restructure header (remove Add Voice/Add Media, reorder to Versions/Save/Library/Export), full-height `h-screen`, wire new sidebar panel events
- `lib/rve/components/react-video-editor.tsx` — Replace sidebar panel system with new icon rail + flyout architecture, swap icons to Lucide, customize panel widths

### New files
- `lib/rve/components/panels/media-panel.tsx` — Media browser flyout with gallery cards
- `lib/rve/components/panels/text-panel.tsx` — Text preset buttons + AI section
- `lib/rve/components/panels/audio-panel.tsx` — Voiceover + Pixabay music browser
- `lib/rve/components/panels/captions-panel.tsx` — Style presets + content editing + AI
- `lib/rve/components/panels/cta-panel.tsx` — CTA template grid + AI section
- `lib/rve/components/panels/ai-section.tsx` — Reusable AI sparkle section component
- `app/api/creative-studio/music-search/route.ts` — Pixabay music API proxy

### Light changes
- `app/dashboard/layout.tsx` — Hide main `<Sidebar />` when `pathname.includes('/video-editor')`
- `remotion/types.ts` — Add `wordflash` and `promopunch` to `OverlayStyle` type
- `lib/rve-bridge.ts` — Handle new caption style presets in conversion

### No changes
- `app/api/creative-studio/generate-overlay/route.ts` — Already supports natural language instructions
- `app/api/creative-studio/render-overlay/route.ts` — Save/version system unchanged
- `app/api/creative-studio/video-composition/route.ts` — Composition CRUD unchanged
- `app/api/creative-studio/generate-voiceover/route.ts` — Voiceover generation unchanged
- `remotion/AdOverlay.tsx` — Server render composition unchanged (new styles added to types only)
- Timeline internals (`lib/rve/components/advanced-timeline/`) — Untouched
