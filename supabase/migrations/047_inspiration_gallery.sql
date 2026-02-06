-- Inspiration Gallery table for curated ad examples
-- Users can browse by format and use examples as inspiration for their own ads

CREATE TABLE IF NOT EXISTS inspiration_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Categorization
  ad_format TEXT NOT NULL CHECK (ad_format IN (
    'ugc', 'product_hero', 'lifestyle', 'bold', 'testimonial', 'before_after'
  )),
  industry_category TEXT,  -- 'fitness', 'skincare', 'home', 'tech', etc.

  -- Ad content (mirrors CompetitorAd structure)
  page_name TEXT NOT NULL,
  page_id TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'carousel')),
  body TEXT,
  headline TEXT,
  image_url TEXT,
  video_url TEXT,
  video_thumbnail TEXT,
  carousel_cards JSONB,

  -- Performance signals
  days_active INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- Curation metadata
  description TEXT,  -- Why this is a good example
  is_featured BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_inspiration_format ON inspiration_gallery(ad_format);
CREATE INDEX IF NOT EXISTS idx_inspiration_featured ON inspiration_gallery(is_featured, display_order);
CREATE INDEX IF NOT EXISTS idx_inspiration_industry ON inspiration_gallery(industry_category);
CREATE INDEX IF NOT EXISTS idx_inspiration_media_type ON inspiration_gallery(media_type);

-- Enable RLS
ALTER TABLE inspiration_gallery ENABLE ROW LEVEL SECURITY;

-- Public read access (no login required to browse)
DROP POLICY IF EXISTS "Anyone can view inspiration gallery" ON inspiration_gallery;
CREATE POLICY "Anyone can view inspiration gallery"
  ON inspiration_gallery FOR SELECT USING (true);

-- Only service role can insert/update/delete (admin operations)
-- No INSERT/UPDATE/DELETE policies = only service role has access

-- Seed data will be inserted via /api/admin/seed-inspiration endpoint
-- which fetches real ads from: Hexclad, Ridge Wallet, Liquid Death, Apple, Dyson, Casper,
-- Allbirds, Outdoor Voices, Glossier, Athletic Greens, Huel, MANSCAPED,
-- Noom, BetterHelp, HelloFresh, Curology, Smile Direct Club, Nurtec
