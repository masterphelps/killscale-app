-- ============================================================================
-- DASHBOARD ACCOUNTS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add in_dashboard field to track which accounts are added to dashboard
-- The ad_accounts JSONB in meta_connections will now include:
-- { id, name, account_status, currency, in_dashboard: boolean }

-- We'll also add a selected_account_id to track the currently viewed account
ALTER TABLE meta_connections 
ADD COLUMN IF NOT EXISTS selected_account_id TEXT;

-- Create a function to count dashboard accounts
CREATE OR REPLACE FUNCTION count_dashboard_accounts(accounts JSONB)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM jsonb_array_elements(accounts) AS account 
    WHERE (account->>'in_dashboard')::boolean = true
  );
END;
$$ LANGUAGE plpgsql;

-- Add index for faster queries on ad_data by ad_account_id
CREATE INDEX IF NOT EXISTS idx_ad_data_account_id ON ad_data(ad_account_id);
