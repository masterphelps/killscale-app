-- Add configurable event types for Meta CAPI forwarding
ALTER TABLE workspace_pixels
ADD COLUMN IF NOT EXISTS capi_event_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN workspace_pixels.capi_event_types IS
  'Event types to forward to Meta CAPI. e.g. {complete_registration,purchase}';
