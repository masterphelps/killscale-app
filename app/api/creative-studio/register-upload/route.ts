import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Allow large file uploads (up to 500MB)
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min timeout for large uploads

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST: Register a media item in media_library (JSON body, no file upload).
 * Used when storage URL is already known.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      userId: string
      adAccountId: string
      mediaType: 'image' | 'video'
      mediaHash: string
      name: string
      width?: number
      height?: number
      thumbnailUrl?: string
      storageUrl?: string
      storagePath?: string
      fileSize?: number
    }

    const { userId, adAccountId, mediaType, mediaHash, name, width, height, thumbnailUrl, storageUrl, storagePath, fileSize } = body

    if (!userId || !adAccountId || !mediaType || !mediaHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    const row: Record<string, unknown> = {
      user_id: userId,
      ad_account_id: cleanAccountId,
      media_hash: mediaHash,
      media_type: mediaType,
      name: name || 'Untitled',
      synced_at: new Date().toISOString(),
    }

    if (storageUrl) {
      row.storage_url = storageUrl
      row.storage_path = storagePath || null
      row.download_status = 'complete'
      if (fileSize) row.file_size_bytes = fileSize
    } else {
      row.download_status = 'pending'
    }

    if (width) row.width = width
    if (height) row.height = height
    if (thumbnailUrl) row.video_thumbnail_url = thumbnailUrl

    const { error: upsertError } = await supabase
      .from('media_library')
      .upsert(row, { onConflict: 'user_id,ad_account_id,media_hash' })

    if (upsertError) {
      console.error('[RegisterUpload] Upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }

    return NextResponse.json({ success: true, mediaHash })
  } catch (err) {
    console.error('[RegisterUpload] Error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

/**
 * PUT: Upload file to Supabase Storage + register in media_library.
 * Accepts FormData with: file, userId, adAccountId, mediaType, name
 */
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string
    const adAccountId = formData.get('adAccountId') as string
    const mediaType = formData.get('mediaType') as 'image' | 'video'
    const name = formData.get('name') as string

    if (!file || !userId || !adAccountId || !mediaType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Generate unique ID for this upload
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const isVideo = mediaType === 'video'
    const ext = isVideo
      ? (name.match(/\.(mp4|mov|webm|avi)$/i)?.[1] || 'mp4')
      : (name.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1] || 'jpg')
    const storagePath = `${cleanAccountId}/${isVideo ? 'video' : 'image'}/${uploadId}.${ext}`

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage (service role bypasses bucket policies)
    const { error: storageError } = await supabase
      .storage
      .from('media')
      .upload(storagePath, fileBytes, {
        contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        upsert: true,
      })

    if (storageError) {
      console.error('[RegisterUpload] Storage upload error:', storageError)
      return NextResponse.json({ error: 'Storage upload failed: ' + storageError.message }, { status: 500 })
    }

    // Get public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('media')
      .getPublicUrl(storagePath)
    const storageUrl = publicUrlData?.publicUrl

    // Insert into media_library
    const { error: upsertError } = await supabase
      .from('media_library')
      .upsert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        media_hash: uploadId,
        media_type: mediaType,
        name: name || 'Untitled',
        storage_url: storageUrl,
        storage_path: storagePath,
        download_status: 'complete',
        file_size_bytes: fileBytes.length,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id,ad_account_id,media_hash' })

    if (upsertError) {
      console.error('[RegisterUpload] Upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }

    return NextResponse.json({ success: true, mediaHash: uploadId, storageUrl })
  } catch (err) {
    console.error('[RegisterUpload] PUT error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

/**
 * DELETE: Remove a media item from media_library and Supabase Storage.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId, adAccountId, mediaHash } = await request.json() as {
      userId: string
      adAccountId: string
      mediaHash: string
    }

    if (!userId || !adAccountId || !mediaHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Get the storage path before deleting the row
    const { data: row } = await supabase
      .from('media_library')
      .select('storage_path')
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .eq('media_hash', mediaHash)
      .single()

    // Delete from Supabase Storage if we have a path
    if (row?.storage_path) {
      const { error: storageError } = await supabase
        .storage
        .from('media')
        .remove([row.storage_path])

      if (storageError) {
        console.error('[RegisterUpload] Storage delete error:', storageError)
      }
    }

    // Delete from media_library
    const { error: deleteError } = await supabase
      .from('media_library')
      .delete()
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAccountId)
      .eq('media_hash', mediaHash)

    if (deleteError) {
      console.error('[RegisterUpload] Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[RegisterUpload] Delete error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
