import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List starred ads for an account
// Use ?groupByCreative=true to get star counts per creative (for universal performer detection)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')
    const groupByCreative = searchParams.get('groupByCreative') === 'true'

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Return aggregated star counts per creative
    if (groupByCreative) {
      const { data, error } = await supabase
        .from('creative_star_counts')
        .select('*')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .order('star_count', { ascending: false })

      if (error) {
        console.error('Error fetching creative star counts:', error)
        return NextResponse.json({ error: 'Failed to fetch creative star counts' }, { status: 500 })
      }

      return NextResponse.json({ creatives: data || [] })
    }

    // Default: return all starred ads
    const { data, error } = await supabase
      .from('starred_ads')
      .select('*')
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .order('starred_at', { ascending: false })

    if (error) {
      console.error('Error fetching starred ads:', error)
      return NextResponse.json({ error: 'Failed to fetch starred ads' }, { status: 500 })
    }

    // Also build a map of creative_id -> star_count for the UI
    const starCountMap: Record<string, number> = {}
    ;(data || []).forEach((ad: { creative_id?: string }) => {
      if (ad.creative_id) {
        starCountMap[ad.creative_id] = (starCountMap[ad.creative_id] || 0) + 1
      }
    })

    return NextResponse.json({ starred: data || [], starCountMap })
  } catch (err) {
    console.error('Starred ads GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch starred ads' }, { status: 500 })
  }
}

// POST - Star an ad
// Now allows starring same creative in multiple ad sets (for universal performer tracking)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      adAccountId,
      adId,
      adName,
      adsetId,
      adsetName,
      campaignId,
      campaignName,
      creativeId,
      spend,
      revenue,
      roas
    } = body

    if (!userId || !adAccountId || !adId || !adName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check how many times this creative is already starred (for star count tracking)
    let existingStarCount = 0
    let isNewAudience = false

    if (creativeId) {
      const { data: existingStars, count } = await supabase
        .from('starred_ads')
        .select('adset_id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('creative_id', creativeId)

      existingStarCount = count || 0

      // Check if this is a new audience (different ad set)
      if (existingStars && adsetId) {
        const existingAdsetIds = new Set(existingStars.map(s => s.adset_id))
        isNewAudience = !existingAdsetIds.has(adsetId)
      }
    }

    const newStarCount = existingStarCount + 1

    // Upsert to handle re-starring (updates metrics if already starred)
    const { data, error } = await supabase
      .from('starred_ads')
      .upsert({
        user_id: userId,
        ad_account_id: adAccountId,
        ad_id: adId,
        ad_name: adName,
        adset_id: adsetId || '',
        adset_name: adsetName || '',
        campaign_id: campaignId || '',
        campaign_name: campaignName || '',
        creative_id: creativeId || null,
        spend: spend || 0,
        revenue: revenue || 0,
        roas: roas || 0,
        star_instance: newStarCount,
        starred_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,ad_account_id,ad_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error starring ad:', error)
      return NextResponse.json({ error: 'Failed to star ad' }, { status: 500 })
    }

    // Return star count info for UI feedback
    return NextResponse.json({
      starred: data,
      starCount: newStarCount,
      isNewAudience,
      isUniversal: newStarCount >= 3,
      message: isNewAudience && existingStarCount > 0
        ? `Creative starred in ${newStarCount} audiences!`
        : undefined
    })
  } catch (err) {
    console.error('Starred ads POST error:', err)
    return NextResponse.json({ error: 'Failed to star ad' }, { status: 500 })
  }
}

// DELETE - Unstar an ad (or multiple ads)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, adId, adIds } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Support both single ad and multiple ads
    const idsToDelete = adIds || (adId ? [adId] : [])

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'No ad IDs provided' }, { status: 400 })
    }

    const { error } = await supabase
      .from('starred_ads')
      .delete()
      .eq('user_id', userId)
      .eq('ad_account_id', adAccountId)
      .in('ad_id', idsToDelete)

    if (error) {
      console.error('Error unstarring ad(s):', error)
      return NextResponse.json({ error: 'Failed to unstar ad(s)' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: idsToDelete.length })
  } catch (err) {
    console.error('Starred ads DELETE error:', err)
    return NextResponse.json({ error: 'Failed to unstar ad(s)' }, { status: 500 })
  }
}
