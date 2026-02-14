-- Performance indexes for AI Tasks page queries
-- These queries were causing database overload due to missing indexes

-- video_generation_jobs: list query filters by (user_id, ad_account_id) ordered by created_at
-- Existing index only covers (user_id, status) which doesn't help the list query
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_user_account
  ON video_generation_jobs(user_id, ad_account_id, created_at DESC);

-- video_analysis: list query filters by (user_id, ad_account_id) ordered by created_at
-- Existing idx_video_analysis_lookup covers (user_id, ad_account_id, media_hash) but not ordered
CREATE INDEX IF NOT EXISTS idx_video_analysis_list
  ON video_analysis(user_id, ad_account_id, created_at DESC);

-- ad_studio_sessions: list query filters by (user_id, ad_account_id) ordered by created_at
-- No existing index — causes sequential scan and statement timeouts
CREATE INDEX IF NOT EXISTS idx_ad_studio_sessions_user_account
  ON ad_studio_sessions(user_id, ad_account_id, created_at DESC);
