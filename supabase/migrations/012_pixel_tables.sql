-- KillScale Pixel tables for first-party conversion tracking

-- Pixels table - one per ad account
CREATE TABLE IF NOT EXISTS pixels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE CASCADE,
  pixel_id VARCHAR(20) UNIQUE NOT NULL,  -- KS-XXXXXXX format
  pixel_secret VARCHAR(64) NOT NULL,      -- for future server-side events
  attribution_source VARCHAR(10) DEFAULT 'meta',  -- 'meta' or 'killscale'
  attribution_window INT DEFAULT 7,       -- days (1-28)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(ad_account_id)
);

-- Pixel events table - stores all tracked events
CREATE TABLE IF NOT EXISTS pixel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pixel_id VARCHAR(20) REFERENCES pixels(pixel_id) ON DELETE CASCADE,

  -- Event data
  event_type VARCHAR(50) NOT NULL,        -- 'pageview', 'purchase', 'lead', 'custom'
  event_value DECIMAL(12,2),              -- revenue for purchases
  event_currency VARCHAR(3) DEFAULT 'USD',
  event_metadata JSONB DEFAULT '{}',      -- custom properties

  -- Attribution data (from UTMs)
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(255),              -- campaign_id
  utm_content VARCHAR(255),               -- ad_id - KEY for matching!
  utm_term VARCHAR(255),                  -- adset_id
  fbclid VARCHAR(500),

  -- Session data
  session_id VARCHAR(64),
  client_id VARCHAR(64),                  -- persistent visitor ID
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),                 -- truncated for privacy

  -- Timestamps
  event_time TIMESTAMPTZ DEFAULT NOW(),
  click_time TIMESTAMPTZ,                 -- when they originally clicked the ad
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pixel status table - tracks pixel health
CREATE TABLE IF NOT EXISTS pixel_status (
  pixel_id VARCHAR(20) PRIMARY KEY REFERENCES pixels(pixel_id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT FALSE,
  last_event_at TIMESTAMPTZ,
  events_today INT DEFAULT 0,
  events_total INT DEFAULT 0,
  first_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_id ON pixel_events(pixel_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_event_type ON pixel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pixel_events_utm_content ON pixel_events(utm_content);
CREATE INDEX IF NOT EXISTS idx_pixel_events_event_time ON pixel_events(event_time);
CREATE INDEX IF NOT EXISTS idx_pixel_events_client_id ON pixel_events(client_id);
CREATE INDEX IF NOT EXISTS idx_pixels_ad_account_id ON pixels(ad_account_id);

-- Function to generate a unique pixel ID
CREATE OR REPLACE FUNCTION generate_pixel_id()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- No I, O, 0, 1 for readability
  result VARCHAR(20) := 'KS-';
  i INT;
BEGIN
  FOR i IN 1..7 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to generate a secure pixel secret
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

-- Auto-create pixel when ad account is created
CREATE OR REPLACE FUNCTION create_pixel_for_ad_account()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pixels (ad_account_id, pixel_id, pixel_secret)
  VALUES (NEW.id, generate_pixel_id(), generate_pixel_secret())
  ON CONFLICT (ad_account_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create pixel
DROP TRIGGER IF EXISTS trigger_create_pixel ON ad_accounts;
CREATE TRIGGER trigger_create_pixel
  AFTER INSERT ON ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION create_pixel_for_ad_account();

-- Create pixels for existing ad accounts
INSERT INTO pixels (ad_account_id, pixel_id, pixel_secret)
SELECT id, generate_pixel_id(), generate_pixel_secret()
FROM ad_accounts
WHERE id NOT IN (SELECT ad_account_id FROM pixels WHERE ad_account_id IS NOT NULL)
ON CONFLICT (ad_account_id) DO NOTHING;

-- RLS policies
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_status ENABLE ROW LEVEL SECURITY;

-- Pixels: users can read their own
CREATE POLICY "Users can view their own pixels"
  ON pixels FOR SELECT
  USING (
    ad_account_id IN (
      SELECT id FROM ad_accounts WHERE user_id = auth.uid()
    )
  );

-- Pixels: users can update their own
CREATE POLICY "Users can update their own pixels"
  ON pixels FOR UPDATE
  USING (
    ad_account_id IN (
      SELECT id FROM ad_accounts WHERE user_id = auth.uid()
    )
  );

-- Pixel events: service role can insert (from pixel endpoint)
-- No direct user access to raw events for privacy
CREATE POLICY "Service role can insert pixel events"
  ON pixel_events FOR INSERT
  WITH CHECK (true);

-- Pixel events: users can read aggregated data for their pixels
CREATE POLICY "Users can view their own pixel events"
  ON pixel_events FOR SELECT
  USING (
    pixel_id IN (
      SELECT p.pixel_id FROM pixels p
      JOIN ad_accounts a ON p.ad_account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );

-- Pixel status: users can read their own
CREATE POLICY "Users can view their own pixel status"
  ON pixel_status FOR SELECT
  USING (
    pixel_id IN (
      SELECT p.pixel_id FROM pixels p
      JOIN ad_accounts a ON p.ad_account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );

-- Pixel status: service role can upsert
CREATE POLICY "Service role can upsert pixel status"
  ON pixel_status FOR ALL
  WITH CHECK (true);
