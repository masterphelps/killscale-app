-- Migration 070: Demo workspace clone-on-signup
-- Every new user gets a "Demo Store" workspace with pre-populated ad data
-- The template data lives under user cab4a74f / workspace d0d0d0d0-1111-2222-3333-444444444444
-- This trigger clones it with the new user's ID so they own it and can delete it

-- Update the signup trigger to also create Demo Store workspace
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_business_id UUID;
  demo_workspace_id UUID;
  template_user_id UUID := 'cab4a74f-dce0-45a2-ba75-dc53331624cc';
  template_workspace_id UUID := 'd0d0d0d0-1111-2222-3333-444444444444';
BEGIN
  -- 1. Create "My Business" workspace (existing behavior)
  INSERT INTO public.workspaces (user_id, name, is_default)
  VALUES (NEW.id, 'My Business', true)
  RETURNING id INTO my_business_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (my_business_id, NEW.id, 'owner');

  -- 2. Create "Demo Store" workspace for the new user
  INSERT INTO public.workspaces (user_id, name, is_default)
  VALUES (NEW.id, 'Demo Store', false)
  RETURNING id INTO demo_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (demo_workspace_id, NEW.id, 'owner');

  -- 3. Link the demo ad account to the new workspace
  INSERT INTO public.workspace_accounts (workspace_id, platform, ad_account_id, ad_account_name, currency, initial_sync_complete)
  VALUES (demo_workspace_id, 'meta', 'act_999888777666', 'Demo Store', 'USD', true);

  -- 4. Clone workspace rules
  INSERT INTO public.workspace_rules (workspace_id, scale_roas, min_roas, learning_spend, scale_percentage)
  SELECT demo_workspace_id, scale_roas, min_roas, learning_spend, scale_percentage
  FROM public.workspace_rules
  WHERE workspace_id = template_workspace_id
  LIMIT 1;

  -- 5. Clone ad_data (360 rows) — replace user_id with new user, shift dates to be current
  INSERT INTO public.ad_data (
    user_id, date_start, date_end, campaign_name, adset_name, ad_name,
    impressions, clicks, spend, purchases, revenue, source, ad_account_id,
    synced_at, status, ad_id, adset_status, campaign_status,
    adset_id, campaign_id, campaign_daily_budget, campaign_lifetime_budget,
    adset_daily_budget, adset_lifetime_budget, results, result_value, result_type,
    creative_id, media_hash, media_type, thumbnail_url, creative_thumbnail_url,
    creative_preview_url, video_source_url, creative_media_type, video_id,
    image_url, storage_url, video_views, video_thruplay,
    video_p25, video_p50, video_p75, video_p95, video_p100,
    video_avg_time_watched, video_plays, cost_per_thruplay,
    outbound_clicks, inline_link_click_ctr, cost_per_inline_link_click,
    primary_text, headline, description, reach, frequency
  )
  SELECT
    NEW.id,  -- new user owns the data
    -- Shift dates so max date = today
    date_start + (CURRENT_DATE - (SELECT max(date_start) FROM public.ad_data WHERE ad_account_id = 'act_999888777666' AND user_id = template_user_id)),
    date_end + (CURRENT_DATE - (SELECT max(date_end) FROM public.ad_data WHERE ad_account_id = 'act_999888777666' AND user_id = template_user_id)),
    campaign_name, adset_name, ad_name,
    impressions, clicks, spend, purchases, revenue, source, ad_account_id,
    now(), status, ad_id, adset_status, campaign_status,
    adset_id, campaign_id, campaign_daily_budget, campaign_lifetime_budget,
    adset_daily_budget, adset_lifetime_budget, results, result_value, result_type,
    creative_id, media_hash, media_type, thumbnail_url, creative_thumbnail_url,
    creative_preview_url, video_source_url, creative_media_type, video_id,
    image_url, storage_url, video_views, video_thruplay,
    video_p25, video_p50, video_p75, video_p95, video_p100,
    video_avg_time_watched, video_plays, cost_per_thruplay,
    outbound_clicks, inline_link_click_ctr, cost_per_inline_link_click,
    primary_text, headline, description, reach, frequency
  FROM public.ad_data
  WHERE ad_account_id = 'act_999888777666' AND user_id = template_user_id;

  -- 6. Clone media_library (13 rows)
  INSERT INTO public.media_library (
    user_id, ad_account_id, media_hash, media_type, name,
    url, video_thumbnail_url, width, height, synced_at,
    storage_path, storage_url, download_status, file_size_bytes,
    source_type
  )
  SELECT
    NEW.id, ad_account_id, media_hash, media_type, name,
    url, video_thumbnail_url, width, height, now(),
    storage_path, storage_url, download_status, file_size_bytes,
    source_type
  FROM public.media_library
  WHERE ad_account_id = '999888777666' AND user_id = template_user_id;

  -- 7. Set selected_workspace_id to Demo Store so user sees data on first login
  UPDATE public.profiles
  SET selected_workspace_id = demo_workspace_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;
