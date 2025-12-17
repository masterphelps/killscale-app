-- One-time cleanup of orphaned ad_data records
-- These are records with ad_account_id formats that no longer match meta_connections
-- Caused by format changes over time (e.g., 123456789 vs act_123456789)

-- Delete ad_data where the ad_account_id doesn't match any user's connected accounts
DELETE FROM ad_data ad
WHERE NOT EXISTS (
  SELECT 1 FROM meta_connections mc
  WHERE mc.user_id = ad.user_id
  AND (
    -- Direct match
    mc.ad_accounts::text LIKE '%"' || ad.ad_account_id || '"%'
    -- Match with act_ prefix added
    OR mc.ad_accounts::text LIKE '%"act_' || ad.ad_account_id || '"%'
    -- Match with act_ prefix stripped
    OR mc.ad_accounts::text LIKE '%"' || REPLACE(ad.ad_account_id, 'act_', '') || '"%'
  )
);
