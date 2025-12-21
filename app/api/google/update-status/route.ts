import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidGoogleToken, normalizeCustomerId } from '@/lib/google/auth'

const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map our entity types to Google terminology
// KillScale: campaign, adset, ad
// Google: campaign, ad_group, ad_group_ad
type EntityType = 'campaign' | 'adset' | 'ad'

// Google status values: ENABLED, PAUSED, REMOVED
// We map ACTIVE -> ENABLED, PAUSED -> PAUSED
function mapToGoogleStatus(status: 'ACTIVE' | 'PAUSED'): string {
  return status === 'ACTIVE' ? 'ENABLED' : 'PAUSED'
}

export async function POST(request: NextRequest) {
  try {
    const { userId, customerId, entityId, entityType, status } = await request.json() as {
      userId: string
      customerId: string
      entityId: string
      entityType: EntityType
      status: 'ACTIVE' | 'PAUSED'
    }

    if (!userId || !customerId || !entityId || !entityType || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['campaign', 'adset', 'ad'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 })
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get valid access token (auto-refreshes if needed)
    const accessToken = await getValidGoogleToken(userId)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No valid Google token. Please reconnect your account.' },
        { status: 401 }
      )
    }

    const normalizedCustomerId = normalizeCustomerId(customerId)
    const googleStatus = mapToGoogleStatus(status)

    // Build the mutate operation based on entity type
    let mutateOperation: Record<string, unknown>
    let resourceName: string

    switch (entityType) {
      case 'campaign':
        resourceName = `customers/${normalizedCustomerId}/campaigns/${entityId}`
        mutateOperation = {
          campaignOperation: {
            update: {
              resourceName,
              status: googleStatus,
            },
            updateMask: 'status',
          },
        }
        break

      case 'adset':
        // In Google Ads, adset = ad_group
        resourceName = `customers/${normalizedCustomerId}/adGroups/${entityId}`
        mutateOperation = {
          adGroupOperation: {
            update: {
              resourceName,
              status: googleStatus,
            },
            updateMask: 'status',
          },
        }
        break

      case 'ad':
        // In Google Ads, ads are ad_group_ads
        // The entityId format should be "adGroupId~adId" or we need both IDs
        // For now, assume entityId is the ad_group_ad resource name suffix
        resourceName = `customers/${normalizedCustomerId}/adGroupAds/${entityId}`
        mutateOperation = {
          adGroupAdOperation: {
            update: {
              resourceName,
              status: googleStatus,
            },
            updateMask: 'status',
          },
        }
        break
    }

    // Call Google Ads API v22 mutate endpoint
    const mutateUrl = `https://googleads.googleapis.com/v22/customers/${normalizedCustomerId}/googleAds:mutate`

    const response = await fetch(mutateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': normalizedCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mutateOperations: [mutateOperation],
      }),
    })

    const result = await response.json()

    if (!response.ok || result.error) {
      console.error('Google Ads API error:', JSON.stringify(result, null, 2))
      const errorMessage = result.error?.message || result.error?.details?.[0]?.errors?.[0]?.message || 'Failed to update status on Google Ads'
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Update local database to reflect the change
    let updateColumn: string
    let idColumn: string

    switch (entityType) {
      case 'campaign':
        updateColumn = 'campaign_status'
        idColumn = 'campaign_id'
        break
      case 'adset':
        updateColumn = 'ad_group_status'
        idColumn = 'ad_group_id'
        break
      case 'ad':
        updateColumn = 'ad_status'
        idColumn = 'ad_id'
        break
    }

    // Update the status in google_ad_data table
    const { error: updateError } = await supabase
      .from('google_ad_data')
      .update({ [updateColumn]: status })
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .eq(idColumn, entityId)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Don't fail the request - Google update succeeded, just log the DB error
    }

    return NextResponse.json({
      success: true,
      message: `${entityType} ${status === 'PAUSED' ? 'paused' : 'activated'} successfully`,
    })

  } catch (err) {
    console.error('Google update status error:', err)
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    )
  }
}
