-- Migration: 036_creative_media_tracking.sql
-- Purpose: Add media_hash and media_type columns to ad_data for media-level deduplication
-- This allows Creative Studio to aggregate performance by the actual media asset (image/video)
-- rather than by creative_id (which can be different for same media with different copy)

-- Add media_hash column (stores image_hash or video_id from Meta)
ALTER TABLE ad_data
ADD COLUMN IF NOT EXISTS media_hash TEXT;

-- Add media_type column (image, video, carousel, dynamic)
ALTER TABLE ad_data
ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ad_data_media_hash
  ON ad_data(media_hash);

CREATE INDEX IF NOT EXISTS idx_ad_data_media_type
  ON ad_data(media_type);

-- Composite index for Creative Studio queries that filter by user + account + media_hash
CREATE INDEX IF NOT EXISTS idx_ad_data_user_account_media
  ON ad_data(user_id, ad_account_id, media_hash)
  WHERE media_hash IS NOT NULL;
