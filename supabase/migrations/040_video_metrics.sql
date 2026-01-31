-- Migration: Add video engagement metrics columns to ad_data
-- These columns store video-specific performance data from Meta API insights.
-- All nullable — image creatives leave them null.

ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_views INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_thruplay INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_p25 INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_p50 INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_p75 INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_p95 INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_p100 INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_avg_time_watched NUMERIC;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS video_plays INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS cost_per_thruplay NUMERIC;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS outbound_clicks INTEGER;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS inline_link_click_ctr NUMERIC;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS cost_per_inline_link_click NUMERIC;
