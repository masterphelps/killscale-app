-- Migration: 042_starred_media.sql
-- Purpose: Create starred_media table for Creative Studio starred assets
-- Used for building new ads from winning creatives

CREATE TABLE IF NOT EXISTS starred_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ad_account_id TEXT NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  media_hash TEXT NOT NULL,
  media_type TEXT NOT NULL,
  thumbnail_url TEXT,
  media_name TEXT,
  starred_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ad_account_id, media_hash)
);

-- Index for efficient queries by user and account
CREATE INDEX IF NOT EXISTS idx_starred_media_user_account
  ON starred_media(user_id, ad_account_id);

-- Index for ordering by starred date
CREATE INDEX IF NOT EXISTS idx_starred_media_starred_at
  ON starred_media(starred_at DESC);

-- Enable RLS
ALTER TABLE starred_media ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only manage their own starred media
DROP POLICY IF EXISTS "Users can manage own starred media" ON starred_media;
CREATE POLICY "Users can manage own starred media" ON starred_media
  FOR ALL USING (auth.uid() = user_id);

-- Service role has full access (for API routes using service role key)
DROP POLICY IF EXISTS "Service role full access to starred media" ON starred_media;
CREATE POLICY "Service role full access to starred media" ON starred_media
  FOR ALL USING (true) WITH CHECK (true);
