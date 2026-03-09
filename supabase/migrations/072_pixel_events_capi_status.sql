-- Add event_id for Meta deduplication and capi_status for delivery tracking

ALTER TABLE pixel_events
ADD COLUMN IF NOT EXISTS event_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS capi_status VARCHAR(10);

-- Index for querying CAPI failures (reconciliation, debugging)
CREATE INDEX IF NOT EXISTS idx_pixel_events_capi_status
ON pixel_events(capi_status) WHERE capi_status = 'failed';

COMMENT ON COLUMN pixel_events.event_id IS 'Client-generated UUID. Shared with Meta browser pixel for deduplication.';
COMMENT ON COLUMN pixel_events.capi_status IS 'CAPI delivery status: sent, failed, skipped (no token configured).';
