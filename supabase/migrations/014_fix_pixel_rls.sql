-- Fix dangerous RLS policy on pixel_status
-- Also adds missing indexes and DELETE policy for pixels

-- Drop the dangerous "anyone can upsert" policy
DROP POLICY IF EXISTS "Anyone can upsert pixel status" ON pixel_status;

-- Add proper policies for pixel_status
-- Users can only view status for their own pixels
CREATE POLICY "Users can view their own pixel status"
  ON pixel_status FOR SELECT
  USING (
    pixel_id IN (SELECT p.pixel_id FROM pixels p WHERE p.user_id = auth.uid())
  );

-- Service role handles upserts from event ingestion (killscale-pixel service)
-- The service uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- No additional policy needed - service role already has full access

-- Add DELETE policy for pixels table (users can delete their own)
CREATE POLICY "Users can delete their own pixels"
  ON pixels FOR DELETE
  USING (user_id = auth.uid());

-- Add missing indexes for query performance
CREATE INDEX IF NOT EXISTS idx_pixel_events_utm_campaign ON pixel_events(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_pixel_events_utm_term ON pixel_events(utm_term);
CREATE INDEX IF NOT EXISTS idx_pixel_events_composite ON pixel_events(pixel_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_status_last_event ON pixel_status(last_event_at DESC);
