-- Migration: 025_starred_ads_creative_id.sql
-- Purpose: Add creative_id to starred_ads for deduplication
-- Prevents starring multiple ads that use the same creative

-- Add creative_id column
ALTER TABLE starred_ads
ADD COLUMN IF NOT EXISTS creative_id TEXT;

-- Create index for checking if a creative is already starred
CREATE INDEX IF NOT EXISTS idx_starred_ads_creative
  ON starred_ads(user_id, ad_account_id, creative_id);
