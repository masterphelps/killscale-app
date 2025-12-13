-- ============================================================================
-- EVENT VALUES FOR LEAD-GEN CAMPAIGNS
-- Allows users to assign dollar values to non-purchase events (leads, registrations, etc.)
-- ============================================================================

-- Add event_values JSONB column to rules table
-- Format: {"lead": 29, "registration": 15, "complete_registration": 29}
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS event_values JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.rules.event_values IS 'Dollar values per event type for calculating ROAS on lead-gen campaigns. Format: {"lead": 29, "registration": 15}';
