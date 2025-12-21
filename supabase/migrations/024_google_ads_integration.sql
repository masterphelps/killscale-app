-- ============================================================================
-- GOOGLE ADS INTEGRATION
-- Adds tables for Google Ads connections and performance data
-- ============================================================================

-- Google Connections (parallel to meta_connections)
CREATE TABLE IF NOT EXISTS google_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  google_user_id TEXT NOT NULL,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,  -- Required (Google tokens expire in 1 hour)
  token_expires_at TIMESTAMPTZ NOT NULL,
  customer_ids JSONB DEFAULT '[]',  -- [{id, name, currency, manager_customer_id?}]
  selected_customer_id TEXT,
  login_customer_id TEXT,  -- MCC (Manager Account) ID if applicable
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
);

-- Google Ad Data (Google terminology: campaign/ad_group/ad)
CREATE TABLE IF NOT EXISTS google_ad_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT DEFAULT 'google_api',
  customer_id TEXT NOT NULL,  -- Format: xxx-xxx-xxxx (stored with hyphens)
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,

  -- Campaign level
  campaign_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_status TEXT,  -- ENABLED, PAUSED, REMOVED (normalized to ACTIVE/PAUSED/DELETED)
  campaign_type TEXT,    -- SEARCH, DISPLAY, VIDEO, SHOPPING, PERFORMANCE_MAX
  campaign_budget DECIMAL(10,2),

  -- Ad Group level (equivalent to Meta's Ad Set)
  ad_group_name TEXT NOT NULL,
  ad_group_id TEXT NOT NULL,
  ad_group_status TEXT,
  ad_group_type TEXT,

  -- Ad level
  ad_name TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_status TEXT,
  ad_type TEXT,  -- RESPONSIVE_SEARCH_AD, RESPONSIVE_DISPLAY_AD, VIDEO_AD, etc.

  -- Metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  conversions DECIMAL(10,2) DEFAULT 0,
  conversions_value DECIMAL(10,2) DEFAULT 0,

  -- Generic results mapping (for unified verdict logic)
  results DECIMAL(10,2) DEFAULT 0,
  result_value DECIMAL(10,2),
  result_type TEXT,

  -- Calculated metrics
  roas DECIMAL(10,2) DEFAULT 0,
  cpc DECIMAL(10,2) DEFAULT 0,
  cpm DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(5,4) DEFAULT 0,

  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, customer_id, date_start, campaign_id, ad_group_id, ad_id)
);

-- Add platform column to alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'meta' CHECK (platform IN ('meta', 'google'));
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

-- Indexes for google_connections
CREATE INDEX IF NOT EXISTS idx_google_connections_user_id ON google_connections(user_id);

-- Indexes for google_ad_data
CREATE INDEX IF NOT EXISTS idx_google_ad_data_user_id ON google_ad_data(user_id);
CREATE INDEX IF NOT EXISTS idx_google_ad_data_customer_id ON google_ad_data(customer_id);
CREATE INDEX IF NOT EXISTS idx_google_ad_data_dates ON google_ad_data(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_google_ad_data_campaign ON google_ad_data(campaign_id);
CREATE INDEX IF NOT EXISTS idx_google_ad_data_ad_group ON google_ad_data(ad_group_id);
CREATE INDEX IF NOT EXISTS idx_google_ad_data_sync ON google_ad_data(user_id, customer_id, synced_at);

-- RLS policies for google_connections
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own google connections" ON google_connections;
CREATE POLICY "Users can view own google connections"
  ON google_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own google connections" ON google_connections;
CREATE POLICY "Users can insert own google connections"
  ON google_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own google connections" ON google_connections;
CREATE POLICY "Users can update own google connections"
  ON google_connections FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own google connections" ON google_connections;
CREATE POLICY "Users can delete own google connections"
  ON google_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Service role access for API routes
DROP POLICY IF EXISTS "Service role can manage google connections" ON google_connections;
CREATE POLICY "Service role can manage google connections"
  ON google_connections FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS policies for google_ad_data
ALTER TABLE google_ad_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own google ad data" ON google_ad_data;
CREATE POLICY "Users can view own google ad data"
  ON google_ad_data FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own google ad data" ON google_ad_data;
CREATE POLICY "Users can insert own google ad data"
  ON google_ad_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own google ad data" ON google_ad_data;
CREATE POLICY "Users can update own google ad data"
  ON google_ad_data FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own google ad data" ON google_ad_data;
CREATE POLICY "Users can delete own google ad data"
  ON google_ad_data FOR DELETE
  USING (auth.uid() = user_id);

-- Service role access for sync API
DROP POLICY IF EXISTS "Service role can manage google ad data" ON google_ad_data;
CREATE POLICY "Service role can manage google ad data"
  ON google_ad_data FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at on google_connections
DROP TRIGGER IF EXISTS update_google_connections_updated_at ON google_connections;
CREATE TRIGGER update_google_connections_updated_at
  BEFORE UPDATE ON google_connections
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
