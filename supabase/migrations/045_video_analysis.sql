-- Video analysis results
CREATE TABLE IF NOT EXISTS video_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ad_account_id TEXT NOT NULL,
  media_hash TEXT NOT NULL,

  -- Transcript (from Gemini)
  transcript TEXT,
  transcript_segments JSONB,  -- [{start, end, text}] if available

  -- AI Analysis
  analysis JSONB,  -- Full structured analysis

  -- Script suggestions
  script_suggestions JSONB,  -- Array of suggested scripts

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  error_message TEXT,

  -- Timestamps
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, ad_account_id, media_hash)
);

-- RLS policies
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own video analysis" ON video_analysis;
CREATE POLICY "Users can manage own video analysis"
  ON video_analysis FOR ALL
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access video analysis" ON video_analysis;
CREATE POLICY "Service role full access video analysis"
  ON video_analysis FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_analysis_lookup
  ON video_analysis(user_id, ad_account_id, media_hash);
CREATE INDEX IF NOT EXISTS idx_video_analysis_status
  ON video_analysis(user_id, status);
