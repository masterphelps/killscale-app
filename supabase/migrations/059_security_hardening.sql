-- =============================================================================
-- Security hardening: drop redundant USING(true) policies, fix SECURITY_DEFINER views
-- All affected tables/views are accessed exclusively via service_role in API routes.
-- service_role bypasses RLS, so these policies were redundant attack surface.
-- =============================================================================

-- 1. Drop redundant "Service role can manage" USING(true) policies
--    service_role bypasses RLS — these just gave anon/authenticated unintended access
DROP POLICY IF EXISTS "Service role can manage alert settings" ON alert_settings;
DROP POLICY IF EXISTS "Service role can manage alerts" ON alerts;
DROP POLICY IF EXISTS "Service role can manage google ad data" ON google_ad_data;
DROP POLICY IF EXISTS "Service role can manage google connections" ON google_connections;
DROP POLICY IF EXISTS "Service role can manage portal sessions" ON portal_sessions;
DROP POLICY IF EXISTS "Service role full access to starred media" ON starred_media;

-- 2. Revoke anon/authenticated from tables that should be service-role only
REVOKE ALL ON alert_settings FROM anon, authenticated;
REVOKE ALL ON alerts FROM anon, authenticated;
REVOKE ALL ON google_ad_data FROM anon, authenticated;
REVOKE ALL ON google_connections FROM anon, authenticated;
REVOKE ALL ON portal_sessions FROM anon, authenticated;
REVOKE ALL ON starred_media FROM anon, authenticated;

-- 3. Fix SECURITY_DEFINER views → SECURITY_INVOKER
--    All are queried via service_role only. INVOKER is the safe default.

-- media_performance (unused in code, but fix anyway)
DROP VIEW IF EXISTS media_performance;
CREATE VIEW media_performance WITH (security_invoker = true) AS
SELECT user_id, ad_account_id, media_hash, media_type,
  sum(spend) AS spend,
  sum(COALESCE(revenue, 0::numeric)) AS revenue,
  CASE WHEN sum(spend) > 0 THEN round(sum(COALESCE(revenue, 0::numeric)) / sum(spend), 2) ELSE 0::numeric END AS roas,
  sum(impressions) AS impressions,
  sum(clicks) AS clicks,
  CASE WHEN sum(impressions) > 0 THEN round((sum(clicks)::numeric / sum(impressions)::numeric) * 100::numeric, 4) ELSE 0::numeric END AS ctr,
  CASE WHEN sum(impressions) > 0 THEN round((sum(spend) / sum(impressions)::numeric) * 1000::numeric, 2) ELSE 0::numeric END AS cpm,
  CASE WHEN sum(clicks) > 0 THEN round(sum(spend) / sum(clicks)::numeric, 2) ELSE 0::numeric END AS cpc,
  sum(COALESCE(results, 0)) AS results,
  CASE WHEN sum(COALESCE(results, 0)) > 0 THEN round(sum(spend) / sum(results)::numeric, 2) ELSE 0::numeric END AS cpr,
  count(DISTINCT creative_id) AS creative_count,
  count(DISTINCT ad_id) AS ad_count,
  count(DISTINCT adset_id) AS adset_count,
  count(DISTINCT campaign_id) AS campaign_count,
  max(thumbnail_url) AS thumbnail_url,
  min(date_start) AS first_date,
  max(date_end) AS last_date
FROM ad_data WHERE media_hash IS NOT NULL
GROUP BY user_id, ad_account_id, media_hash, media_type;

-- creative_performance
DROP VIEW IF EXISTS creative_performance;
CREATE VIEW creative_performance WITH (security_invoker = true) AS
SELECT user_id, ad_account_id, creative_id,
  sum(spend) AS spend,
  sum(COALESCE(revenue, 0::numeric)) AS revenue,
  CASE WHEN sum(spend) > 0 THEN round(sum(COALESCE(revenue, 0::numeric)) / sum(spend), 2) ELSE 0::numeric END AS roas,
  sum(impressions) AS impressions,
  sum(clicks) AS clicks,
  CASE WHEN sum(impressions) > 0 THEN round((sum(clicks)::numeric / sum(impressions)::numeric) * 100::numeric, 4) ELSE 0::numeric END AS ctr,
  CASE WHEN sum(impressions) > 0 THEN round((sum(spend) / sum(impressions)::numeric) * 1000::numeric, 2) ELSE 0::numeric END AS cpm,
  CASE WHEN sum(clicks) > 0 THEN round(sum(spend) / sum(clicks)::numeric, 2) ELSE 0::numeric END AS cpc,
  sum(COALESCE(results, 0)) AS results,
  CASE WHEN sum(COALESCE(results, 0)) > 0 THEN round(sum(spend) / sum(results)::numeric, 2) ELSE 0::numeric END AS cpr,
  count(DISTINCT ad_id) AS ad_count,
  count(DISTINCT adset_id) AS adset_count,
  count(DISTINCT campaign_id) AS campaign_count,
  max(media_hash) AS media_hash,
  max(media_type) AS media_type,
  max(thumbnail_url) AS thumbnail_url,
  min(date_start) AS first_date,
  max(date_end) AS last_date
FROM ad_data WHERE creative_id IS NOT NULL
GROUP BY user_id, ad_account_id, creative_id;

-- creative_star_counts
DROP VIEW IF EXISTS creative_star_counts;
CREATE VIEW creative_star_counts WITH (security_invoker = true) AS
SELECT user_id, ad_account_id, creative_id,
  count(*) AS star_count,
  count(DISTINCT adset_id) AS unique_audiences,
  array_agg(DISTINCT adset_name) AS audience_names,
  max(roas) AS best_roas,
  avg(roas) AS avg_roas,
  sum(spend) AS total_spend,
  sum(revenue) AS total_revenue
FROM starred_ads WHERE creative_id IS NOT NULL
GROUP BY user_id, ad_account_id, creative_id;

-- ad_studio_sessions_list
DROP VIEW IF EXISTS ad_studio_sessions_list;
CREATE VIEW ad_studio_sessions_list WITH (security_invoker = true) AS
SELECT id, user_id, ad_account_id, product_url,
  (product_info - 'imageBase64' - 'imageMimeType') AS product_info,
  competitor_company, generated_images, image_style,
  status, created_at, updated_at
FROM ad_studio_sessions;
