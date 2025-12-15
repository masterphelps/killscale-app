-- Client Portal for Agency users
-- Allows inviting sub-users (clients) with restricted access to workspaces

-- Workspace members table
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',  -- 'owner', 'editor', 'viewer'
  can_log_walkins BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(workspace_id, user_id)
);

-- Workspace invites table
CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  can_log_walkins BOOLEAN DEFAULT true,
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);

-- Enable RLS
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace access
CREATE OR REPLACE FUNCTION user_has_workspace_access(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspaces WHERE id = ws_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND accepted_at IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is workspace owner
CREATE OR REPLACE FUNCTION user_is_workspace_owner(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspaces WHERE id = ws_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Workspace members policies
-- Users can view members of workspaces they own or are members of
CREATE POLICY "Users can view workspace members"
  ON workspace_members FOR SELECT
  USING (user_has_workspace_access(workspace_id));

-- Only workspace owners can insert members
CREATE POLICY "Owners can insert workspace members"
  ON workspace_members FOR INSERT
  WITH CHECK (user_is_workspace_owner(workspace_id));

-- Only workspace owners can update members
CREATE POLICY "Owners can update workspace members"
  ON workspace_members FOR UPDATE
  USING (user_is_workspace_owner(workspace_id));

-- Only workspace owners can delete members
CREATE POLICY "Owners can delete workspace members"
  ON workspace_members FOR DELETE
  USING (user_is_workspace_owner(workspace_id));

-- Workspace invites policies
-- Users can view invites for workspaces they own
CREATE POLICY "Owners can view workspace invites"
  ON workspace_invites FOR SELECT
  USING (user_is_workspace_owner(workspace_id));

-- Only workspace owners can create invites
CREATE POLICY "Owners can insert workspace invites"
  ON workspace_invites FOR INSERT
  WITH CHECK (user_is_workspace_owner(workspace_id));

-- Only workspace owners can update invites
CREATE POLICY "Owners can update workspace invites"
  ON workspace_invites FOR UPDATE
  USING (user_is_workspace_owner(workspace_id));

-- Only workspace owners can delete invites
CREATE POLICY "Owners can delete workspace invites"
  ON workspace_invites FOR DELETE
  USING (user_is_workspace_owner(workspace_id));

-- Add client portal visibility settings to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS client_show_spend BOOLEAN DEFAULT true;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS client_show_roas BOOLEAN DEFAULT true;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS client_show_revenue BOOLEAN DEFAULT true;
