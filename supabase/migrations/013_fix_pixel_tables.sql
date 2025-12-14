-- Fix pixel tables - ad_accounts is JSONB in meta_connections, not a separate table
-- Change ad_account_id to TEXT storing Meta account ID directly (e.g., act_123456789)

-- Drop the old tables and recreate properly
DROP TABLE IF EXISTS pixel_status CASCADE;
DROP TABLE IF EXISTS pixel_events CASCADE;
DROP TABLE IF EXISTS pixels CASCADE;

-- Pixels table - one per Meta ad account
CREATE TABLE pixels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_account_id TEXT NOT NULL,  -- Meta account ID like 'act_123456789'
  pixel_id VARCHAR(20) UNIQUE NOT NULL,  -- KS-XXXXXXX format
  pixel_secret VARCHAR(64) NOT NULL,
  attribution_source VARCHAR(10) DEFAULT 'meta',  -- 'meta' or 'killscale'
  attribution_window INT DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, meta_account_id)
);

-- Pixel events table
CREATE TABLE pixel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pixel_id VARCHAR(20) REFERENCES pixels(pixel_id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL,
  event_value DECIMAL(12,2),
  event_currency VARCHAR(3) DEFAULT 'USD',
  event_metadata JSONB DEFAULT '{}',

  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),
  fbclid VARCHAR(500),

  session_id VARCHAR(64),
  client_id VARCHAR(64),
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),

  event_time TIMESTAMPTZ DEFAULT NOW(),
  click_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pixel status table
CREATE TABLE pixel_status (
  pixel_id VARCHAR(20) PRIMARY KEY REFERENCES pixels(pixel_id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT FALSE,
  last_event_at TIMESTAMPTZ,
  events_today INT DEFAULT 0,
  events_total INT DEFAULT 0,
  first_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pixel_events_pixel_id ON pixel_events(pixel_id);
CREATE INDEX idx_pixel_events_event_type ON pixel_events(event_type);
CREATE INDEX idx_pixel_events_utm_content ON pixel_events(utm_content);
CREATE INDEX idx_pixel_events_event_time ON pixel_events(event_time);
CREATE INDEX idx_pixels_user_id ON pixels(user_id);
CREATE INDEX idx_pixels_meta_account ON pixels(meta_account_id);

-- Functions to generate pixel ID and secret
CREATE OR REPLACE FUNCTION generate_pixel_id()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(20) := 'KS-';
  i INT;
BEGIN
  FOR i IN 1..7 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_pixel_secret()
RETURNS VARCHAR(64) AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result VARCHAR(64) := '';
  i INT;
BEGIN
  FOR i IN 1..64 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_status ENABLE ROW LEVEL SECURITY;

-- Pixels: users can view/update their own
CREATE POLICY "Users can view their own pixels"
  ON pixels FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own pixels"
  ON pixels FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own pixels"
  ON pixels FOR UPDATE
  USING (user_id = auth.uid());

-- Pixel events: insert allowed (from pixel endpoint), select for own pixels
CREATE POLICY "Anyone can insert pixel events"
  ON pixel_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own pixel events"
  ON pixel_events FOR SELECT
  USING (
    pixel_id IN (SELECT p.pixel_id FROM pixels p WHERE p.user_id = auth.uid())
  );

-- Pixel status: anyone can upsert (from pixel endpoint), users can view own
CREATE POLICY "Anyone can upsert pixel status"
  ON pixel_status FOR ALL
  USING (true)
  WITH CHECK (true);
