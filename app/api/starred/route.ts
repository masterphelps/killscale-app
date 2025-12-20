import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List starred ads for an account
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const adAccountId = searchParams.get('adAccountId')

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

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

    return NextResponse.json({ starred: data || [] })
  } catch (err) {
    console.error('Starred ads GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch starred ads' }, { status: 500 })
  }
}

// POST - Star an ad
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

    // Check if this creative is already starred (by a different ad)
    // Also check by ad name as a fallback (same creative may have different IDs)
    if (creativeId) {
      const { data: existingCreative } = await supabase
        .from('starred_ads')
        .select('ad_id, ad_name')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('creative_id', creativeId)
        .neq('ad_id', adId)
        .single()

      if (existingCreative) {
        return NextResponse.json({
          error: 'This creative is already starred',
          duplicateAdId: existingCreative.ad_id,
          duplicateAdName: existingCreative.ad_name
        }, { status: 409 })
      }
    }

    // Also check for duplicate ad names (same creative content, different ad IDs)
    if (adName) {
      const { data: existingName } = await supabase
        .from('starred_ads')
        .select('ad_id, ad_name')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .eq('ad_name', adName)
        .neq('ad_id', adId)
        .single()

      if (existingName) {
        return NextResponse.json({
          error: 'An ad with this name is already starred',
          duplicateAdId: existingName.ad_id,
          duplicateAdName: existingName.ad_name
        }, { status: 409 })
      }
    }

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

    return NextResponse.json({ starred: data })
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
