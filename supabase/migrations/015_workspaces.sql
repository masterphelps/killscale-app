-- Workspaces: Virtual containers grouping accounts from different platforms
-- Each user gets a hidden "default" workspace (Free/Starter tiers)
-- Pro+ can create additional named workspaces

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,  -- Hidden default workspace for Free/Starter
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace accounts: Links ad accounts (from any platform) to workspaces
CREATE TABLE workspace_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  ad_account_id TEXT NOT NULL,  -- e.g., 'act_123456789' for Meta
  ad_account_name TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, platform, ad_account_id)
);

-- Workspace rules: ROAS/CPR thresholds per workspace
CREATE TABLE workspace_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  scale_roas NUMERIC(5,2) DEFAULT 3.0,
  min_roas NUMERIC(5,2) DEFAULT 1.5,
  learning_spend NUMERIC(10,2) DEFAULT 100,
  scale_percentage NUMERIC(5,2) DEFAULT 20,
  target_cpr NUMERIC(10,2),  -- For non-value results (leads, etc.)
  max_cpr NUMERIC(10,2),
  event_values JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace pixels: One pixel per workspace (each workspace = different business/website)
-- This replaces the old per-account pixel approach
CREATE TABLE workspace_pixels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pixel_id VARCHAR(20) UNIQUE NOT NULL,  -- KS-XXXXXXX format
  pixel_secret VARCHAR(64) NOT NULL,
  attribution_source VARCHAR(20) DEFAULT 'native',  -- 'native' or 'pixel'
  attribution_window INT DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add selected_workspace_id to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selected_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX idx_workspaces_is_default ON workspaces(user_id, is_default);
CREATE INDEX idx_workspace_accounts_workspace ON workspace_accounts(workspace_id);
CREATE INDEX idx_workspace_accounts_platform ON workspace_accounts(platform, ad_account_id);
CREATE INDEX idx_workspace_pixels_pixel_id ON workspace_pixels(pixel_id);

-- RLS policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_pixels ENABLE ROW LEVEL SECURITY;

-- Workspaces: users can CRUD their own
CREATE POLICY "Users can view own workspaces"
  ON workspaces FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE
  USING (user_id = auth.uid());

-- Workspace accounts: users can CRUD for their workspaces
CREATE POLICY "Users can view own workspace accounts"
  ON workspace_accounts FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own workspace accounts"
  ON workspace_accounts FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own workspace accounts"
  ON workspace_accounts FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own workspace accounts"
  ON workspace_accounts FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Workspace rules: users can CRUD for their workspaces
CREATE POLICY "Users can view own workspace rules"
  ON workspace_rules FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own workspace rules"
  ON workspace_rules FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own workspace rules"
  ON workspace_rules FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own workspace rules"
  ON workspace_rules FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Workspace pixels: users can view/update for their workspaces
CREATE POLICY "Users can view own workspace pixels"
  ON workspace_pixels FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own workspace pixels"
  ON workspace_pixels FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own workspace pixels"
  ON workspace_pixels FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Function to create default workspace for new users
CREATE OR REPLACE FUNCTION create_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (user_id, name, is_default)
  VALUES (NEW.id, 'My Business', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create default workspace on profile creation
DROP TRIGGER IF EXISTS trigger_create_default_workspace ON profiles;
CREATE TRIGGER trigger_create_default_workspace
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_workspace();

-- Create default workspaces for existing users who don't have one
INSERT INTO workspaces (user_id, name, is_default)
SELECT p.id, 'My Business', true
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces w WHERE w.user_id = p.id AND w.is_default = true
);
