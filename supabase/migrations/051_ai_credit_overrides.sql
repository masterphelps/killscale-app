-- AI Credit Overrides
-- Allows admins to set custom generation limits per user
-- When a row exists for a user, its credit_limit overrides the plan default

CREATE TABLE IF NOT EXISTS ai_credit_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  credit_limit INTEGER NOT NULL DEFAULT 50,
  reason TEXT,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_overrides_user
  ON ai_credit_overrides(user_id);

-- RLS: service role only (admin operations)
ALTER TABLE ai_credit_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own override" ON ai_credit_overrides;
CREATE POLICY "Users can read own override" ON ai_credit_overrides
  FOR SELECT USING (auth.uid() = user_id);
