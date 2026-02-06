-- Add ad copy text columns to ad_data for Creative Studio copy analysis
-- Populated during Meta sync from creative.object_story_spec
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS primary_text TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS description TEXT;
