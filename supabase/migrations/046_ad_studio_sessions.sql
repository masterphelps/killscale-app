-- Ad Studio Sessions: Persist Ad Studio conversations for later reference
-- Allows users to revisit generated copy and generate images later

CREATE TABLE IF NOT EXISTS ad_studio_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,

  -- Step 1: Product info
  product_url TEXT,
  product_info JSONB,  -- {name, description, price, features, imageUrl, brand, category}

  -- Step 2: Competitor info
  competitor_company JSONB,  -- {name, pageId, logoUrl}
  competitor_ad JSONB,  -- Full ad object used as inspiration

  -- Step 3: Generated content
  generated_ads JSONB,  -- Array of {headline, primaryText, description, angle, whyItWorks}
  image_style TEXT,  -- lifestyle, product, minimal, bold

  -- Generated images (populated when user generates images)
  -- Array of {adIndex, versionIndex, storageUrl, mediaHash}
  generated_images JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  status TEXT DEFAULT 'complete',  -- complete (has generated ads)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_ad_studio_sessions_user
  ON ad_studio_sessions(user_id, ad_account_id, created_at DESC);

-- RLS policies
ALTER TABLE ad_studio_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON ad_studio_sessions;
CREATE POLICY "Users can view own sessions" ON ad_studio_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON ad_studio_sessions;
CREATE POLICY "Users can insert own sessions" ON ad_studio_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON ad_studio_sessions;
CREATE POLICY "Users can update own sessions" ON ad_studio_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON ad_studio_sessions;
CREATE POLICY "Users can delete own sessions" ON ad_studio_sessions
  FOR DELETE USING (auth.uid() = user_id);
