import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { base64, mimeType, adAccountId, name, userId, saveToLibrary = true } = await request.json()

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
    const imageName = name || `AI Generated - ${new Date().toLocaleDateString()}`

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(base64, 'base64')

    // Determine extension from mimeType
    let ext = 'png'
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
    else if (mimeType.includes('webp')) ext = 'webp'

    // ─── Storage-only mode: just persist to Supabase for AI Tasks ─────────────
    if (!saveToLibrary) {
      const tempId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const storagePath = `${userId}/${cleanAccountId}/generated/${tempId}.${ext}`

      // Upload with retry (up to 3 attempts)
      let uploadError: Error | null = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error } = await supabase
          .storage
          .from('media')
          .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: true,
          })

        if (!error) {
          uploadError = null
          break
        }
        uploadError = error as Error
        console.warn(`[SaveGeneratedImage] Supabase upload attempt ${attempt}/3 failed:`, error)
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
      }

      if (uploadError) {
        console.error('[SaveGeneratedImage] All upload attempts failed:', uploadError)
        return NextResponse.json({ error: 'Failed to upload to storage' }, { status: 500 })
      }

      const { data: publicUrlData } = supabase
        .storage
        .from('media')
        .getPublicUrl(storagePath)

      console.log('[SaveGeneratedImage] Stored to Supabase only (not in media library)')

      return NextResponse.json({
        success: true,
        storageUrl: publicUrlData?.publicUrl || null,
        storagePath,
      })
    }

    // ─── Full save mode: Meta upload + Supabase + media_library ───────────────

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

    // Step 1: Upload to Meta to get real image hash
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

    // Step 2: Upload to Supabase Storage for local access (with retry)
    const storagePath = `${userId}/${cleanAccountId}/generated/${metaHash}.${ext}`

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: uploadErr } = await supabase
        .storage
        .from('media')
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        })

      if (!uploadErr) break
      console.warn(`[SaveGeneratedImage] Supabase upload attempt ${attempt}/3 failed:`, uploadErr)
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
    }

    const { data: publicUrlData } = supabase
      .storage
      .from('media')
      .getPublicUrl(storagePath)

    const storageUrl = publicUrlData?.publicUrl || null

    // Step 3: Insert into media_library with Meta's real hash
    const { data: mediaRow, error: insertError } = await supabase
      .from('media_library')
      .insert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        media_hash: metaHash,
        media_type: 'image',
        url: imageData.url || storageUrl,
        storage_path: storagePath,
        storage_url: storageUrl,
        download_status: 'complete',
        file_size_bytes: fileBuffer.length,
        name: imageName,
        synced_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('[SaveGeneratedImage] Insert error:', insertError)
    }

    console.log('[SaveGeneratedImage] Saved image to library with Meta hash:', metaHash)

    return NextResponse.json({
      success: true,
      mediaId: mediaRow?.id,
      mediaHash: metaHash,
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
