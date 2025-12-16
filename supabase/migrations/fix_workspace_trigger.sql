-- Fix for "Database error saving new user" on signup
-- This recreates the trigger that auto-creates a default workspace when a new profile is created

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_default_workspace ON profiles;

-- Recreate the function with SECURITY DEFINER (allows bypassing RLS)
CREATE OR REPLACE FUNCTION create_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workspaces (user_id, name, is_default)
  VALUES (NEW.id, 'My Business', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER trigger_create_default_workspace
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_workspace();
