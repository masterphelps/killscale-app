/**
 * Demo Data Seed Script
 *
 * Creates realistic demo accounts with mixed performance for demo videos.
 * Includes SCALE winners (star-worthy), KILL losers, WATCH borderline, and LEARN new ads.
 *
 * Usage: npx ts-node scripts/seed-demo-data.ts <user_id>
 *
 * Creates:
 * - Meta demo account in account dropdown
 * - Google demo account in account dropdown (requires NEXT_PUBLIC_FF_GOOGLE_ADS=true)
 * - "Demo Business" workspace with both accounts linked
 * - 30 days of ad performance data with mixed verdicts
 *
 * Key fix: Accounts appear in dropdown via meta_connections.ad_accounts and
 * google_connections.customer_ids - NOT just workspace_accounts.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      process.env[key] = valueParts.join('=')
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Demo account IDs - Meta uses act_ prefix, Google uses numeric format
const META_ACCOUNT_ID = 'act_demo_meta_001'
const META_ACCOUNT_NAME = 'Demo E-Commerce Store'
const GOOGLE_CUSTOMER_ID = '1234567890'  // Google uses numeric customer IDs
const GOOGLE_ACCOUNT_NAME = 'Demo Google Ads'

// Helper to generate random number in range
const rand = (min: number, max: number) => Math.random() * (max - min) + min

// Helper to generate date string
const dateStr = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

// ============================================================================
// PERFORMANCE TYPE
// ============================================================================

type Performance = 'scale' | 'watch' | 'kill' | 'learn'

// ============================================================================
// META CAMPAIGNS - Mixed performance for demo
// ============================================================================

type MetaAdset = {
  id: string
  name: string
  performance: Performance
  dailySpend: number
}

type MetaCampaign = {
  id: string
  name: string
  objective: string
  status: string
  isCBO: boolean
  dailyBudget: number
  adsets: MetaAdset[]
}

// Campaign 1: CBO with mixed ad set performance (demo star system)
// - One winner ad set (SCALE) - star these ads
// - One loser ad set (KILL) - avoid these
// - One learning ad set (LEARN) - still gathering data
const META_CAMPAIGNS: MetaCampaign[] = [
  {
    id: 'demo_meta_camp_1',
    name: 'Summer Sale - Prospecting',
    objective: 'OUTCOME_SALES',
    status: 'ACTIVE',
    isCBO: true,
    dailyBudget: 200,
    adsets: [
      {
        id: 'demo_meta_adset_1a',
        name: 'Broad - 25-54 (WINNER)',
        performance: 'scale',  // 4-6x ROAS - star these!
        dailySpend: 80,
      },
      {
        id: 'demo_meta_adset_1b',
        name: 'Interest - Fitness (LOSER)',
        performance: 'kill',  // 0.5-1.2x ROAS - bleeding money
        dailySpend: 60,
      },
      {
        id: 'demo_meta_adset_1c',
        name: 'Lookalike 1% (NEW)',
        performance: 'learn',  // Low spend, still learning
        dailySpend: 15,
      },
    ]
  },
  {
    id: 'demo_meta_camp_2',
    name: 'Retargeting - Website Visitors',
    objective: 'OUTCOME_SALES',
    status: 'ACTIVE',
    isCBO: true,
    dailyBudget: 100,
    adsets: [
      {
        id: 'demo_meta_adset_2a',
        name: 'Cart Abandoners (WINNER)',
        performance: 'scale',  // High ROAS retargeting
        dailySpend: 50,
      },
      {
        id: 'demo_meta_adset_2b',
        name: 'Product Viewers',
        performance: 'watch',  // Borderline 1.5-2.5x
        dailySpend: 40,
      },
    ]
  },
  {
    id: 'demo_meta_camp_3',
    name: 'New Collection Launch',
    objective: 'OUTCOME_SALES',
    status: 'ACTIVE',
    isCBO: true,
    dailyBudget: 150,
    adsets: [
      {
        id: 'demo_meta_adset_3a',
        name: 'Top Customers (WINNER)',
        performance: 'scale',
        dailySpend: 60,
      },
      {
        id: 'demo_meta_adset_3b',
        name: 'Email Subscribers',
        performance: 'watch',
        dailySpend: 45,
      },
      {
        id: 'demo_meta_adset_3c',
        name: 'Cold Audience (LOSER)',
        performance: 'kill',
        dailySpend: 35,
      },
    ]
  },
  {
    id: 'demo_meta_camp_4',
    name: 'Brand Awareness Test',
    objective: 'OUTCOME_TRAFFIC',
    status: 'ACTIVE',
    isCBO: true,
    dailyBudget: 50,
    adsets: [
      {
        id: 'demo_meta_adset_4a',
        name: 'Cold - Broad (LEARNING)',
        performance: 'learn',
        dailySpend: 25,
      },
    ]
  }
]

// Ad creatives per ad set
const META_ADS = [
  { suffix: 'UGC Video 1', type: 'video' },
  { suffix: 'Lifestyle Image', type: 'image' },
  { suffix: 'Product Carousel', type: 'carousel' },
]

// ============================================================================
// GOOGLE CAMPAIGNS - Campaign-level only (no ad groups/ads in our model)
// ============================================================================

type GoogleCampaign = {
  id: string
  name: string
  type: string
  status: string
  dailyBudget: number
  performance: Performance
}

const GOOGLE_CAMPAIGNS: GoogleCampaign[] = [
  {
    id: 'demo_google_camp_1',
    name: 'Search - Brand Terms',
    type: 'SEARCH',
    status: 'ENABLED',
    dailyBudget: 50,
    performance: 'scale',  // Brand searches convert well
  },
  {
    id: 'demo_google_camp_2',
    name: 'Search - Non-Brand',
    type: 'SEARCH',
    status: 'ENABLED',
    dailyBudget: 100,
    performance: 'watch',  // Competitive, borderline
  },
  {
    id: 'demo_google_camp_3',
    name: 'Performance Max - All Products',
    type: 'PERFORMANCE_MAX',
    status: 'ENABLED',
    dailyBudget: 80,
    performance: 'scale',
  },
  {
    id: 'demo_google_camp_4',
    name: 'Shopping - Low Margin Items',
    type: 'SHOPPING',
    status: 'ENABLED',
    dailyBudget: 40,
    performance: 'kill',  // Low margin = bad ROAS
  }
]

// ============================================================================
// PERFORMANCE GENERATORS
// ============================================================================

function getROASForPerformance(performance: Performance): number {
  switch (performance) {
    case 'scale':
      return rand(4.0, 7.0)  // Clear winners - 4x to 7x ROAS
    case 'watch':
      return rand(1.5, 2.8)  // Borderline - above min_roas but below scale
    case 'kill':
      return rand(0.4, 1.3)  // Losers - bleeding money
    case 'learn':
      return rand(1.0, 3.5)  // Variable - not enough data yet
  }
}

function getDailySpendMultiplier(performance: Performance, daysAgo: number): number {
  // Add some day-over-day variance
  const baseVariance = 0.7 + rand(0, 0.6)

  // Learn campaigns have very low spend (under learning threshold)
  if (performance === 'learn') {
    return baseVariance * 0.3  // Keep total spend under $50-100 learning threshold
  }

  return baseVariance
}

// ============================================================================
// MAIN SEEDING FUNCTION
// ============================================================================

async function seedDemoData(userId: string) {
  console.log('🚀 Starting demo data seed for user:', userId)

  // 1. Check if user exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (!profile) {
    console.error('❌ User not found:', userId)
    process.exit(1)
  }

  // 2. Add Meta demo account to meta_connections
  // This is what makes it appear in the account dropdown!
  console.log('📱 Setting up Meta demo account in dropdown...')

  const { data: existingMeta } = await supabase
    .from('meta_connections')
    .select('id, ad_accounts')
    .eq('user_id', userId)
    .single()

  const demoMetaAccount = {
    id: META_ACCOUNT_ID,
    name: META_ACCOUNT_NAME,
    account_status: 1,
    currency: 'USD',
    in_dashboard: true,
  }

  if (existingMeta) {
    // Parse existing accounts (handle both array and string formats)
    let accounts: Array<{ id: string; name: string; [key: string]: any }> = []
    if (Array.isArray(existingMeta.ad_accounts)) {
      accounts = existingMeta.ad_accounts
    } else if (typeof existingMeta.ad_accounts === 'string') {
      try {
        accounts = JSON.parse(existingMeta.ad_accounts)
      } catch { accounts = [] }
    }

    // Add demo account if not already present
    if (!accounts.find(a => a.id === META_ACCOUNT_ID)) {
      accounts.push(demoMetaAccount)
      await supabase
        .from('meta_connections')
        .update({ ad_accounts: accounts })
        .eq('user_id', userId)
      console.log('  ✓ Added demo Meta account to existing connection')
    } else {
      console.log('  ✓ Demo Meta account already exists')
    }
  } else {
    // Create new meta connection with demo account
    await supabase.from('meta_connections').insert({
      user_id: userId,
      access_token: 'demo_token_not_real',
      token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      ad_accounts: [demoMetaAccount],
      selected_account_id: META_ACCOUNT_ID,
      selected_account_name: META_ACCOUNT_NAME,
    })
    console.log('  ✓ Created meta_connections with demo account')
  }

  // 3. Add Google demo account to google_connections
  // This is what makes Google accounts appear in the dropdown!
  console.log('🔍 Setting up Google demo account in dropdown...')

  const { data: existingGoogle } = await supabase
    .from('google_connections')
    .select('id, customer_ids')
    .eq('user_id', userId)
    .single()

  const demoGoogleAccount = {
    id: GOOGLE_CUSTOMER_ID,
    name: GOOGLE_ACCOUNT_NAME,
    currency: 'USD',
  }

  if (existingGoogle) {
    let customerIds: Array<{ id: string; name: string; [key: string]: any }> = []
    if (Array.isArray(existingGoogle.customer_ids)) {
      customerIds = existingGoogle.customer_ids
    }

    if (!customerIds.find(c => c.id === GOOGLE_CUSTOMER_ID)) {
      customerIds.push(demoGoogleAccount)
      await supabase
        .from('google_connections')
        .update({ customer_ids: customerIds })
        .eq('user_id', userId)
      console.log('  ✓ Added demo Google account to existing connection')
    } else {
      console.log('  ✓ Demo Google account already exists')
    }
  } else {
    // Create new google connection with demo account
    await supabase.from('google_connections').insert({
      user_id: userId,
      access_token: 'demo_token_not_real',
      refresh_token: 'demo_refresh_not_real',
      token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      customer_ids: [demoGoogleAccount],
      selected_customer_id: GOOGLE_CUSTOMER_ID,
    })
    console.log('  ✓ Created google_connections with demo account')
  }

  // 4. Create "Demo Business" workspace
  console.log('🏢 Setting up Demo Business workspace...')

  const { data: existingWorkspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Demo Business')
    .single()

  let workspaceId: string

  if (existingWorkspace) {
    workspaceId = existingWorkspace.id
    console.log('  ✓ Using existing Demo Business workspace')
  } else {
    const { data: newWorkspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: 'Demo Business',
        user_id: userId,
        is_default: false,
      })
      .select('id')
      .single()

    if (wsError) {
      console.error('Failed to create workspace:', wsError)
      process.exit(1)
    }
    workspaceId = newWorkspace.id

    // Add owner as member
    await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'owner'
    })
    console.log('  ✓ Created Demo Business workspace')
  }

  // 5. Link accounts to workspace
  console.log('🔗 Linking accounts to workspace...')

  // Meta account
  const { data: existingMetaLink } = await supabase
    .from('workspace_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('ad_account_id', META_ACCOUNT_ID)
    .single()

  if (!existingMetaLink) {
    await supabase.from('workspace_accounts').insert({
      workspace_id: workspaceId,
      ad_account_id: META_ACCOUNT_ID,
      ad_account_name: META_ACCOUNT_NAME,
      platform: 'meta',
      currency: 'USD',
    })
    console.log('  ✓ Linked Meta demo account to workspace')
  }

  // Google account
  const { data: existingGoogleLink } = await supabase
    .from('workspace_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('ad_account_id', GOOGLE_CUSTOMER_ID)
    .single()

  if (!existingGoogleLink) {
    await supabase.from('workspace_accounts').insert({
      workspace_id: workspaceId,
      ad_account_id: GOOGLE_CUSTOMER_ID,
      ad_account_name: GOOGLE_ACCOUNT_NAME,
      platform: 'google',
      currency: 'USD',
    })
    console.log('  ✓ Linked Google demo account to workspace')
  }

  // 6. Clear existing demo ad data (only demo accounts, not real ones!)
  console.log('🧹 Clearing old demo data...')

  const { error: metaDeleteError } = await supabase
    .from('ad_data')
    .delete()
    .eq('ad_account_id', META_ACCOUNT_ID)

  if (metaDeleteError) {
    console.error('  ⚠️ Error clearing Meta demo data:', metaDeleteError.message)
  }

  const { error: googleDeleteError } = await supabase
    .from('google_ad_data')
    .delete()
    .eq('customer_id', GOOGLE_CUSTOMER_ID)

  if (googleDeleteError) {
    console.error('  ⚠️ Error clearing Google demo data:', googleDeleteError.message)
  }

  // 7. Generate Meta ad data with mixed performance
  console.log('📊 Generating Meta ad data (30 days, mixed performance)...')

  const metaAdData: any[] = []

  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const date = dateStr(daysAgo)

    for (const campaign of META_CAMPAIGNS) {
      for (const adset of campaign.adsets) {
        const spendMultiplier = getDailySpendMultiplier(adset.performance, daysAgo)

        for (let adIdx = 0; adIdx < META_ADS.length; adIdx++) {
          const ad = META_ADS[adIdx]

          // Split spend among ads in the adset
          const adSpend = (adset.dailySpend / META_ADS.length) * spendMultiplier

          // Get ROAS based on performance tier (with daily variance)
          const roas = getROASForPerformance(adset.performance)
          const revenue = adSpend * roas
          const purchases = Math.max(0, Math.floor(revenue / rand(45, 65)))

          const impressions = Math.floor(adSpend * rand(80, 150))
          const clicks = Math.floor(impressions * rand(0.01, 0.03))

          metaAdData.push({
            user_id: userId,
            source: 'meta_api',
            ad_account_id: META_ACCOUNT_ID,
            date_start: date,
            date_end: date,
            campaign_name: campaign.name,
            campaign_id: campaign.id,
            adset_name: adset.name,
            adset_id: adset.id,
            ad_name: `${adset.name} - ${ad.suffix}`,
            ad_id: `${adset.id}_ad_${adIdx + 1}`,
            status: 'ACTIVE',
            adset_status: 'ACTIVE',
            campaign_status: campaign.status,
            campaign_daily_budget: campaign.dailyBudget * 100, // In cents
            creative_id: `creative_${campaign.id}_${adIdx + 1}`,
            impressions,
            clicks,
            spend: Math.round(adSpend * 100) / 100,
            purchases,
            revenue: Math.round(revenue * 100) / 100,
            results: purchases,
            result_value: Math.round(revenue * 100) / 100,
            result_type: 'purchase',
            synced_at: new Date().toISOString(),
          })
        }
      }
    }
  }

  // Insert Meta data in batches
  const BATCH_SIZE = 500
  for (let i = 0; i < metaAdData.length; i += BATCH_SIZE) {
    const batch = metaAdData.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('ad_data').insert(batch)
    if (error) {
      console.error('  ⚠️ Error inserting Meta batch:', error.message)
    }
  }
  console.log(`  ✓ Inserted ${metaAdData.length} Meta ad records`)

  // 8. Generate Google ad data (campaign-level only)
  console.log('📊 Generating Google ad data (30 days, mixed performance)...')

  const googleAdData: any[] = []

  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const date = dateStr(daysAgo)

    for (const campaign of GOOGLE_CAMPAIGNS) {
      const spendMultiplier = getDailySpendMultiplier(campaign.performance, daysAgo)
      const spend = campaign.dailyBudget * spendMultiplier

      const roas = getROASForPerformance(campaign.performance)
      const revenue = spend * roas
      const conversions = Math.max(0, Math.floor(revenue / rand(40, 60)))

      const impressions = Math.floor(spend * rand(100, 200))
      const clicks = Math.floor(impressions * rand(0.03, 0.08))

      googleAdData.push({
        user_id: userId,
        source: 'google_api',
        customer_id: GOOGLE_CUSTOMER_ID,
        date_start: date,
        date_end: date,
        campaign_name: campaign.name,
        campaign_id: campaign.id,
        campaign_status: campaign.status,
        campaign_type: campaign.type,
        campaign_budget: campaign.dailyBudget,
        // Required columns (even though migration 026 should make them optional)
        ad_group_name: '',
        ad_group_id: '',
        ad_group_status: 'ENABLED',
        ad_name: '',
        ad_id: '',
        ad_status: 'ENABLED',
        impressions,
        clicks,
        spend: Math.round(spend * 100) / 100,
        conversions,
        conversions_value: Math.round(revenue * 100) / 100,
        synced_at: new Date().toISOString(),
      })
    }
  }

  // Insert Google data
  for (let i = 0; i < googleAdData.length; i += BATCH_SIZE) {
    const batch = googleAdData.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('google_ad_data').insert(batch)
    if (error) {
      console.error('  ⚠️ Error inserting Google batch:', error.message)
    }
  }
  console.log(`  ✓ Inserted ${googleAdData.length} Google ad records`)

  // 9. Create workspace rules
  console.log('⚙️ Setting up workspace rules...')

  const { data: existingRules } = await supabase
    .from('workspace_rules')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  if (!existingRules) {
    await supabase.from('workspace_rules').insert({
      workspace_id: workspaceId,
      scale_roas: 3.0,
      min_roas: 1.5,
      learning_spend: 100,
      scale_percentage: 20,
    })
    console.log('  ✓ Created workspace rules')
  }

  // Summary
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('✅ Demo data seeded successfully!')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('📋 What was created:')
  console.log('')
  console.log('  ACCOUNTS (appear in dropdown):')
  console.log(`    • Meta: "${META_ACCOUNT_NAME}" (${META_ACCOUNT_ID})`)
  console.log(`    • Google: "${GOOGLE_ACCOUNT_NAME}" (${GOOGLE_CUSTOMER_ID})`)
  console.log('')
  console.log('  WORKSPACE:')
  console.log(`    • "Demo Business" with both accounts linked`)
  console.log('')
  console.log('  META PERFORMANCE MIX:')
  console.log('    • 3 SCALE ad sets (4-7x ROAS) - star these!')
  console.log('    • 2 WATCH ad sets (1.5-2.8x ROAS) - borderline')
  console.log('    • 2 KILL ad sets (0.4-1.3x ROAS) - bleeding money')
  console.log('    • 2 LEARN ad sets (low spend, variable)')
  console.log(`    • ${metaAdData.length} total ad records over 30 days`)
  console.log('')
  console.log('  GOOGLE PERFORMANCE MIX:')
  console.log('    • 2 SCALE campaigns')
  console.log('    • 1 WATCH campaign')
  console.log('    • 1 KILL campaign')
  console.log(`    • ${googleAdData.length} total campaign records over 30 days`)
  console.log('')
  console.log('🎬 To demo:')
  console.log('  1. Select "Demo E-Commerce Store" from account dropdown for Meta')
  console.log('  2. Select "Demo Google Ads" from account dropdown for Google')
  console.log('  3. Or select "Demo Business" workspace to see both')
  console.log('  4. Star the SCALE ads to demo the star system')
  console.log('')
}

// Main
const userId = process.argv[2]
if (!userId) {
  console.error('Usage: npx ts-node scripts/seed-demo-data.ts <user_id>')
  console.error('')
  console.error('Get your user ID from Supabase dashboard or run:')
  console.error('  SELECT id FROM auth.users WHERE email = \'your@email.com\'')
  process.exit(1)
}

seedDemoData(userId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
