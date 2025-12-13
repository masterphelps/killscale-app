-- ============================================================================
-- RESULTS-BASED TRACKING COLUMNS
-- Add columns for tracking results (leads, registrations, etc.) and their values
-- ============================================================================

-- Add results columns to ad_data table
ALTER TABLE public.ad_data ADD COLUMN IF NOT EXISTS results INTEGER DEFAULT 0;
ALTER TABLE public.ad_data ADD COLUMN IF NOT EXISTS result_value NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE public.ad_data ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.ad_data.results IS 'Count of conversion results (leads, purchases, registrations, etc.)';
COMMENT ON COLUMN public.ad_data.result_value IS 'Monetary value of results - from Meta for purchases, or calculated from event_values for lead-gen';
COMMENT ON COLUMN public.ad_data.result_type IS 'Type of result (purchase, lead, registration, contact, etc.)';

-- Create index for filtering by result_type
CREATE INDEX IF NOT EXISTS idx_ad_data_result_type ON public.ad_data(result_type);
