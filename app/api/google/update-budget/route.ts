import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidGoogleToken, normalizeCustomerId } from '@/lib/google/auth'

const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, customerId, campaignId, budgetResourceName, budget, oldBudget } = await request.json() as {
      userId: string
      customerId: string
      campaignId: string
      budgetResourceName: string  // e.g., "customers/123/campaignBudgets/456"
      budget: number  // In dollars
      oldBudget?: number
    }

    if (!userId || !customerId || !campaignId || !budgetResourceName || !budget) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (budget <= 0) {
      return NextResponse.json({ error: 'Budget must be greater than 0' }, { status: 400 })
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

    // Convert budget to micros (Google uses 1/1,000,000)
    const amountMicros = Math.round(budget * 1_000_000).toString()

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
        mutateOperations: [{
          campaignBudgetOperation: {
            update: {
              resourceName: budgetResourceName,
              amountMicros: amountMicros,
            },
            updateMask: 'amount_micros',
          },
        }],
      }),
    })

    const result = await response.json()

    if (!response.ok || result.error) {
      console.error('Google Ads API error:', JSON.stringify(result, null, 2))
      const errorMessage = result.error?.message ||
        result.error?.details?.[0]?.errors?.[0]?.message ||
        'Failed to update budget on Google Ads'
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Update local database to reflect the change
    const { error: updateError } = await supabase
      .from('google_ad_data')
      .update({ campaign_budget: budget })
      .eq('user_id', userId)
      .eq('customer_id', customerId)
      .eq('campaign_id', campaignId)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Don't fail the request - Google update succeeded
    }

    // Log the budget change for cooldown tracking
    if (oldBudget !== undefined) {
      const { error: logError } = await supabase
        .from('budget_changes')
        .insert({
          user_id: userId,
          ad_account_id: customerId,  // Use customerId for Google
          entity_type: 'campaign',
          entity_id: campaignId,
          old_budget: oldBudget,
          new_budget: budget,
        })

      if (logError) {
        // Log but don't fail the request
        console.error('Failed to log budget change:', logError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Budget updated to $${budget}/day`,
    })

  } catch (err) {
    console.error('Google update budget error:', err)
    return NextResponse.json(
      { error: 'Failed to update budget' },
      { status: 500 }
    )
  }
}
