-- Add dialogue column to video_generation_jobs for UGC transcript/caption generation
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS dialogue TEXT;
