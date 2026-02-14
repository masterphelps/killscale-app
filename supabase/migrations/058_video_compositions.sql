-- Video Compositions
-- Stores multi-clip timeline compositions created when users combine
-- sibling concept videos in the video editor.

CREATE TABLE IF NOT EXISTS video_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  canvas_id UUID NOT NULL REFERENCES video_concept_canvases(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,

  -- The source jobs that make up this composition
  source_job_ids UUID[] NOT NULL,

  -- Combined overlay config (includes appendedClips)
  overlay_config JSONB NOT NULL,

  -- Metadata
  title TEXT,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_compositions_canvas
  ON video_compositions(canvas_id);

CREATE INDEX IF NOT EXISTS idx_video_compositions_user_account
  ON video_compositions(user_id, ad_account_id);

ALTER TABLE video_compositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own compositions" ON video_compositions;
CREATE POLICY "Users can read own compositions" ON video_compositions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own compositions" ON video_compositions;
CREATE POLICY "Users can delete own compositions" ON video_compositions
  FOR DELETE USING (auth.uid() = user_id);

-- Add composition_id to video_overlays so versions can belong to either
-- a single concept job OR a composition
ALTER TABLE video_overlays
  ADD COLUMN IF NOT EXISTS composition_id UUID REFERENCES video_compositions(id) ON DELETE CASCADE;

-- Make video_job_id nullable (compositions don't have a single job)
ALTER TABLE video_overlays
  ALTER COLUMN video_job_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_overlays_composition
  ON video_overlays(composition_id);
