-- Add product_name to video_generation_jobs for display in AI Tasks
ALTER TABLE video_generation_jobs
  ADD COLUMN IF NOT EXISTS product_name TEXT;
