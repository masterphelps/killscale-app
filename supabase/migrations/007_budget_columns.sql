-- Add budget columns to ad_data table
-- Campaigns can have CBO (Campaign Budget Optimization) with daily or lifetime budget
-- Adsets can have ABO (Ad Set Budget) with daily or lifetime budget

ALTER TABLE public.ad_data 
ADD COLUMN IF NOT EXISTS campaign_daily_budget numeric,
ADD COLUMN IF NOT EXISTS campaign_lifetime_budget numeric,
ADD COLUMN IF NOT EXISTS adset_daily_budget numeric,
ADD COLUMN IF NOT EXISTS adset_lifetime_budget numeric;

-- Add index for quick budget-based queries
CREATE INDEX IF NOT EXISTS idx_ad_data_budgets ON public.ad_data(user_id, campaign_daily_budget, adset_daily_budget);

COMMENT ON COLUMN public.ad_data.campaign_daily_budget IS 'Campaign daily budget in account currency (CBO)';
COMMENT ON COLUMN public.ad_data.campaign_lifetime_budget IS 'Campaign lifetime budget in account currency (CBO)';
COMMENT ON COLUMN public.ad_data.adset_daily_budget IS 'Ad set daily budget in account currency (ABO)';
COMMENT ON COLUMN public.ad_data.adset_lifetime_budget IS 'Ad set lifetime budget in account currency (ABO)';
