# Direct-to-Meta Upload Implementation Plan

## Overview
Replace server-proxied uploads with direct client-to-Meta uploads to bypass Vercel's 4MB limit and reduce bandwidth costs.

## Current Flow
1. User selects files → stored in wizard state
2. On submit → POST each file to `/api/meta/upload-creative`
3. Server uploads to Meta → returns `imageHash` or `videoId`
4. Campaign creation uses these IDs

## New Flow
1. User selects files → stored in wizard state
2. On submit → fetch access token from secure API
3. Client uploads directly to Meta's Graph API
4. Returns `imageHash` or `videoId`
5. Campaign creation uses these IDs (unchanged)

---

## Implementation Steps

### Step 1: Create Token API Endpoint

**File:** `app/api/meta/token/route.ts`

```typescript
// Secure endpoint to get user's Meta access token
// - Verify user is authenticated
// - Verify userId matches the authenticated user
// - Return access token and ad account ID
```

**Security checks:**
- Require `userId` parameter
- Query Supabase for the user's meta_connection
- Verify token hasn't expired
- Return: `{ accessToken, adAccountId }` or error

---

### Step 2: Create Client-Side Upload Utility

**File:** `lib/meta-upload.ts`

This module handles all direct-to-Meta upload logic:

```typescript
// Types
interface UploadResult {
  success: boolean
  type: 'image' | 'video'
  imageHash?: string
  videoId?: string
  error?: string
}

interface UploadProgress {
  fileName: string
  progress: number // 0-100
  status: 'pending' | 'uploading' | 'complete' | 'error'
}

// Main functions
export async function uploadImageToMeta(
  file: File,
  accessToken: string,
  adAccountId: string
): Promise<UploadResult>

export async function uploadVideoToMeta(
  file: File,
  accessToken: string,
  adAccountId: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult>
```

**Image upload logic:**
1. Convert file to base64
2. POST to `https://graph.facebook.com/v18.0/act_{id}/adimages`
3. Body: FormData with `access_token`, `bytes` (base64), `name`
4. Parse response for image hash

**Video upload logic (chunked for large files):**

For videos < 50MB (simple upload):
1. POST to `https://graph.facebook.com/v18.0/act_{id}/advideos`
2. Body: FormData with `access_token`, `title`, `source` (blob)
3. Parse response for video ID

For videos >= 50MB (chunked upload):
1. **Start phase:**
   - POST with `upload_phase=start`, `file_size`
   - Returns: `upload_session_id`, `video_id`, `start_offset`

2. **Transfer phase (loop):**
   - Read chunk from file (50MB chunks)
   - POST with `upload_phase=transfer`, `upload_session_id`, `start_offset`, `video_file_chunk`
   - Update progress callback
   - Returns: new `start_offset`
   - Repeat until all chunks sent

3. **Finish phase:**
   - POST with `upload_phase=finish`, `upload_session_id`, `title`
   - Returns: `success`, `video_id`

---

### Step 3: Update Creative Interface

**File:** `components/launch-wizard.tsx`

Update the Creative interface to track upload progress:

```typescript
interface Creative {
  file: File
  preview: string
  type: 'image' | 'video'
  uploading?: boolean
  uploadProgress?: number  // NEW: 0-100 for progress bar
  uploaded?: boolean
  imageHash?: string
  videoId?: string
  error?: string  // NEW: track per-file errors
}
```

---

### Step 4: Update Upload Function in Wizard

**File:** `components/launch-wizard.tsx`

Replace `uploadCreatives()` function:

```typescript
const uploadCreatives = async (): Promise<boolean> => {
  if (!user) return false

  // Step 1: Get access token from our secure API
  const tokenRes = await fetch(`/api/meta/token?userId=${user.id}`)
  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.accessToken) {
    setError('Failed to get upload credentials')
    return false
  }

  const { accessToken } = tokenData
  const cleanAdAccountId = state.adAccountId.replace(/^act_/, '')

  // Step 2: Upload each creative directly to Meta
  const updatedCreatives = [...state.creatives]
  let allUploaded = true

  for (let i = 0; i < updatedCreatives.length; i++) {
    const creative = updatedCreatives[i]
    if (creative.uploaded) continue

    // Update state to show uploading
    updatedCreatives[i] = { ...creative, uploading: true, uploadProgress: 0 }
    setState(s => ({ ...s, creatives: [...updatedCreatives] }))

    try {
      let result: UploadResult

      if (creative.type === 'image') {
        result = await uploadImageToMeta(creative.file, accessToken, cleanAdAccountId)
      } else {
        result = await uploadVideoToMeta(
          creative.file,
          accessToken,
          cleanAdAccountId,
          (progress) => {
            // Update progress in state
            updatedCreatives[i] = { ...updatedCreatives[i], uploadProgress: progress }
            setState(s => ({ ...s, creatives: [...updatedCreatives] }))
          }
        )
      }

      if (result.success) {
        updatedCreatives[i] = {
          ...creative,
          uploading: false,
          uploaded: true,
          uploadProgress: 100,
          imageHash: result.imageHash,
          videoId: result.videoId
        }
      } else {
        updatedCreatives[i] = {
          ...creative,
          uploading: false,
          error: result.error
        }
        allUploaded = false
      }
    } catch (err) {
      updatedCreatives[i] = {
        ...creative,
        uploading: false,
        error: 'Upload failed'
      }
      allUploaded = false
    }

    setState(s => ({ ...s, creatives: [...updatedCreatives] }))
  }

  return allUploaded
}
```

