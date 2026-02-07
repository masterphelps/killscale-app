-- Migration: Add target_url column to utm_status
-- Stores the ad's destination URL for attribution testing
-- Users can click an ad in the UTM panel to copy the URL and test the full flow

ALTER TABLE utm_status ADD COLUMN IF NOT EXISTS target_url TEXT;
