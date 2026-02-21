# AI Image Editor — Design Document

## Overview

A fully prompt-based AI image editor powered by Gemini 3 Pro. No cursor interaction with the image — all edits happen via text prompts and inline text replacement. Full-screen immersive layout matching the video editor pattern.

**Route:** `/dashboard/creative-studio/image-editor`

## Layout

Full-screen immersive with floating panels:

- **Header bar** (fixed top): Back arrow, "AI Image Editor" title, version indicator (v3/5), Save to Library, Download, Launch as Ad
- **Main area**: Current image centered, max size, dark background
- **Floating text panel** (left, collapsible): Detected text blocks as editable cards with pencil icons. Collapsed if no text detected.
- **Version strip** (bottom, above prompt): Horizontal scrollable thumbnails — original + each edit. Current version has purple glow border. Click any to jump.
- **Prompt bar** (fixed bottom): Full-width input, "Describe your edit..." placeholder, submit button with loading state.
- **Mobile**: Text panel becomes bottom sheet. Version strip swipeable. Prompt bar stays fixed bottom.

## Text Detection

- **Engine**: Gemini Vision (free with existing API — no new dependencies)
- **Auto-detect**: When image source is Ad Studio or AI Tasks (likely has text)
- **Manual detect**: "Detect Text" button for media library and upload sources
- **Prompt**: Returns JSON array of `{text, role}` where role is headline/subtext/cta/other
- **Re-detection**: After each edit, re-detect text from the new image automatically

## Text Editing Flow

1. User clicks pencil icon on detected text block (e.g., "50% Off")
2. Inline input appears with current text pre-filled
3. User types replacement (e.g., "75% Off"), hits Enter
4. Sends to adjust-image API: `"Change the text '50% Off' to '75% Off'. Keep everything else identical."`
5. New version appears in strip, text panel re-detects

## Free-Form Prompt Editing

Separate from text edits. Examples:
- "Make the background gradient purple to blue"
- "Remove the logo"
- "Make the text larger and bolder"
- "Change aspect ratio to portrait"

Uses the same adjust-image API endpoint.

## Version History

- Original image = v0 (always preserved, never modified)
- Each edit creates a new version stored as Supabase Storage URL
- Click any thumbnail to view that version
- Editing from a past version branches from there (discards later versions)
- In-session only during editing; persisted via session table for later access

## Persistent Sessions

**Table: `image_editor_sessions`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | References auth.users |
| workspace_id | UUID | References workspaces |
| source_type | TEXT | 'generated' / 'library' / 'upload' |
| source_id | TEXT | ad_studio_session ID, media_library ID, or null |
| original_image_url | TEXT | Supabase Storage URL of starting image |
| versions | JSONB | Array of {storageUrl, prompt, textChanges, createdAt} |
| detected_text | JSONB | Array from Gemini Vision {text, role} |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Sessions listed on AI Tasks page under "Image Edits" section.

## Entry Points

| Source | Action | URL |
|--------|--------|-----|
| Ad Studio / AI Tasks | "Edit" button on generated images | `/image-editor?sessionId=xxx` or `?imageUrl=xxx` |
| Media Library | "Edit with AI" button on image cards | `/image-editor?mediaId=xxx` |
| Direct upload | Drag-and-drop zone on editor page (no image param) | `/image-editor` |
| Sidebar | "Image Editor" nav item under Creative Studio | `/image-editor` |

## Save Actions

- **Save to Library**: Upload to Meta API (real mediaHash) + Supabase Storage + media_library table
- **Download**: Client-side PNG download of current version
- **Launch as Ad**: Opens Launch Wizard with image pre-loaded as creative

## Credit Cost

- **Edits are free** — no credit cost per edit
- Original image generation costs 5 credits as usual
- Text detection via Gemini Vision is free (included with API)

## API Endpoints

**Existing (reuse):**
- `POST /api/creative-studio/adjust-image` — image editing via Gemini
- `POST /api/creative-studio/save-generated-image` — save to storage/library

**New:**
- `POST /api/creative-studio/detect-text` — Gemini Vision text extraction
- `GET/POST/PATCH /api/creative-studio/image-editor-session` — session CRUD

## Tech Stack

- Gemini 3 Pro Image Preview (editing)
- Gemini Vision (text detection, same model)
- Supabase Storage (version images)
- Supabase Postgres (sessions table)
- Next.js page with Tailwind CSS
