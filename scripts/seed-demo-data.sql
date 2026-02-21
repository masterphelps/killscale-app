-- =============================================================================
-- KillScale Demo Data Seed Script
-- =============================================================================
-- Run this in Supabase SQL Editor to create/recreate demo data for the
-- demo account (contactkillscale@gmail.com).
--
-- Safe to run multiple times — deletes existing demo data first.
--
-- Targets:
--   - 6 campaigns (4 active, 2 paused)
--   - 30 days of data
--   - ~$500/day total spend (~$15K total)
--   - ~$75K total revenue
--   - ~5.0x overall ROAS
--   - 1 underperforming campaign (~1.8x ROAS)
--   - 1 improving campaign (CTR ↑, CPA ↓ over 30 days)
--   - 1 losing campaign (CTR ↓, frequency ↑ over 30 days)
--   - source = 'demo' (survives Meta disconnects)
-- =============================================================================

DO $$
DECLARE
  v_demo_user_id UUID := 'cab4a74f-dce0-45a2-ba75-dc53331624cc';
  v_workspace_id UUID := 'd0d0d0d0-1111-2222-3333-444444444444';
  v_account_id TEXT := 'act_999888777666';
  v_today DATE := CURRENT_DATE;
  v_day DATE;
  v_day_idx INT;
  v_progress FLOAT;
  v_base_spend FLOAT;
  v_spend FLOAT;
  v_impressions INT;
  v_clicks INT;
  v_purchases INT;
  v_revenue FLOAT;
  v_reach INT;
  v_freq FLOAT;
  v_ctr FLOAT;
  v_rand FLOAT;
