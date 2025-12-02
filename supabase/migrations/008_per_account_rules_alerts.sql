-- ============================================================================
-- PER-ACCOUNT RULES AND ALERTS
-- Adds ad_account_id to rules, alerts, and alert_settings tables
-- ============================================================================

-- Add ad_account_id to rules table
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id to alerts table
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Add ad_account_id to alert_settings table
ALTER TABLE public.alert_settings ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_rules_ad_account_id ON public.rules(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_ad_account_id ON public.alerts(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_alert_settings_ad_account_id ON public.alert_settings(ad_account_id);

-- Update unique constraint on rules to be per user+account
-- First drop existing constraint if it exists
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS rules_user_id_key;

-- Add new unique constraint for user_id + ad_account_id combination
-- This allows one set of rules per ad account per user
ALTER TABLE public.rules ADD CONSTRAINT rules_user_account_unique UNIQUE (user_id, ad_account_id);

-- Update unique constraint on alert_settings
ALTER TABLE public.alert_settings DROP CONSTRAINT IF EXISTS alert_settings_user_id_alert_type_key;

-- Add new unique constraint for user_id + ad_account_id + alert_type
ALTER TABLE public.alert_settings ADD CONSTRAINT alert_settings_user_account_type_unique
  UNIQUE (user_id, ad_account_id, alert_type);
