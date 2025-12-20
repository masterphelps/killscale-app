-- Migration: 026_ad_data_creative_id.sql
-- Purpose: Add creative_id to ad_data for star deduplication
-- This allows detecting when two ads share the same creative

-- Add creative_id column to ad_data
ALTER TABLE ad_data
ADD COLUMN IF NOT EXISTS creative_id TEXT;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ad_data_creative_id
  ON ad_data(creative_id);
