import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Check if media (image hash or video id) is in use by any active or paused ads
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const mediaHash = searchParams.get('mediaHash') // image hash or video id
    const mediaType = searchParams.get('mediaType') // 'image' or 'video'

    if (!userId || !adAccountId || !mediaHash || !mediaType) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Query ad_data for any active or paused ads using this media
    // For images, check media_hash against the image hash
    // For videos, check media_hash against the video id (stored as media_hash for videos too)
    const { data: adsUsingMedia, error } = await supabase
      .from('ad_data')
      .select('ad_id, ad_name, status')
      .eq('user_id', userId)
      .eq('ad_account_id', `act_${cleanAdAccountId}`)
      .eq('media_hash', mediaHash)
      .in('status', ['ACTIVE', 'PAUSED'])
      .limit(10)

    if (error) {
      console.error('Error checking media usage:', error)
      return NextResponse.json({ error: 'Failed to check media usage' }, { status: 500 })
    }

    const inUse = adsUsingMedia && adsUsingMedia.length > 0
    const usageCount = adsUsingMedia?.length || 0
    const usedByAds = adsUsingMedia?.map(ad => ({
      adId: ad.ad_id,
      adName: ad.ad_name,
      status: ad.status
    })) || []

    return NextResponse.json({
      inUse,
      usageCount,
      usedByAds
    })

  } catch (err) {
    console.error('Check media usage error:', err)
    return NextResponse.json({ error: 'Failed to check media usage' }, { status: 500 })
  }
}
