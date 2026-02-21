# AI Image Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fully prompt-based AI image editor at `/dashboard/creative-studio/image-editor` that uses Gemini 3 Pro for all edits — text replacement via detected text blocks, free-form prompt edits, version history with thumbnail strip, and persistent sessions.

**Architecture:** Full-screen immersive page (like video editor) with floating panels. Gemini Vision extracts text blocks shown in a collapsible left panel. Edits go through the existing `adjust-image` API. Versions stored as Supabase Storage URLs in an `image_editor_sessions` table. Entry points from Ad Studio, Media Library, sidebar nav, and direct upload.

**Tech Stack:** Next.js 14 (App Router), Gemini 3 Pro Image Preview (edits + text detection), Supabase (Postgres + Storage), Tailwind CSS, Lucide icons.

---

### Task 1: Database Migration — `image_editor_sessions` Table

**Files:**
- Create: `supabase/migrations/055_image_editor_sessions.sql`

**Step 1: Write the migration**

```sql
-- Image Editor Sessions
-- Stores persistent editing sessions with version history
CREATE TABLE IF NOT EXISTS image_editor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('generated', 'library', 'upload')),
  source_id TEXT,
  original_image_url TEXT NOT NULL,
  versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_text JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_image_editor_sessions_user ON image_editor_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_image_editor_sessions_workspace ON image_editor_sessions(workspace_id);

-- RLS
ALTER TABLE image_editor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own image editor sessions" ON image_editor_sessions;
CREATE POLICY "Users can manage own image editor sessions" ON image_editor_sessions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to image editor sessions" ON image_editor_sessions;
CREATE POLICY "Service role full access to image editor sessions" ON image_editor_sessions
  FOR ALL USING (auth.role() = 'service_role');
```

**Step 2: Apply migration via Supabase MCP tool**

Use `apply_migration` with name `image_editor_sessions` and the SQL above.

**Step 3: Commit**

```bash
git add supabase/migrations/055_image_editor_sessions.sql
git commit -m "feat: add image_editor_sessions table"
```

---

### Task 2: API — Text Detection Endpoint

**Files:**
- Create: `app/api/creative-studio/detect-text/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAI } from '@/lib/google-ai'

const MODEL_NAME = 'gemini-3-pro-image-preview'

interface DetectTextRequest {
  imageBase64: string
  imageMimeType: string
}

interface DetectedTextBlock {
  text: string
  role: 'headline' | 'subtext' | 'cta' | 'other'
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectTextRequest = await request.json()

    if (!body.imageBase64 || !body.imageMimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64, imageMimeType' },
        { status: 400 }
      )
    }

    const client = getGoogleAI()
    if (!client) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: body.imageMimeType,
                data: body.imageBase64,
              }
            },
            {
              text: `Analyze this advertisement image and extract ALL visible text.

Return a JSON array where each element has:
- "text": the exact text as it appears in the image
- "role": one of "headline" (large/prominent text), "subtext" (smaller supporting text), "cta" (call-to-action buttons/text), or "other" (any other text like disclaimers, logos)

Rules:
- Extract EVERY text block visible in the image
- Preserve exact spelling, capitalization, and punctuation
- Order from most prominent (largest/boldest) to least prominent
- If no text is found, return an empty array []

Return ONLY the JSON array, no explanation or markdown formatting.`
            }
          ]
        }
      ],
      config: {
        responseModalities: ['TEXT'],
      }
    })

    const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]'

    // Parse the JSON response, handling potential markdown wrapping
    let textBlocks: DetectedTextBlock[] = []
    try {
      const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      textBlocks = JSON.parse(cleaned)
    } catch {
      console.error('[DetectText] Failed to parse Gemini response:', textContent)
      textBlocks = []
    }

    return NextResponse.json({ textBlocks })
  } catch (err) {
    console.error('[DetectText] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Text detection failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add app/api/creative-studio/detect-text/route.ts
git commit -m "feat: add text detection endpoint using Gemini Vision"
```

---

### Task 3: API — Image Editor Session CRUD

**Files:**
- Create: `app/api/creative-studio/image-editor-session/route.ts`

**Step 1: Create the endpoint**

Follow the exact pattern from `app/api/creative-studio/ad-session/route.ts`. Handlers:

- **GET**: `?userId=xxx` + `?sessionId=xxx` returns single session. `?userId=xxx` without sessionId returns list (ordered by `created_at desc`, limit 50).
- **POST**: Creates new session with `userId`, `workspaceId`, `sourceType`, `sourceId`, `originalImageUrl`. Returns created session.
- **PATCH**: Updates session by `sessionId`. Accepts partial fields: `versions`, `detectedText`, `updatedAt`. Used to append versions and update text detection results.
- **DELETE**: Deletes session by `sessionId` + `userId`.

Use `createClient` with `SUPABASE_SERVICE_ROLE_KEY` (same as ad-session).

**Step 2: Commit**

```bash
git add app/api/creative-studio/image-editor-session/route.ts
git commit -m "feat: add image editor session CRUD API"
```

---

### Task 4: Image Editor Page — Core Layout & Image Display

**Files:**
- Create: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Build the page shell**

Full-screen layout with:
- Dark background (`bg-bg-dark`)
- Fixed header bar with: back arrow (router.back or `/dashboard/creative-studio`), "AI Image Editor" title, version indicator, action buttons (Save, Download, Launch as Ad)
- Main image area: `<img>` centered with `object-contain`, max height/width respecting header + prompt bar
- Fixed bottom prompt bar: text input + submit button
- Loading state while image loads

**URL params** (via `useSearchParams`):
- `?sessionId=xxx` — resume existing session (load from API)
- `?imageUrl=xxx` — start from a Supabase Storage URL (generated image)
- `?mediaId=xxx` — start from media library item (fetch storage URL)
- No params — show upload drop zone

**State:**
```typescript
const [originalImage, setOriginalImage] = useState<{base64: string, mimeType: string, url: string} | null>(null)
const [versions, setVersions] = useState<Array<{base64?: string, url: string, prompt: string, createdAt: string}>>([])
const [currentVersionIndex, setCurrentVersionIndex] = useState(0)
const [isEditing, setIsEditing] = useState(false)
const [prompt, setPrompt] = useState('')
const [sessionId, setSessionId] = useState<string | null>(null)
const [detectedText, setDetectedText] = useState<Array<{text: string, role: string}>>([])
const [isDetectingText, setIsDetectingText] = useState(false)
const [textPanelOpen, setTextPanelOpen] = useState(false)
```

**Image loading flow:**
1. If `sessionId` → fetch session from API → load original + versions
2. If `imageUrl` → fetch image, convert to base64 → create new session
3. If `mediaId` → fetch from media library → get storage URL → same as imageUrl
4. No params → show drag-and-drop upload zone

**Step 2: Commit**

```bash
git add app/dashboard/creative-studio/image-editor/page.tsx
git commit -m "feat: add image editor page with core layout"
```

---

### Task 5: Image Editor — Prompt Editing & Version Strip

**Files:**
- Modify: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Implement prompt submission**

On submit:
1. Get current version's base64 (or fetch from URL if only URL available)
2. Call `POST /api/creative-studio/adjust-image` with `imageBase64`, `imageMimeType`, `adjustmentPrompt`
3. Upload result to Supabase Storage via `POST /api/creative-studio/save-generated-image` (saveToLibrary: false)
4. Append new version to state: `{url: storageUrl, prompt, createdAt}`
5. PATCH session to persist versions array
6. Advance `currentVersionIndex`

**Step 2: Build version thumbnail strip**

Horizontal scroll container above prompt bar:
- First thumbnail = original (labeled "Original" below)
- Each subsequent thumbnail = edit version (labeled "v1", "v2", etc.)
- Current version has `ring-2 ring-purple-500` glow
- Click any to set `currentVersionIndex` — main image updates
- Thumbnails are small (64x64 or 80x80) with `object-cover rounded-lg`
- Editing from a past version: discard versions after the selected one (confirm first)

**Step 3: Commit**

```bash
git add app/dashboard/creative-studio/image-editor/page.tsx
git commit -m "feat: add prompt editing and version strip to image editor"
```

---

### Task 6: Image Editor — Text Detection Panel

**Files:**
- Modify: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Implement text detection**

- If source is `generated` → auto-call `/api/creative-studio/detect-text` on image load
- Otherwise → show "Detect Text" button in the floating panel header
- Store results in `detectedText` state and persist to session via PATCH

**Step 2: Build floating text panel**

Left side floating panel (absolute positioned, collapsible):
- Header: "Text Blocks" + collapse toggle + "Detect Text" button (if not auto-detected)
- List of text block cards, each showing:
  - The detected text (truncated if long)
  - Role badge (Headline / Subtext / CTA / Other) with color coding
  - Pencil icon button to edit
