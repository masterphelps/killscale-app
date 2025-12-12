-- Migration: Results-Based Tracking
-- Purpose: Add support for tracking results based on campaign objectives (leads, purchases, registrations, etc.)
-- Date: 2024-12-11

-- ============================================
-- 1. Add results columns to ad_data table
-- ============================================

-- Generic result count (purchases, leads, registrations, etc.)
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS results INTEGER DEFAULT 0;

-- Value of results (only for purchases/revenue-based results, NULL for leads/registrations)
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS result_value DECIMAL(12,2) DEFAULT NULL;

-- Type of result: 'purchase', 'lead', 'registration', 'click', etc.
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT NULL;

-- ============================================
-- 2. Add CPR threshold columns to rules table
-- ============================================

-- Target Cost Per Result (SCALE threshold for lead-gen campaigns)
-- Lower CPR is better, so CPR <= target_cpr = SCALE
ALTER TABLE rules ADD COLUMN IF NOT EXISTS target_cpr DECIMAL(10,2) DEFAULT NULL;

-- Maximum Cost Per Result (KILL threshold for lead-gen campaigns)
-- CPR > max_cpr = KILL
ALTER TABLE rules ADD COLUMN IF NOT EXISTS max_cpr DECIMAL(10,2) DEFAULT NULL;

-- ============================================
-- 3. Backfill existing data
-- ============================================

-- For existing ad_data rows, set results = purchases and result_value = revenue
-- This ensures backwards compatibility with existing purchase-based data
UPDATE ad_data
SET
  results = COALESCE(purchases, 0),
  result_value = COALESCE(revenue, 0),
  result_type = 'purchase'
WHERE results IS NULL OR results = 0;

-- ============================================
-- 4. Add index for result_type queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ad_data_result_type ON ad_data(result_type);

-- ============================================
-- NOTES
-- ============================================
--
-- Verdict Logic:
--   For campaigns with result_value (purchases):
--     - Uses ROAS thresholds (scale_roas, min_roas)
--   For campaigns without result_value (leads, registrations):
--     - Uses CPR thresholds (target_cpr, max_cpr)
--     - Lower CPR is better (inverse of ROAS logic)
--
-- Result Types from Meta API:
--   - 'purchase' / 'omni_purchase' - Has monetary value
--   - 'lead' - Lead gen forms, no value
--   - 'registration' - Complete registration events
--   - 'link_click' - Traffic campaigns
--   - 'post_engagement' - Engagement campaigns
--   - 'video_view' - Video view campaigns
--
-- CPR Threshold Example:
--   target_cpr = $25 → CPR ≤ $25 = SCALE
--   max_cpr = $50 → $25 < CPR ≤ $50 = WATCH, CPR > $50 = KILL
