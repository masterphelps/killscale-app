-- AI Generation Usage Tracking
-- Tracks per-user AI image generation usage for plan limits
-- Pro: 50/month, Trial: 10 total

CREATE TABLE IF NOT EXISTS ai_generation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ad_account_id TEXT,
  generation_type TEXT NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_usage_user_month
  ON ai_generation_usage(user_id, created_at);

-- RLS: users can read own usage, service role inserts
ALTER TABLE ai_generation_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage" ON ai_generation_usage;
CREATE POLICY "Users can read own usage" ON ai_generation_usage
  FOR SELECT USING (auth.uid() = user_id);
