-- ============================================================================
-- ALERT SETTINGS
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Alert settings table - stores user preferences for each alert type
CREATE TABLE IF NOT EXISTS public.alert_settings (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Alert type
  alert_type text NOT NULL CHECK (alert_type IN ('high_spend_no_conv', 'roas_below_min', 'roas_above_scale', 'status_changed', 'ad_fatigue')),
  
  -- Settings
  enabled boolean DEFAULT true,
  threshold numeric,  -- e.g., $50 for spend, or percentage
  email_enabled boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Each user can only have one setting per alert type
  UNIQUE(user_id, alert_type)
);

-- Indexes
CREATE INDEX idx_alert_settings_user_id ON public.alert_settings(user_id);

-- RLS policies
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alert settings" ON public.alert_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alert settings" ON public.alert_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alert settings" ON public.alert_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alert settings" ON public.alert_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Service role access
CREATE POLICY "Service role can manage alert settings" ON public.alert_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER update_alert_settings_updated_at
  BEFORE UPDATE ON public.alert_settings
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
