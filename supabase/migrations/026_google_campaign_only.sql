-- ============================================================================
-- GOOGLE ADS CAMPAIGN-ONLY MODEL
-- Simplifies Google Ads to campaign-level only (no ad_group/ad hierarchy)
-- Google campaign types (PMax, Search, Display, etc.) have inconsistent
-- child structures, so we just track campaign-level metrics and verdicts.
-- ============================================================================

-- Make ad_group columns optional (nullable with defaults)
-- We're not using them anymore but don't want to lose existing data
ALTER TABLE google_ad_data
  ALTER COLUMN ad_group_name SET DEFAULT '',
  ALTER COLUMN ad_group_name DROP NOT NULL;

ALTER TABLE google_ad_data
  ALTER COLUMN ad_group_id SET DEFAULT '',
  ALTER COLUMN ad_group_id DROP NOT NULL;

-- Make ad columns optional (nullable with defaults)
ALTER TABLE google_ad_data
  ALTER COLUMN ad_name SET DEFAULT '',
  ALTER COLUMN ad_name DROP NOT NULL;

ALTER TABLE google_ad_data
  ALTER COLUMN ad_id SET DEFAULT '',
  ALTER COLUMN ad_id DROP NOT NULL;

-- Drop old unique constraint (was per-ad level)
ALTER TABLE google_ad_data
  DROP CONSTRAINT IF EXISTS google_ad_data_user_id_customer_id_date_start_campaign_id_ad__key;

-- Create new unique constraint (campaign-level only)
ALTER TABLE google_ad_data
  ADD CONSTRAINT google_ad_data_campaign_unique
  UNIQUE (user_id, customer_id, date_start, campaign_id);

-- Drop indexes we no longer need
DROP INDEX IF EXISTS idx_google_ad_data_ad_group;

-- Clean up old ad-level data - consolidate to campaign level
-- This deletes duplicate rows, keeping only one per campaign
-- (The next sync will repopulate with clean campaign-level data)
DELETE FROM google_ad_data a
USING google_ad_data b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.customer_id = b.customer_id
  AND a.date_start = b.date_start
  AND a.campaign_id = b.campaign_id;
