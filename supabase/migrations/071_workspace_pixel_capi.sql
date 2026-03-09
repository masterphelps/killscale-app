-- Add Meta CAPI credentials to workspace_pixels
-- Users configure these in killscale-app settings to enable server-side event forwarding

ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;

COMMENT ON COLUMN workspace_pixels.meta_pixel_id IS 'Meta Pixel ID (numeric). Required for CAPI forwarding.';
COMMENT ON COLUMN workspace_pixels.meta_capi_token IS 'Meta Conversions API access token. Generated in Meta Events Manager.';
