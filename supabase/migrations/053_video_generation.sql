-- Video Generation Jobs
-- Tracks Sora 2 Pro video generation with async status polling
-- Also adds source_type to media_library for distinguishing AI-generated media

-- Video generation jobs table
CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ad_account_id TEXT NOT NULL,
  session_id UUID REFERENCES ad_studio_sessions(id) ON DELETE SET NULL,

  -- Input
  input_image_url TEXT,
  prompt TEXT NOT NULL,
  video_style TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 8,
  overlay_config JSONB,

  -- Sora job tracking
  sora_job_id TEXT,
  status TEXT DEFAULT 'queued',
  progress_pct INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Output
  raw_video_url TEXT,
  final_video_url TEXT,
  thumbnail_url TEXT,

  -- Metadata
  ad_index INTEGER,
  credit_cost INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user ON video_generation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_session ON video_generation_jobs(session_id);

-- RLS: users can read own jobs
ALTER TABLE video_generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own video jobs" ON video_generation_jobs;
CREATE POLICY "Users can read own video jobs" ON video_generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Video overlays table (non-destructive overlay editing)
CREATE TABLE IF NOT EXISTS video_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id UUID NOT NULL REFERENCES video_generation_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  version INTEGER DEFAULT 1,
  overlay_config JSONB NOT NULL,
  rendered_video_url TEXT,
  render_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_overlays_job ON video_overlays(video_job_id);

ALTER TABLE video_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own overlays" ON video_overlays;
CREATE POLICY "Users can read own overlays" ON video_overlays
  FOR SELECT USING (auth.uid() = user_id);

-- Add source_type to media_library to distinguish AI-generated media
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'meta';
