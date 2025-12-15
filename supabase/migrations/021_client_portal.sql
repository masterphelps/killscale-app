-- Client Portal: PIN-protected dashboard view for agency clients
-- Similar to kiosk but shows full dashboard + trends + manual events

-- Add portal fields to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS portal_token VARCHAR(32) UNIQUE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS portal_pin VARCHAR(64);  -- SHA256 hash
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT FALSE;

-- Index for fast portal token lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_portal_token ON workspaces(portal_token) WHERE portal_token IS NOT NULL;

-- Portal sessions table (similar to kiosk_sessions)
CREATE TABLE IF NOT EXISTS portal_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  session_token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_workspace ON portal_sessions(workspace_id);

-- RLS for portal_sessions (service role only)
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage portal sessions" ON portal_sessions;
CREATE POLICY "Service role can manage portal sessions"
  ON portal_sessions FOR ALL
  USING (true)
  WITH CHECK (true);
