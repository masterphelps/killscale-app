-- Image Editor Sessions
-- Stores persistent editing sessions with version history
CREATE TABLE IF NOT EXISTS image_editor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('generated', 'library', 'upload')),
  source_id TEXT,
  original_image_url TEXT NOT NULL,
  versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_text JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_image_editor_sessions_user ON image_editor_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_image_editor_sessions_workspace ON image_editor_sessions(workspace_id);

-- RLS
ALTER TABLE image_editor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own image editor sessions" ON image_editor_sessions;
CREATE POLICY "Users can manage own image editor sessions" ON image_editor_sessions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to image editor sessions" ON image_editor_sessions;
CREATE POLICY "Service role full access to image editor sessions" ON image_editor_sessions
  FOR ALL USING (auth.role() = 'service_role');
