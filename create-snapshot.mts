import { put } from '@vercel/blob'
import { addBundleToSandbox, createSandbox } from '@remotion/vercel'

const getSnapshotBlobKey = () =>
  `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`

async function main() {
  console.log('[create-snapshot] Creating sandbox...')
  const sandbox = await createSandbox({
    onProgress: ({ progress, message }) => {
      const pct = Math.round(progress * 100)
      console.log(`[create-snapshot] ${message} (${pct}%)`)
    },
  })

  console.log('[create-snapshot] Adding bundle to sandbox...')
  await sandbox.mkDir('remotion-bundle')
  await addBundleToSandbox({ sandbox, bundleDir: '.remotion' })

  console.log('[create-snapshot] Taking snapshot...')
  const snapshot = await sandbox.snapshot({ expiration: 0 })
  const { snapshotId } = snapshot

  await put(getSnapshotBlobKey(), JSON.stringify({ snapshotId }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  console.log(`[create-snapshot] Snapshot saved: ${snapshotId} (never expires)`)
}

main().catch((err) => {
  console.error('[create-snapshot] Failed:', err)
  process.exit(1)
})
