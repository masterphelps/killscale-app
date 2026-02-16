-- Workspace-First Architecture Migration
-- Auto-link all existing connected accounts to their user's default workspace
-- and ensure every user has selected_workspace_id set

-- Auto-link Meta accounts to default workspace
INSERT INTO workspace_accounts (workspace_id, platform, ad_account_id, ad_account_name, currency)
SELECT w.id, 'meta', a->>'id', a->>'name', COALESCE(a->>'currency', 'USD')
FROM meta_connections mc
JOIN workspaces w ON w.user_id = mc.user_id AND w.is_default = true
CROSS JOIN jsonb_array_elements(mc.ad_accounts) a
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_accounts wa
  WHERE wa.workspace_id = w.id AND wa.ad_account_id = a->>'id'
);

-- Auto-link Google accounts to default workspace
INSERT INTO workspace_accounts (workspace_id, platform, ad_account_id, ad_account_name, currency)
SELECT w.id, 'google', c->>'id', c->>'descriptiveName', 'USD'
FROM google_connections gc
JOIN workspaces w ON w.user_id = gc.user_id AND w.is_default = true
CROSS JOIN jsonb_array_elements(gc.customer_ids) c
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_accounts wa
  WHERE wa.workspace_id = w.id AND wa.ad_account_id = c->>'id'
);

-- Set selected_workspace_id for users who have it NULL
UPDATE profiles p
SET selected_workspace_id = w.id
FROM workspaces w
WHERE w.user_id = p.id AND w.is_default = true AND p.selected_workspace_id IS NULL;
