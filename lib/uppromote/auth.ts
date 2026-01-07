import { createClient } from '@supabase/supabase-js'
import type { UpPromoteConnection } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Get UpPromote connection for a workspace
 */
export async function getUpPromoteConnection(workspaceId: string): Promise<UpPromoteConnection | null> {
  const { data, error } = await supabase
    .from('uppromote_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    return null
  }

  return data as UpPromoteConnection
}

/**
 * Update last sync timestamp and status for an UpPromote connection
 */
export async function updateSyncStatus(
  workspaceId: string,
  status: 'pending' | 'syncing' | 'success' | 'error',
  error?: string
): Promise<void> {
  const updates: any = {
    sync_status: status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'success') {
    updates.last_sync_at = new Date().toISOString()
    updates.sync_error = null
  } else if (status === 'error' && error) {
    updates.sync_error = error
  }

  await supabase
    .from('uppromote_connections')
    .update(updates)
    .eq('workspace_id', workspaceId)
}

/**
 * Check if workspace has an UpPromote connection
 */
export async function hasUpPromoteConnection(workspaceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('uppromote_connections')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  return !error && !!data
}
