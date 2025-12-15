-- Campaign creations table
-- Tracks campaigns created through KillScale's Launch wizard

CREATE TABLE campaign_creations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  budget_type TEXT NOT NULL DEFAULT 'cbo',
  daily_budget DECIMAL(10,2),
  status TEXT DEFAULT 'PAUSED',
  activated_at TIMESTAMPTZ,
  ad_ids TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ad_account_id, campaign_id)
);

-- Enable RLS
ALTER TABLE campaign_creations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own campaign_creations"
  ON campaign_creations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaign_creations"
  ON campaign_creations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaign_creations"
  ON campaign_creations FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaign_creations"
  ON campaign_creations FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_campaign_creations_lookup ON campaign_creations(user_id, ad_account_id);
