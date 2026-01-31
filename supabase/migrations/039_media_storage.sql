-- Migration: 039_media_storage.sql
-- Purpose: Add Supabase Storage columns to media_library and ad_data
-- Enables downloading images + video thumbnails into our own storage
-- so browse-time is zero Meta API calls and survives account disconnects.

-- Add storage columns to media_library
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS storage_url TEXT;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS download_status TEXT DEFAULT 'pending';
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

-- Add storage_url to ad_data for performance table display
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS storage_url TEXT;

-- Index for efficient batch querying of pending downloads
CREATE INDEX IF NOT EXISTS idx_media_library_download_status
  ON media_library(user_id, ad_account_id, download_status)
  WHERE download_status != 'complete';
