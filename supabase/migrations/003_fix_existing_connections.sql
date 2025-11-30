-- Fix existing meta_connections that don't have in_dashboard set
-- This updates the first account in each connection to have in_dashboard: true

UPDATE meta_connections
SET ad_accounts = (
  SELECT jsonb_agg(
    CASE 
      WHEN rn = 1 THEN account || '{"in_dashboard": true}'::jsonb
      ELSE account || '{"in_dashboard": false}'::jsonb
    END
  )
  FROM (
    SELECT account, row_number() OVER () as rn
    FROM jsonb_array_elements(ad_accounts) AS account
  ) sub
),
selected_account_id = COALESCE(
  selected_account_id,
  (ad_accounts->0->>'id')
)
WHERE ad_accounts IS NOT NULL 
  AND jsonb_array_length(ad_accounts) > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(ad_accounts) AS acc 
    WHERE acc->>'in_dashboard' IS NOT NULL
  );
