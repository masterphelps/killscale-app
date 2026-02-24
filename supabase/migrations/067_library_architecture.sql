-- Library Architecture Migration
-- Adds source tracking columns to media_library, creates collections system,
-- and extends video_compositions for cross-source and naming support.

-- ============================================================
-- 1. Extend media_library with source tracking columns
-- ============================================================

-- Back-reference to the video generation job that created this media
ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS source_job_id UUID REFERENCES video_generation_jobs(id) ON DELETE SET NULL;

-- Back-reference to the ad studio session that created this media
ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS source_session_id UUID REFERENCES ad_studio_sessions(id) ON DELETE SET NULL;

-- Back-reference to the video composition (project) that created this media
ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS source_composition_id UUID REFERENCES video_compositions(id) ON DELETE SET NULL;

-- Index for looking up library items by source
CREATE INDEX IF NOT EXISTS idx_media_library_source_job
  ON media_library(source_job_id) WHERE source_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_library_source_session
  ON media_library(source_session_id) WHERE source_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_library_source_composition
  ON media_library(source_composition_id) WHERE source_composition_id IS NOT NULL;

-- Index for filtering by source_type (used by Library filter pills)
CREATE INDEX IF NOT EXISTS idx_media_library_source_type
  ON media_library(user_id, ad_account_id, source_type);

-- ============================================================
-- 2. Create media_collections table
-- ============================================================

CREATE TABLE IF NOT EXISTS media_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_collections_user_account
  ON media_collections(user_id, ad_account_id);

ALTER TABLE media_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own collections" ON media_collections;
CREATE POLICY "Users can read own collections" ON media_collections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own collections" ON media_collections;
CREATE POLICY "Users can insert own collections" ON media_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own collections" ON media_collections;
CREATE POLICY "Users can update own collections" ON media_collections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own collections" ON media_collections;
CREATE POLICY "Users can delete own collections" ON media_collections
  FOR DELETE USING (auth.uid() = user_id);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to collections" ON media_collections;
CREATE POLICY "Service role has full access to collections" ON media_collections
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Create media_collection_items table
-- ============================================================

CREATE TABLE IF NOT EXISTS media_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES media_collections(id) ON DELETE CASCADE,
  media_library_id BIGINT NOT NULL REFERENCES media_library(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, media_library_id)
);

CREATE INDEX IF NOT EXISTS idx_media_collection_items_collection
  ON media_collection_items(collection_id);

CREATE INDEX IF NOT EXISTS idx_media_collection_items_media
  ON media_collection_items(media_library_id);

ALTER TABLE media_collection_items ENABLE ROW LEVEL SECURITY;

-- RLS via join to parent collection
DROP POLICY IF EXISTS "Users can read own collection items" ON media_collection_items;
CREATE POLICY "Users can read own collection items" ON media_collection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM media_collections
      WHERE media_collections.id = media_collection_items.collection_id
        AND media_collections.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own collection items" ON media_collection_items;
CREATE POLICY "Users can insert own collection items" ON media_collection_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM media_collections
      WHERE media_collections.id = media_collection_items.collection_id
        AND media_collections.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own collection items" ON media_collection_items;
CREATE POLICY "Users can update own collection items" ON media_collection_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM media_collections
      WHERE media_collections.id = media_collection_items.collection_id
        AND media_collections.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own collection items" ON media_collection_items;
CREATE POLICY "Users can delete own collection items" ON media_collection_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM media_collections
      WHERE media_collections.id = media_collection_items.collection_id
        AND media_collections.user_id = auth.uid()
    )
  );

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to collection items" ON media_collection_items;
CREATE POLICY "Service role has full access to collection items" ON media_collection_items
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Extend video_compositions for cross-source and naming
-- ============================================================

-- User-chosen project name
ALTER TABLE video_compositions
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Allow compositions to reference library items (cross-source)
ALTER TABLE video_compositions
  ADD COLUMN IF NOT EXISTS source_library_ids BIGINT[];

-- Make canvas_id nullable (library-sourced compositions don't need a canvas)
ALTER TABLE video_compositions
  ALTER COLUMN canvas_id DROP NOT NULL;
