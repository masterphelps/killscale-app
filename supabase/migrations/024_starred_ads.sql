-- Migration: 024_starred_ads.sql
-- Purpose: Create starred_ads table for storing user's starred/favorited ads
-- These are used for building Performance Sets (CBO campaigns from winning ads)

-- Create starred_ads table
CREATE TABLE IF NOT EXISTS starred_ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ad_account_id TEXT NOT NULL,

  -- Core identifiers (for duplication via Meta API)
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,

  -- Snapshot metrics at time of starring
  spend DECIMAL(10,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(5,2) DEFAULT 0,

  starred_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate stars for same ad
  UNIQUE(user_id, ad_account_id, ad_id)
);

-- Index for efficient queries by user and account
CREATE INDEX IF NOT EXISTS idx_starred_ads_user_account
  ON starred_ads(user_id, ad_account_id);

-- Index for ordering by starred date
CREATE INDEX IF NOT EXISTS idx_starred_ads_starred_at
  ON starred_ads(starred_at DESC);

-- Enable RLS
ALTER TABLE starred_ads ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only manage their own starred ads
DROP POLICY IF EXISTS "Users can manage own starred ads" ON starred_ads;
CREATE POLICY "Users can manage own starred ads" ON starred_ads
  FOR ALL USING (auth.uid() = user_id);
