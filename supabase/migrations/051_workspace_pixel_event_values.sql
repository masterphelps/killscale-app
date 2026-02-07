-- Add event_values JSONB column to workspace_pixels
-- Stores configured dollar values for conversion events (e.g., {"complete_registration": 129})
-- Used by pixel attribution to calculate revenue from non-purchase events

ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS event_values JSONB DEFAULT '{}';
