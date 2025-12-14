-- Update pixel_events to work with workspace_pixels
-- Remove the old foreign key constraint to allow pixels from either source
-- The pixel_id can now reference workspace_pixels.pixel_id

-- Drop the old foreign key constraint on pixel_events
ALTER TABLE pixel_events DROP CONSTRAINT IF EXISTS pixel_events_pixel_id_fkey;

-- Add a policy to allow inserting events for workspace pixels
DROP POLICY IF EXISTS "Users can view their own pixel events" ON pixel_events;
CREATE POLICY "Users can view their own pixel events"
  ON pixel_events FOR SELECT
  USING (
    pixel_id IN (
      SELECT p.pixel_id FROM pixels p WHERE p.user_id = auth.uid()
      UNION
      SELECT wp.pixel_id FROM workspace_pixels wp
      JOIN workspaces w ON wp.workspace_id = w.id
      WHERE w.user_id = auth.uid()
    )
  );

-- Function to auto-create workspace pixel when workspace is created (Pro+ only)
-- This won't run automatically - it's triggered when user visits pixel page
CREATE OR REPLACE FUNCTION create_workspace_pixel(p_workspace_id UUID)
RETURNS workspace_pixels AS $$
DECLARE
  new_pixel workspace_pixels;
BEGIN
  INSERT INTO workspace_pixels (workspace_id, pixel_id, pixel_secret)
  VALUES (p_workspace_id, generate_pixel_id(), generate_pixel_secret())
  ON CONFLICT (workspace_id) DO NOTHING
  RETURNING * INTO new_pixel;

  IF new_pixel IS NULL THEN
    SELECT * INTO new_pixel FROM workspace_pixels WHERE workspace_id = p_workspace_id;
  END IF;

  RETURN new_pixel;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
