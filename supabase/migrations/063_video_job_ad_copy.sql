-- Add ad_copy column to video_generation_jobs for Create Ad pre-loading
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS ad_copy JSONB;
