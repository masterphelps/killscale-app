import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { base64, mimeType, adAccountId, name, userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!base64 || !mimeType || !adAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields: base64, mimeType, adAccountId' },
        { status: 400 }
      )
    }

    const cleanAccountId = adAccountId.replace(/^act_/, '')

    // Get user's Meta connection for upload
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Meta token expired, please reconnect' }, { status: 401 })
    }

    // ─── Step 1: Upload to Meta to get real image hash ─────────────────────────
    const imageName = name || `AI Generated - ${new Date().toLocaleDateString()}`

    const metaFormData = new FormData()
    metaFormData.append('access_token', connection.access_token)
    metaFormData.append('bytes', base64)
    metaFormData.append('name', imageName)

    const metaResponse = await fetch(
      `${META_GRAPH_URL}/act_${cleanAccountId}/adimages`,
      {
        method: 'POST',
        body: metaFormData,
      }
    )

    const metaResult = await metaResponse.json()

    if (metaResult.error) {
      console.error('[SaveGeneratedImage] Meta upload error:', metaResult.error)
      return NextResponse.json(
        { error: metaResult.error.message || 'Failed to upload to Meta' },
        { status: 500 }
      )
    }

    // Extract real image hash from Meta response
    // Response format: { images: { [filename]: { hash: "..." } } }
    const images = metaResult.images
    const imageData = images ? Object.values(images)[0] as { hash: string; url?: string } : null

    if (!imageData?.hash) {
      console.error('[SaveGeneratedImage] No hash in Meta response:', metaResult)
      return NextResponse.json({ error: 'Failed to get image hash from Meta' }, { status: 500 })
    }

    const metaHash = imageData.hash
    console.log('[SaveGeneratedImage] Uploaded to Meta with hash:', metaHash)

    // ─── Step 2: Upload to Supabase Storage for local access ───────────────────

    // Determine extension from mimeType
    let ext = 'png'
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
    else if (mimeType.includes('webp')) ext = 'webp'

    // Storage path uses Meta's hash for consistency
    const storagePath = `${userId}/${cleanAccountId}/generated/${metaHash}.${ext}`

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(base64, 'base64')

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from('media')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error('[SaveGeneratedImage] Supabase upload error:', uploadError)
      // Don't fail - Meta upload succeeded, which is the critical part
      // The image will work for ads, just won't have local storage backup
    }

    // Get the public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('media')
      .getPublicUrl(storagePath)

    const storageUrl = publicUrlData?.publicUrl || null

    // ─── Step 3: Insert into media_library with Meta's real hash ───────────────

    const { data: mediaRow, error: insertError } = await supabase
      .from('media_library')
      .insert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        media_hash: metaHash, // Use Meta's real hash!
        media_type: 'image',
        url: imageData.url || storageUrl, // Prefer Meta's URL if available
        storage_path: storagePath,
        storage_url: storageUrl,
        download_status: 'complete',
        file_size_bytes: fileBuffer.length,
        name: imageName,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[SaveGeneratedImage] Insert error:', insertError)
      // Don't fail - Meta upload succeeded, which is the critical part
      // The image will work for ads, just won't show in Creative Studio
    }

    console.log('[SaveGeneratedImage] Saved image with Meta hash:', metaHash)

    return NextResponse.json({
      success: true,
      mediaId: mediaRow?.id,
      mediaHash: metaHash, // Return Meta's real hash
      storageUrl,
    })
  } catch (err) {
    console.error('[SaveGeneratedImage] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    )
  }
}