---

### Step 5: Update Creative Preview Cards

**File:** `components/launch-wizard.tsx`

Update the preview cards to show:
- Upload progress bar for large files
- File size indicator
- Error state per file

```tsx
{state.creatives.map((creative, index) => (
  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-bg-hover">
    {/* Preview image/video */}
    {creative.type === 'image' ? (
      <img src={creative.preview} ... />
    ) : (
      <video src={creative.preview} ... />
    )}

    {/* File size badge */}
    <div className="absolute bottom-2 left-2 text-xs bg-black/70 px-1.5 py-0.5 rounded">
      {(creative.file.size / 1024 / 1024).toFixed(1)}MB
    </div>

    {/* Upload progress overlay */}
    {creative.uploading && (
      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <div className="w-3/4 h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${creative.uploadProgress || 0}%` }}
          />
        </div>
        <span className="text-xs mt-1">{creative.uploadProgress || 0}%</span>
      </div>
    )}

    {/* Success indicator */}
    {creative.uploaded && (
      <div className="absolute bottom-2 left-2 w-5 h-5 bg-verdict-scale rounded-full flex items-center justify-center">
        <Check className="w-3 h-3" />
      </div>
    )}

    {/* Error indicator */}
    {creative.error && (
      <div className="absolute inset-0 bg-verdict-kill/20 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-verdict-kill" />
      </div>
    )}

    {/* Remove button */}
    <button onClick={() => removeCreative(index)} ...>
      <X className="w-4 h-4" />
    </button>
  </div>
))}
```

---

### Step 6: Remove File Size Limit

**File:** `components/launch-wizard.tsx`

Update `processFiles()`:
- Remove the 4MB client-side limit
- Add Meta's actual limits: 30MB for images, 1GB for videos
- Keep the helpful file size display

```typescript
const MAX_IMAGE_SIZE = 30 * 1024 * 1024  // 30MB (Meta's limit)
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024 // 1GB (Meta's limit)

const processFiles = (files: FileList | File[]) => {
  // ... validate against Meta's actual limits
}
```

---

### Step 7: Update Upload Area Text

**File:** `components/launch-wizard.tsx`

Update the upload area to reflect new limits:

```tsx
<p className="text-xs text-zinc-600">
  JPG, PNG, MP4, MOV • Images up to 30MB • Videos up to 1GB
</p>
```

---

### Step 8: Clean Up Server-Side Route

**File:** `app/api/meta/upload-creative/route.ts`

Options:
1. **Keep as fallback** - Remove size limit, keep for potential future use
2. **Delete entirely** - Remove the file since it's no longer needed

Recommendation: Keep but simplify - remove the size validation, add a comment that direct upload is preferred.

---

## File Summary

| File | Action |
|------|--------|
| `app/api/meta/token/route.ts` | CREATE - New secure token endpoint |
| `lib/meta-upload.ts` | CREATE - Client-side upload utilities |
| `components/launch-wizard.tsx` | MODIFY - Use direct uploads, show progress |
| `app/api/meta/upload-creative/route.ts` | MODIFY - Remove size limit, add deprecation note |

---

## Testing Checklist

- [ ] Small image upload (<1MB) works
- [ ] Large image upload (5-30MB) works
- [ ] Small video upload (<50MB) works
- [ ] Large video upload (50MB-500MB) works with progress
- [ ] Very large video upload (~1GB) works with chunked upload
- [ ] Error handling for invalid files
- [ ] Error handling for expired tokens
- [ ] Error handling for network failures mid-upload
- [ ] Progress bar updates smoothly
- [ ] Multiple files upload in sequence
- [ ] Campaign creation works with uploaded assets

---

## Rollback Plan

If issues arise:
1. The old `/api/meta/upload-creative` route still exists
2. Can revert `uploadCreatives()` function to use server route
3. Re-add file size limits client-side
