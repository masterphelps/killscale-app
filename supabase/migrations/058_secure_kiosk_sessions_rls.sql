-- Enable RLS on kiosk_sessions (was missing since migration 019)
-- All access is via service_role in API routes — no public policies needed
ALTER TABLE kiosk_sessions ENABLE ROW LEVEL SECURITY;

-- Revoke direct access from anon and authenticated roles
REVOKE ALL ON kiosk_sessions FROM anon, authenticated;
