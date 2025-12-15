-- Sales Kiosk for Pro users
-- Simplified self-service view with PIN protection

-- Add kiosk fields to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN DEFAULT false;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS kiosk_pin TEXT;  -- Hashed PIN
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS kiosk_slug TEXT UNIQUE;

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_kiosk_slug ON workspaces(kiosk_slug) WHERE kiosk_slug IS NOT NULL;

-- Kiosk sessions table for tracking authenticated kiosk sessions
CREATE TABLE IF NOT EXISTS kiosk_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_kiosk_sessions_token ON kiosk_sessions(session_token);

-- Cleanup expired sessions (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_kiosk_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM kiosk_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
