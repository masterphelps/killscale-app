-- Add unique constraint on user_id for session tracking
-- This allows one "current" session per user that gets updated

-- First, remove duplicate sessions keeping only the most recent per user
DELETE FROM user_sessions a
USING user_sessions b
WHERE a.user_id = b.user_id
  AND a.last_activity_at < b.last_activity_at;

-- Add unique constraint
ALTER TABLE user_sessions
ADD CONSTRAINT user_sessions_user_id_unique UNIQUE (user_id);
