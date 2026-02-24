import { put } from '@vercel/blob'
import { addBundleToSandbox, createSandbox } from '@remotion/vercel'
import { execSync } from 'child_process'

function bundleRemotionProject(bundleDir: string): void {
  try {
    execSync(`node_modules/.bin/remotion bundle --out-dir ./${bundleDir}`, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? ''
    throw new Error(`Remotion bundle failed: ${stderr}`)
  }
}

const getSnapshotBlobKey = () =>
  `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`

async function main() {
  const sandbox = await createSandbox({
    onProgress: ({ progress, message }) => {
      const pct = Math.round(progress * 100)
      console.log(`[create-snapshot] ${message} (${pct}%)`)
    },
  })

  console.log('[create-snapshot] Bundling Remotion project...')
  bundleRemotionProject('.remotion')

  console.log('[create-snapshot] Adding bundle to sandbox...')
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
