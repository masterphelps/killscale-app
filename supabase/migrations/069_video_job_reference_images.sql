-- Add reference_images column to video_generation_jobs
-- Stores product images so Veo extensions can access them
-- (extensions run server-side and don't have access to the original request body)

ALTER TABLE video_generation_jobs
ADD COLUMN IF NOT EXISTS reference_images JSONB DEFAULT NULL;
