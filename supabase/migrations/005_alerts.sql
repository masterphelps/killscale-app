-- ============================================================================
-- ALERTS SYSTEM
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Alerts table
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Alert classification
  type text NOT NULL CHECK (type IN ('high_spend_no_conv', 'roas_below_min', 'roas_above_scale', 'status_changed', 'ad_fatigue', 'budget_pacing')),
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  
  -- Alert content
  title text NOT NULL,
  message text NOT NULL,
  
  -- Related entity
  entity_type text CHECK (entity_type IN ('campaign', 'adset', 'ad')),
  entity_id text,
  entity_name text,
  
  -- Additional context (spend, ROAS, etc.)
  data jsonb DEFAULT '{}',
  
  -- State
  is_read boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  action_taken text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for fast queries
CREATE INDEX idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX idx_alerts_is_read ON public.alerts(is_read);
CREATE INDEX idx_alerts_priority ON public.alerts(priority);

-- RLS policies
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts" ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts" ON public.alerts
  FOR DELETE USING (auth.uid() = user_id);

-- Allow service role to insert alerts (for API routes)
CREATE POLICY "Service role can manage alerts" ON public.alerts
  FOR ALL USING (true) WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE TRIGGER update_alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
