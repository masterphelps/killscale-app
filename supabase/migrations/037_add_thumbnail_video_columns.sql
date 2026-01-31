-- Add thumbnail_url, video_id, and image_url columns to ad_data
-- These are populated during sync from Meta's creative{id,thumbnail_url,image_url,video_id,image_hash} expansion
-- Allows Creative Studio to read thumbnails from Supabase instead of calling Meta API

ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS image_url TEXT;
