-- Oracle Chat Sessions for Oracle v2 agentic system
-- Stores full conversation history with tool results and generated assets

CREATE TABLE IF NOT EXISTS oracle_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  title TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  generated_assets JSONB DEFAULT '[]'::jsonb,
  highest_tier TEXT NOT NULL DEFAULT 'sonnet',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_user_id
  ON oracle_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_user_account
  ON oracle_chat_sessions(user_id, ad_account_id);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_status
  ON oracle_chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_created
  ON oracle_chat_sessions(created_at DESC);

-- RLS
ALTER TABLE oracle_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can view own oracle sessions"
  ON oracle_chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can create own oracle sessions"
  ON oracle_chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can update own oracle sessions"
  ON oracle_chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can delete own oracle sessions"
  ON oracle_chat_sessions FOR DELETE
  USING (auth.uid() = user_id);
