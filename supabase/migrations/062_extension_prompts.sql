-- Add extension_prompts column to video_generation_jobs
-- Stores per-segment prompts for Veo 3.1 extensions so each extension
-- gets a continuation-specific prompt instead of replaying the full original.
-- Format: JSONB array of strings, index 0 = extension step 1, etc.

ALTER TABLE video_generation_jobs
ADD COLUMN IF NOT EXISTS extension_prompts JSONB DEFAULT NULL;

COMMENT ON COLUMN video_generation_jobs.extension_prompts IS 'Per-segment prompts for Veo extensions. Index 0 = first extension, etc. Null = use original prompt.';
