-- Video Concept Canvases
-- Persists the 4 creative concepts generated in Video Studio (step 2)
-- so users can return to them via AI Tasks and generate videos from any concept

CREATE TABLE IF NOT EXISTS video_concept_canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ad_account_id TEXT NOT NULL,
  product_url TEXT,
  product_knowledge JSONB NOT NULL,
  concepts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_canvases_user_account
  ON video_concept_canvases(user_id, ad_account_id);

ALTER TABLE video_concept_canvases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own canvases" ON video_concept_canvases;
CREATE POLICY "Users can read own canvases" ON video_concept_canvases
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own canvases" ON video_concept_canvases;
CREATE POLICY "Users can delete own canvases" ON video_concept_canvases
  FOR DELETE USING (auth.uid() = user_id);

-- Add canvas_id and product_name to video_generation_jobs
ALTER TABLE video_generation_jobs
  ADD COLUMN IF NOT EXISTS canvas_id UUID REFERENCES video_concept_canvases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_video_jobs_canvas ON video_generation_jobs(canvas_id);
