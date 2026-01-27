-- Migration: UTM Status Storage
-- Stores UTM tracking status for ads, synced from Meta API
-- Allows caching UTM data to avoid repeated Meta API calls

-- Create utm_status table
CREATE TABLE IF NOT EXISTS utm_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  has_utm BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ad_account_id, ad_id)
);

-- Index for efficient lookups by user and ad account
CREATE INDEX IF NOT EXISTS idx_utm_status_user_account
  ON utm_status(user_id, ad_account_id);

-- Index for efficient lookups by ad_id (for joining with ad_data)
CREATE INDEX IF NOT EXISTS idx_utm_status_ad_id
  ON utm_status(ad_id);

-- Enable RLS
ALTER TABLE utm_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only read their own UTM status data
DROP POLICY IF EXISTS "Users can view own utm_status" ON utm_status;
CREATE POLICY "Users can view own utm_status" ON utm_status
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own UTM status data
DROP POLICY IF EXISTS "Users can insert own utm_status" ON utm_status;
CREATE POLICY "Users can insert own utm_status" ON utm_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own UTM status data
DROP POLICY IF EXISTS "Users can update own utm_status" ON utm_status;
CREATE POLICY "Users can update own utm_status" ON utm_status
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own UTM status data
DROP POLICY IF EXISTS "Users can delete own utm_status" ON utm_status;
CREATE POLICY "Users can delete own utm_status" ON utm_status
  FOR DELETE USING (auth.uid() = user_id);