- Edit mode per block:
  - Input field pre-filled with current text
  - "Apply" button + "Cancel" button
  - On apply → sends `"Change the text '{oldText}' to '{newText}'. Keep everything else identical."` to adjust-image
  - Same version flow as prompt editing (upload, persist, advance)

**Step 3: Re-detect after edits**

After any successful edit (prompt or text swap), re-run text detection on the new version to update the panel.

**Step 4: Commit**

```bash
git add app/dashboard/creative-studio/image-editor/page.tsx
git commit -m "feat: add text detection panel to image editor"
```

---

### Task 7: Image Editor — Save, Download, Launch as Ad

**Files:**
- Modify: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Save to Library**

Call `POST /api/creative-studio/save-generated-image` with `saveToLibrary: true`:
- Uploads to Meta API (gets real mediaHash)
- Uploads to Supabase Storage
- Inserts into `media_library` table
- Show success toast/indicator

**Step 2: Download**

Client-side download:
```typescript
const link = document.createElement('a')
link.href = `data:${mimeType};base64,${base64}`
link.download = `killscale-edit-${Date.now()}.png`
link.click()
```
If only URL available (no base64 in memory), fetch the URL first.

**Step 3: Launch as Ad**

Open Launch Wizard modal (same pattern as video editor):
- Pass current image as a Creative with `imageUrl` and `imageHash`
- Requires saving to library first (Meta needs the mediaHash)

**Step 4: Commit**

```bash
git add app/dashboard/creative-studio/image-editor/page.tsx
git commit -m "feat: add save, download, and launch-as-ad to image editor"
```

---

### Task 8: Image Editor — Upload Drop Zone

**Files:**
- Modify: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Build upload UI**

When no image params in URL, show a centered drop zone:
- Dashed border, upload icon, "Drop an image or click to browse"
- Accept: image/png, image/jpeg, image/webp
- On drop/select: read as base64, set as `originalImage`, create session, navigate to prompt view
- Same drag-and-drop pattern as Ad Studio upload mode (`isDragging` state, `onDragEnter`/`onDragLeave`/`onDrop`)

**Step 2: Commit**

```bash
git add app/dashboard/creative-studio/image-editor/page.tsx
git commit -m "feat: add upload drop zone to image editor"
```

---

### Task 9: Sidebar Nav + Entry Points

**Files:**
- Modify: `components/sidebar.tsx` (add nav item)
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx` (add "Edit" button on generated images)
- Modify: `app/dashboard/creative-studio/ai-tasks/page.tsx` (add "Image Edits" section + "Edit" buttons)

**Step 1: Add sidebar nav item**

In `components/sidebar.tsx`, add to `creativeStudioItems` array:
```typescript
{ href: '/dashboard/creative-studio/image-editor', label: 'Image Editor', icon: Pencil },
```
Place it after "AI Tasks" in the list.

**Step 2: Add "Edit" button in Ad Studio**

On generated image cards, add a Pencil icon button that navigates to:
```
/dashboard/creative-studio/image-editor?imageUrl=${encodeURIComponent(storageUrl)}
```

**Step 3: Add Image Edits section to AI Tasks**

Follow the collapsible section pattern (see design exploration). Add state for `imageEdits`, `isLoadingImageEdits`, `imageEditsExpanded`. Fetch from `/api/creative-studio/image-editor-session?userId=xxx`. Each list item shows thumbnail + date + edit count. Click navigates to `/image-editor?sessionId=xxx`.

**Step 4: Commit**

```bash
git add components/sidebar.tsx app/dashboard/creative-studio/ad-studio/page.tsx app/dashboard/creative-studio/ai-tasks/page.tsx
git commit -m "feat: add image editor entry points in sidebar, ad studio, and AI tasks"
```

---

### Task 10: Polish & Frontend Design

**Files:**
- Modify: `app/dashboard/creative-studio/image-editor/page.tsx`

**Step 1: Apply frontend-design skill**

Use the `frontend-design` skill to polish the image editor UI:
- Purple/blue theme consistent with KillScale
- Smooth transitions on version changes
- Loading shimmer during edits
- Text panel hover states and animations
- Responsive mobile layout (text panel as bottom sheet, version strip swipeable)
- Proper dark mode styling matching `bg-bg-dark`, `bg-bg-card`, `border-border` tokens

**Step 2: Final build verification**

```bash
rm -rf .next && npm run build
```

**Step 3: Commit and push**

```bash
git add -A
git commit -m "feat: polish AI Image Editor UI"
git push
```
