-- Add multi-touch attribution model support to workspace_pixels

ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS attribution_model VARCHAR(20) DEFAULT 'last_touch';

ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS time_decay_half_life INT DEFAULT 7;

-- Composite index for multi-touch attribution queries
-- Need to efficiently fetch all touchpoints for a given client within a pixel
CREATE INDEX IF NOT EXISTS idx_pixel_events_client_journey
ON pixel_events(pixel_id, client_id, event_time);

-- Add comment for documentation
COMMENT ON COLUMN workspace_pixels.attribution_model IS 'Attribution model: first_touch, last_touch, linear, time_decay, position_based';
COMMENT ON COLUMN workspace_pixels.time_decay_half_life IS 'Half-life in days for time_decay model (1-28)';
