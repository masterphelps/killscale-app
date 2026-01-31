-- Migration: 038_media_library.sql
-- Purpose: Media Library table for storing ad account images and videos
-- Enables zero-API browsing of media assets by caching them locally in Supabase

-- Media Library: stores ad account images and videos for zero-API browsing
CREATE TABLE IF NOT EXISTS media_library (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  media_hash TEXT NOT NULL,
  media_type TEXT NOT NULL,
  name TEXT,
  url TEXT,
  video_thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ad_account_id, media_hash)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_media_library_account
  ON media_library(user_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_media_library_hash
  ON media_library(media_hash);

-- Enable RLS
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

-- RLS policies: drop first, then create (idempotent)
DROP POLICY IF EXISTS "Users can view own media" ON media_library;
CREATE POLICY "Users can view own media" ON media_library
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own media" ON media_library;
CREATE POLICY "Users can insert own media" ON media_library
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own media" ON media_library;
CREATE POLICY "Users can update own media" ON media_library
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own media" ON media_library;
CREATE POLICY "Users can delete own media" ON media_library
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access media_library" ON media_library;
CREATE POLICY "Service role full access media_library" ON media_library
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
