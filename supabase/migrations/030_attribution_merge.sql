-- Attribution Merge System
-- Adds columns to pixel_events for Meta cookie matching
-- Creates merged_attribution table for source breakdown

-- 1. Add Meta cookie columns to pixel_events
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS fbc TEXT;

-- Indexes for matching
CREATE INDEX IF NOT EXISTS idx_pixel_events_fbp ON pixel_events(fbp);
CREATE INDEX IF NOT EXISTS idx_pixel_events_fbc ON pixel_events(fbc);

-- 2. Create merged_attribution table for storing deduplication results
CREATE TABLE IF NOT EXISTS merged_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  pixel_id TEXT NOT NULL,
  date DATE NOT NULL,

  -- Source breakdown counts
  verified_conversions INT DEFAULT 0,
  verified_revenue NUMERIC(12,2) DEFAULT 0,
  ks_only_conversions INT DEFAULT 0,
  ks_only_revenue NUMERIC(12,2) DEFAULT 0,
  meta_only_conversions INT DEFAULT 0,
  meta_only_revenue NUMERIC(12,2) DEFAULT 0,
  manual_conversions INT DEFAULT 0,
  manual_revenue NUMERIC(12,2) DEFAULT 0,

  -- Totals
  total_conversions INT DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,

  computed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, pixel_id, date)
);

-- Indexes for merged_attribution
CREATE INDEX IF NOT EXISTS idx_merged_attribution_workspace ON merged_attribution(workspace_id);
CREATE INDEX IF NOT EXISTS idx_merged_attribution_date ON merged_attribution(date);
CREATE INDEX IF NOT EXISTS idx_merged_attribution_pixel ON merged_attribution(pixel_id);

-- RLS for merged_attribution
ALTER TABLE merged_attribution ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own workspace data
DROP POLICY IF EXISTS "Users can view own merged attribution" ON merged_attribution;
CREATE POLICY "Users can view own merged attribution" ON merged_attribution
  FOR SELECT USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE user_id = auth.uid()
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can manage all (for API routes)
DROP POLICY IF EXISTS "Service role full access merged attribution" ON merged_attribution;
CREATE POLICY "Service role full access merged attribution" ON merged_attribution
  FOR ALL USING (auth.role() = 'service_role');
