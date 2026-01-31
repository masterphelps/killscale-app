-- Migration: Append-only sync architecture
-- Adds initial_sync_complete to workspace_accounts to track whether full historical sync has been done.
-- All accounts start as false — they each need ONE initial sync (date_preset=maximum) to backfill
-- all historical data into ad_data. After that, syncs are append-only (last few days).
-- Existing accounts had partial data (only the last-synced date range), so they also need the
-- initial full sync to populate Creative Studio and enable instant date-range switching.

ALTER TABLE workspace_accounts
  ADD COLUMN IF NOT EXISTS initial_sync_complete BOOLEAN DEFAULT false;
