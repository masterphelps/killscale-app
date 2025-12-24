-- ============================================================================
-- CREATIVE STAR COUNT TRACKING
-- Allows starring same creative across multiple ad sets to identify
-- "universal performers" that work across different audiences
-- ============================================================================

-- Add column to track which instance this star is (1st, 2nd, 3rd, etc.)
ALTER TABLE starred_ads
ADD COLUMN IF NOT EXISTS star_instance INTEGER DEFAULT 1;

-- Create a view to aggregate star counts per creative
-- This powers the "universal performer" detection
CREATE OR REPLACE VIEW creative_star_counts AS
SELECT
  user_id,
  ad_account_id,
  creative_id,
  COUNT(*) as star_count,
  COUNT(DISTINCT adset_id) as unique_audiences,
  ARRAY_AGG(DISTINCT adset_name) as audience_names,
  MAX(roas) as best_roas,
  AVG(roas) as avg_roas,
  SUM(spend) as total_spend,
  SUM(revenue) as total_revenue
FROM starred_ads
WHERE creative_id IS NOT NULL
GROUP BY user_id, ad_account_id, creative_id;

-- Index for efficient creative lookups when counting stars
CREATE INDEX IF NOT EXISTS idx_starred_ads_creative_count
  ON starred_ads(user_id, ad_account_id, creative_id);
