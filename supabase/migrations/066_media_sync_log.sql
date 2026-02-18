-- Track when media sync last ran per user+account for 24h cooldown
CREATE TABLE IF NOT EXISTS media_sync_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  new_images INTEGER DEFAULT 0,
  new_videos INTEGER DEFAULT 0,
  UNIQUE(user_id, ad_account_id)
);

ALTER TABLE media_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sync log" ON media_sync_log;
CREATE POLICY "Users can view own sync log" ON media_sync_log
  FOR SELECT USING (auth.uid() = user_id);
