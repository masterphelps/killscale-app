import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_GRAPH_URL } from '@/lib/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Delete media from Meta's media library
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, mediaId, mediaHash, mediaType } = body

    if (!userId || !adAccountId || !mediaType) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // For images, we need mediaHash; for videos, we need mediaId
    if (mediaType === 'image' && !mediaHash) {
      return NextResponse.json({ error: 'mediaHash required for images' }, { status: 400 })
    }
    if (mediaType === 'video' && !mediaId) {
      return NextResponse.json({ error: 'mediaId required for videos' }, { status: 400 })
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // First, check if media is in use by any active or paused ads
    const lookupHash = mediaType === 'video' ? mediaId : mediaHash
    const { data: adsUsingMedia, error: checkError } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, status')
      .eq('user_id', userId)
      .eq('ad_account_id', `act_${cleanAdAccountId}`)
      .eq('media_hash', lookupHash)
      .in('status', ['ACTIVE', 'PAUSED'])
      .limit(5)

    if (checkError) {
      console.error('Error checking media usage:', checkError)
      return NextResponse.json({ error: 'Failed to check media usage' }, { status: 500 })
    }

    if (adsUsingMedia && adsUsingMedia.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete media that is in use by active or paused ads',
        inUse: true,
        usedByAds: adsUsingMedia.map(ad => ({
          adId: ad.ad_id,
          adName: ad.ad_name,
          status: ad.status
        }))
      }, { status: 409 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, token_expires_at')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Delete from Meta
    let deleteUrl: string
    let deleteMethod = 'DELETE'

    if (mediaType === 'video') {
      // For videos: DELETE /{video-id} directly
      deleteUrl = `${META_GRAPH_URL}/${mediaId}?access_token=${accessToken}`
    } else {
      // For images: DELETE /act_{ad-account-id}/adimages with hash parameter
      deleteUrl = `${META_GRAPH_URL}/act_${cleanAdAccountId}/adimages?hash=${mediaHash}&access_token=${accessToken}`
    }

    console.log(`[media/delete] Deleting ${mediaType} from Meta:`, {
      mediaId,
      mediaHash,
      adAccountId: cleanAdAccountId
    })

    const deleteResponse = await fetch(deleteUrl, {
      method: deleteMethod,
      headers: { 'Content-Type': 'application/json' }
    })

    const deleteResult = await deleteResponse.json()

    if (deleteResult.error) {
      console.error('[media/delete] Meta API error:', deleteResult.error)

      // Check if it's already deleted or doesn't exist (but not "invalid ID")
      const errorMsg = deleteResult.error.message?.toLowerCase() || ''
      if (errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
        // Treat as success - already deleted
        console.log(`[media/delete] Media already deleted from Meta`)
        return NextResponse.json({ success: true, alreadyDeleted: true })
      }

      return NextResponse.json({
        error: deleteResult.error.message || 'Failed to delete from Meta',
        details: deleteResult.error
      }, { status: 400 })
    }

    console.log(`[media/delete] Successfully deleted ${mediaType} from Meta:`, mediaId || mediaHash)

    // Also delete from our media_library table
    const { error: dbDeleteError } = await supabase
      .from('media_library')
      .delete()
      .eq('user_id', userId)
      .eq('ad_account_id', cleanAdAccountId)
      .eq(mediaType === 'video' ? 'video_id' : 'media_hash', mediaType === 'video' ? mediaId : mediaHash)

    if (dbDeleteError) {
      console.error('[media/delete] Failed to delete from database:', dbDeleteError)
      // Don't fail the request - Meta delete succeeded
    } else {
      console.log(`[media/delete] Deleted from database`)
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Delete media error:', err)
    return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 })
  }
}
