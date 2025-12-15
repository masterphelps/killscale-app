-- Walk-In Attribution
-- Allows manual logging of offline conversions (walk-ins, phone calls, etc.)

-- Add source column to track where events came from
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pixel';
-- Values: 'pixel' (auto-tracked), 'manual' (single ad attribution), 'manual_split' (split across ads)

-- Add notes column for manual event descriptions
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_pixel_events_source ON pixel_events(source);

-- Workspace walk-in settings
CREATE TABLE IF NOT EXISTS workspace_walkin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  default_value DECIMAL(10,2) DEFAULT 100.00,
  default_event_type TEXT DEFAULT 'purchase',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE workspace_walkin_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies - access through workspace ownership
CREATE POLICY "Users can view own workspace walkin settings"
  ON workspace_walkin_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_walkin_settings.workspace_id
      AND workspaces.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workspace walkin settings"
  ON workspace_walkin_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_walkin_settings.workspace_id
      AND workspaces.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workspace walkin settings"
  ON workspace_walkin_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_walkin_settings.workspace_id
      AND workspaces.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workspace walkin settings"
  ON workspace_walkin_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE workspaces.id = workspace_walkin_settings.workspace_id
      AND workspaces.user_id = auth.uid()
    )
  );
