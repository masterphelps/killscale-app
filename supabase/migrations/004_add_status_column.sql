-- Add status columns for tracking ad/adset/campaign status from Meta API
-- Run this in Supabase SQL Editor

-- Ad status (effective_status from Meta - includes parent inheritance)
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS status TEXT;

-- Individual entity statuses for proper aggregation
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS adset_status TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS campaign_status TEXT;

-- Entity IDs for reference
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS ad_id TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS adset_id TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_ad_data_status ON ad_data(status);
CREATE INDEX IF NOT EXISTS idx_ad_data_adset_status ON ad_data(adset_status);
CREATE INDEX IF NOT EXISTS idx_ad_data_campaign_status ON ad_data(campaign_status);
