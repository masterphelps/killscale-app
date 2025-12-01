import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// DEBUG ENDPOINT: Test what Meta returns for budget fields
// Hit this endpoint to see raw budget data before any processing

export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId } = await request.json()
    
    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }
    
    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected', connError }, { status: 401 })
    }
    
    const accessToken = connection.access_token
    
    // ========================================
    // STEP 1: Fetch campaigns with budget fields
    // ========================================
    const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`)
    campaignsUrl.searchParams.set('access_token', accessToken)
    campaignsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget')
    campaignsUrl.searchParams.set('limit', '50')
    
    const campaignsRes = await fetch(campaignsUrl.toString())
    const campaignsData = await campaignsRes.json()
    
    if (campaignsData.error) {
      return NextResponse.json({ 
        error: 'Meta API error fetching campaigns',
        details: campaignsData.error 
      }, { status: 400 })
    }
    
    // ========================================
    // STEP 2: Fetch adsets with budget fields
    // ========================================
    const adsetsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/adsets`)
    adsetsUrl.searchParams.set('access_token', accessToken)
    adsetsUrl.searchParams.set('fields', 'id,name,effective_status,daily_budget,lifetime_budget,campaign_id')
    adsetsUrl.searchParams.set('limit', '50')
    
    const adsetsRes = await fetch(adsetsUrl.toString())
    const adsetsData = await adsetsRes.json()
    
    if (adsetsData.error) {
      return NextResponse.json({ 
        error: 'Meta API error fetching adsets',
        details: adsetsData.error 
      }, { status: 400 })
    }
    
    // ========================================
    // STEP 3: Analyze what we got
    // ========================================
    const campaigns = campaignsData.data || []
    const adsets = adsetsData.data || []
    
    // Find campaigns with budgets (CBO)
    const campaignsWithBudget = campaigns.filter((c: any) => c.daily_budget || c.lifetime_budget)
    const campaignsWithoutBudget = campaigns.filter((c: any) => !c.daily_budget && !c.lifetime_budget)
    
    // Find adsets with budgets (ABO)
    const adsetsWithBudget = adsets.filter((a: any) => a.daily_budget || a.lifetime_budget)
    const adsetsWithoutBudget = adsets.filter((a: any) => !a.daily_budget && !a.lifetime_budget)
    
    // ========================================
    // STEP 4: Return comprehensive debug info
    // ========================================
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      summary: {
        total_campaigns: campaigns.length,
        campaigns_with_budget_CBO: campaignsWithBudget.length,
        campaigns_without_budget: campaignsWithoutBudget.length,
        total_adsets: adsets.length,
        adsets_with_budget_ABO: adsetsWithBudget.length,
        adsets_without_budget: adsetsWithoutBudget.length,
      },
      
      // Show raw data for campaigns WITH budget (CBO)
      cbo_campaigns: campaignsWithBudget.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.effective_status,
        daily_budget_cents: c.daily_budget,
        daily_budget_dollars: c.daily_budget ? parseInt(c.daily_budget) / 100 : null,
        lifetime_budget_cents: c.lifetime_budget,
        lifetime_budget_dollars: c.lifetime_budget ? parseInt(c.lifetime_budget) / 100 : null,
      })),
      
      // Show raw data for adsets WITH budget (ABO)
      abo_adsets: adsetsWithBudget.map((a: any) => ({
        id: a.id,
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        daily_budget_cents: a.daily_budget,
        daily_budget_dollars: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
        lifetime_budget_cents: a.lifetime_budget,
        lifetime_budget_dollars: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      })),
      
      // Also show first 5 campaigns/adsets WITHOUT budget for comparison
      sample_no_budget_campaigns: campaignsWithoutBudget.slice(0, 5).map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.effective_status,
        note: 'No budget at campaign level - check adsets for ABO'
      })),
      
      sample_no_budget_adsets: adsetsWithoutBudget.slice(0, 5).map((a: any) => ({
        id: a.id,
        name: a.name,
        campaign_id: a.campaign_id,
        status: a.effective_status,
        note: 'No budget at adset level - check campaign for CBO'
      })),
      
      // Raw API responses for debugging
      raw: {
        campaigns_response: campaignsData,
        adsets_response: adsetsData
      }
    })
    
  } catch (err) {
    console.error('Debug budget error:', err)
    return NextResponse.json({ 
      error: 'Debug failed', 
      details: err instanceof Error ? err.message : String(err) 
    }, { status: 500 })
  }
}
