-- Saved copy table for AI-generated ad copy saved from Ad Studio
CREATE TABLE IF NOT EXISTS saved_copy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  headline TEXT,
  primary_text TEXT,
  description TEXT,
  angle TEXT,
  source TEXT DEFAULT 'ai_studio',
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE saved_copy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own saved copy" ON saved_copy;
CREATE POLICY "Users can read own saved copy" ON saved_copy FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own saved copy" ON saved_copy;
CREATE POLICY "Users can insert own saved copy" ON saved_copy FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved copy" ON saved_copy;
CREATE POLICY "Users can delete own saved copy" ON saved_copy FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_copy_user_account ON saved_copy(user_id, ad_account_id);
