-- ============================================================================
-- GOOGLE BUDGET RESOURCE NAME
-- Adds column to store the full budget resource name for mutations
-- ============================================================================

-- Google Ads requires the full resource name to mutate budgets
-- Format: customers/{customerId}/campaignBudgets/{budgetId}
ALTER TABLE google_ad_data
ADD COLUMN IF NOT EXISTS campaign_budget_resource_name TEXT;

-- Index for potential lookups by campaign
CREATE INDEX IF NOT EXISTS idx_google_ad_data_budget_resource
ON google_ad_data(campaign_id, campaign_budget_resource_name);
