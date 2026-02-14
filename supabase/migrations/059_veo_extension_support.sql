-- 059: Veo 3.1 video extension support
-- Adds columns to track multi-step video extensions (8s initial + 7s extensions)

ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS target_duration_seconds INTEGER;
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS extension_step INTEGER DEFAULT 0;
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS extension_total INTEGER DEFAULT 0;
ALTER TABLE video_generation_jobs ADD COLUMN IF NOT EXISTS extension_video_uri TEXT;

-- Backfill existing jobs with explicit provider based on sora_job_id prefix
UPDATE video_generation_jobs SET provider = 'runway' WHERE sora_job_id LIKE 'runway:%' AND provider IS NULL;
UPDATE video_generation_jobs SET provider = 'veo' WHERE sora_job_id LIKE 'veo:%' AND provider IS NULL;
UPDATE video_generation_jobs SET provider = 'sora' WHERE sora_job_id IS NOT NULL AND provider IS NULL;
