-- Performance indexes for ad_data table
-- Fixes statement timeouts on large accounts (100K+ rows)
-- These cover the most common query patterns across the app

-- Primary lookup: user + account (used by copy API, active-ads API, Creative Studio)
-- These queries scan ALL rows for a user+account with no date filter
CREATE INDEX IF NOT EXISTS idx_ad_data_user_account
  ON ad_data(user_id, ad_account_id);

-- Dashboard/Trends queries: user + account + date range
-- Covers the most common filtered query pattern
CREATE INDEX IF NOT EXISTS idx_ad_data_user_account_date
  ON ad_data(user_id, ad_account_id, date_start);

-- Insights page: user + date range (no account filter)
CREATE INDEX IF NOT EXISTS idx_ad_data_user_date
  ON ad_data(user_id, date_start);