BEGIN
  -- =========================================================================
  -- 1. Clean up existing demo data
  -- =========================================================================
  DELETE FROM ad_data WHERE ad_account_id = v_account_id AND source = 'demo';

  -- =========================================================================
  -- 2. Ensure Demo Store workspace exists
  -- =========================================================================
  INSERT INTO workspaces (id, user_id, name, description, is_default, business_type)
  VALUES (v_workspace_id, v_demo_user_id, 'Demo Store', 'Demo e-commerce store for presentations', false, 'ecommerce')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    is_default = false;

  -- =========================================================================
  -- 3. Ensure workspace_accounts link exists
  -- =========================================================================
  INSERT INTO workspace_accounts (workspace_id, platform, ad_account_id, ad_account_name, currency, initial_sync_complete)
  VALUES (v_workspace_id, 'meta', v_account_id, 'Demo Store', 'USD', true)
  ON CONFLICT (workspace_id, platform, ad_account_id) DO UPDATE SET
    initial_sync_complete = true,
    ad_account_name = 'Demo Store';

  -- =========================================================================
  -- 4. Add demo account to meta_connections (if not already there)
  -- =========================================================================
  UPDATE meta_connections
  SET ad_accounts = ad_accounts || '[{"id": "act_999888777666", "name": "Demo Store", "currency": "USD", "in_dashboard": true, "account_status": 1}]'::jsonb
  WHERE user_id = v_demo_user_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(ad_accounts) elem
      WHERE elem->>'id' = 'act_999888777666'
    );

  -- =========================================================================
  -- 5. Ensure workspace_rules exist (defaults are fine)
  -- =========================================================================
  INSERT INTO workspace_rules (workspace_id)
  VALUES (v_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  -- =========================================================================
  -- 6. Generate campaign data
  -- =========================================================================

  -- -----------------------------------------------------------------------
  -- Campaign 1: CBO - Summer Collection Launch (ACTIVE, ~5.7x ROAS)
  -- Top spender, 3 ads, steady performer
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..29 LOOP
    v_day := v_today - (29 - v_day_idx);
    v_rand := 0.85 + random() * 0.3; -- 0.85-1.15 daily variance

    FOR i IN 1..3 LOOP
      v_base_spend := (165.0 / 3.0) * v_rand * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);
      v_impressions := (v_spend * (280 + random() * 60))::int;  -- ~300 impr per $
      v_clicks := GREATEST(1, (v_impressions * (0.018 + random() * 0.008))::int); -- 1.8-2.6% CTR
      v_purchases := GREATEST(1, (v_spend * (0.08 + random() * 0.03))::int); -- ~10% conv rate on clicks
      v_revenue := ROUND((v_spend * (5.2 + random() * 1.0))::numeric, 2); -- 5.2-6.2x ROAS
      v_reach := (v_impressions * (0.7 + random() * 0.15))::int;
      v_freq := ROUND((v_impressions::float / GREATEST(v_reach, 1))::numeric, 4);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status, campaign_daily_budget,
        adset_name, adset_id, adset_status,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'CBO - Summer Collection Launch', 'demo_c1', 'ACTIVE', 165,
        'Broad Interest - Fashion', 'demo_as1', 'ACTIVE',
        'Ad ' || i || ' - Summer Vibes', 'demo_ad1_' || i, 'ACTIVE', 'demo_cr1_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Campaign 2: CBO - Retargeting Warm Audiences (ACTIVE, ~7.3x ROAS)
  -- High ROAS retargeting, 2 ads
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..29 LOOP
    v_day := v_today - (29 - v_day_idx);
    v_rand := 0.85 + random() * 0.3;

    FOR i IN 1..2 LOOP
      v_base_spend := (90.0 / 2.0) * v_rand * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);
      v_impressions := (v_spend * (250 + random() * 80))::int;
      v_clicks := GREATEST(1, (v_impressions * (0.025 + random() * 0.012))::int); -- 2.5-3.7% CTR (warm audience)
      v_purchases := GREATEST(1, (v_spend * (0.10 + random() * 0.04))::int);
      v_revenue := ROUND((v_spend * (6.8 + random() * 1.4))::numeric, 2); -- 6.8-8.2x ROAS
      v_reach := (v_impressions * (0.65 + random() * 0.15))::int;
      v_freq := ROUND((v_impressions::float / GREATEST(v_reach, 1))::numeric, 4);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status, campaign_daily_budget,
        adset_name, adset_id, adset_status,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'CBO - Retargeting Warm Audiences', 'demo_c2', 'ACTIVE', 90,
        'Website Visitors 30d', 'demo_as2', 'ACTIVE',
        'Ad ' || i || ' - Come Back', 'demo_ad2_' || i, 'ACTIVE', 'demo_cr2_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Campaign 3: ABO - Broad Prospecting (ACTIVE, IMPROVING over 30 days)
  -- CTR: 0.8% → 2.5%, CPC: $2.50 → $0.80, frequency stays ~1.2
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..29 LOOP
    v_day := v_today - (29 - v_day_idx);
    v_progress := v_day_idx::float / 29.0; -- 0.0 to 1.0
    v_rand := 0.9 + random() * 0.2;

    FOR i IN 1..2 LOOP
      v_base_spend := (72.0 / 2.0) * v_rand * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);

      -- CTR improves from 0.8% to 2.5%
      v_ctr := 0.008 + v_progress * 0.017;
      v_impressions := (v_spend * (250 + random() * 60))::int;
      v_clicks := GREATEST(1, (v_impressions * (v_ctr + random() * 0.003))::int);

      -- ROAS improves from 2.5 to 5.5
      v_revenue := ROUND((v_spend * (2.5 + v_progress * 3.0 + random() * 0.5))::numeric, 2);
      v_purchases := GREATEST(1, (v_revenue / (45 + random() * 15))::int); -- AOV ~$50

      -- Frequency stays steady ~1.2
      v_reach := (v_impressions / (1.15 + random() * 0.1))::int;
      v_freq := ROUND((v_impressions::float / GREATEST(v_reach, 1))::numeric, 4);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status,
        adset_name, adset_id, adset_status, adset_daily_budget,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'ABO - Broad Prospecting', 'demo_c3', 'ACTIVE',
        'Interest - Health & Fitness', 'demo_as3', 'ACTIVE', 72,
        'Ad ' || i || ' - Discovery', 'demo_ad3_' || i, 'ACTIVE', 'demo_cr3_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Campaign 4: CBO - New Product Test (ACTIVE, ~5.0x ROAS)
  -- Solid mid-tier performer, 2 ads
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..29 LOOP
    v_day := v_today - (29 - v_day_idx);
    v_rand := 0.85 + random() * 0.3;

    FOR i IN 1..2 LOOP
      v_base_spend := (84.0 / 2.0) * v_rand * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);
      v_impressions := (v_spend * (270 + random() * 50))::int;
      v_clicks := GREATEST(1, (v_impressions * (0.016 + random() * 0.008))::int); -- 1.6-2.4% CTR
      v_purchases := GREATEST(1, (v_spend * (0.07 + random() * 0.03))::int);
      v_revenue := ROUND((v_spend * (4.5 + random() * 1.2))::numeric, 2); -- 4.5-5.7x ROAS
      v_reach := (v_impressions * (0.72 + random() * 0.12))::int;
      v_freq := ROUND((v_impressions::float / GREATEST(v_reach, 1))::numeric, 4);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status, campaign_daily_budget,
        adset_name, adset_id, adset_status,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'CBO - New Product Test', 'demo_c4', 'ACTIVE', 84,
        'Lookalike - Purchasers 1%', 'demo_as4', 'ACTIVE',
        'Ad ' || i || ' - New Drop', 'demo_ad4_' || i, 'ACTIVE', 'demo_cr4_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Campaign 5: ABO - Lookalike Cold (PAUSED, LOSING over 20 days)
  -- CTR: 2.0% → 0.6%, frequency: 1.5 → 4.0, ~1.8x ROAS
  -- Only 20 days of data (paused 10 days ago)
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..19 LOOP
    v_day := v_today - (29 - v_day_idx); -- starts 30 days ago, stops after 20 days
    v_progress := v_day_idx::float / 19.0; -- 0.0 to 1.0

    FOR i IN 1..2 LOOP
      v_base_spend := (63.0 / 2.0) * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);

      -- CTR degrades from 2.0% to 0.6%
      v_ctr := 0.020 - v_progress * 0.014;
      v_impressions := (v_spend * (260 + random() * 50))::int;
      v_clicks := GREATEST(1, (v_impressions * (v_ctr + random() * 0.002))::int);

      -- Frequency increases from 1.5 to 4.0 (audience exhaustion)
      v_freq := 1.5 + v_progress * 2.5;
      v_reach := GREATEST(1, (v_impressions / v_freq)::int);
      v_freq := ROUND(v_freq::numeric, 4);

      -- ROAS degrades from 2.5 to 1.2
      v_revenue := ROUND((v_spend * (2.5 - v_progress * 1.3 + random() * 0.3))::numeric, 2);
      v_purchases := GREATEST(0, (v_revenue / (55 + random() * 15))::int);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status,
        adset_name, adset_id, adset_status, adset_daily_budget,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'ABO - Lookalike Cold', 'demo_c5', 'PAUSED',
        'LAL - Email List 5%', 'demo_as5', 'PAUSED', 63,
        'Ad ' || i || ' - Cold Reach', 'demo_ad5_' || i, 'PAUSED', 'demo_cr5_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Campaign 6: CBO - Holiday Promo (PAUSED, ~3.5x ROAS)
  -- Seasonal campaign, 25 days of data, paused 5 days ago
  -- -----------------------------------------------------------------------
  FOR v_day_idx IN 0..24 LOOP
    v_day := v_today - (29 - v_day_idx); -- starts 30 days ago, stops after 25 days
    v_rand := 0.85 + random() * 0.3;

    FOR i IN 1..2 LOOP
      v_base_spend := (57.0 / 2.0) * v_rand * (0.9 + random() * 0.2);
      v_spend := ROUND(v_base_spend::numeric, 2);
      v_impressions := (v_spend * (260 + random() * 50))::int;
      v_clicks := GREATEST(1, (v_impressions * (0.014 + random() * 0.006))::int); -- 1.4-2.0% CTR
      v_purchases := GREATEST(1, (v_spend * (0.05 + random() * 0.02))::int);
      v_revenue := ROUND((v_spend * (3.0 + random() * 1.0))::numeric, 2); -- 3.0-4.0x ROAS
      v_reach := (v_impressions * (0.68 + random() * 0.12))::int;
      v_freq := ROUND((v_impressions::float / GREATEST(v_reach, 1))::numeric, 4);

      INSERT INTO ad_data (
        id, user_id, ad_account_id, date_start, date_end,
        campaign_name, campaign_id, campaign_status, campaign_daily_budget,
        adset_name, adset_id, adset_status,
        ad_name, ad_id, status, creative_id,
        impressions, clicks, spend, purchases, revenue,
        reach, frequency, source
      ) VALUES (
        gen_random_uuid(), v_demo_user_id, v_account_id, v_day, v_day,
        'CBO - Holiday Promo', 'demo_c6', 'PAUSED', 57,
        'Holiday Shoppers', 'demo_as6', 'PAUSED',
        'Ad ' || i || ' - Holiday Deal', 'demo_ad6_' || i, 'PAUSED', 'demo_cr6_' || i,
        v_impressions, v_clicks, v_spend, v_purchases, v_revenue,
        v_reach, v_freq, 'demo'
      );
    END LOOP;
  END LOOP;

  -- =========================================================================
  -- 7. Verify totals
  -- =========================================================================
  RAISE NOTICE '=== Demo Data Seed Complete ===';
  RAISE NOTICE 'Run the verification query below to check totals:';
  RAISE NOTICE '';
  RAISE NOTICE 'SELECT campaign_name, status, COUNT(DISTINCT date_start) as days,';
  RAISE NOTICE '  ROUND(SUM(spend)::numeric,2) as spend,';
  RAISE NOTICE '  ROUND(SUM(revenue)::numeric,2) as revenue,';
  RAISE NOTICE '  ROUND((SUM(revenue)/NULLIF(SUM(spend),0))::numeric,2) as roas';
  RAISE NOTICE 'FROM ad_data WHERE source = ''demo''';
  RAISE NOTICE 'GROUP BY campaign_name, campaign_id, status ORDER BY spend DESC;';

END $$;

-- =============================================================================
-- Verification query (run after the DO block)
-- =============================================================================
SELECT
  'TOTAL' as campaign,
  '' as status,
  COUNT(*) as rows,
  COUNT(DISTINCT campaign_id) as campaigns,
  ROUND(SUM(spend)::numeric, 2) as spend,
  ROUND(SUM(revenue)::numeric, 2) as revenue,
  ROUND((SUM(revenue) / NULLIF(SUM(spend), 0))::numeric, 2) as roas,
  ROUND((SUM(spend) / COUNT(DISTINCT date_start))::numeric, 2) as daily_spend
FROM ad_data
WHERE source = 'demo'
UNION ALL
SELECT
  campaign_name,
  campaign_status,
  COUNT(*),
  1,
  ROUND(SUM(spend)::numeric, 2),
  ROUND(SUM(revenue)::numeric, 2),
  ROUND((SUM(revenue) / NULLIF(SUM(spend), 0))::numeric, 2),
  ROUND((SUM(spend) / COUNT(DISTINCT date_start))::numeric, 2)
FROM ad_data
WHERE source = 'demo'
GROUP BY campaign_name, campaign_id, campaign_status
ORDER BY spend DESC;
