import { put } from '@vercel/blob'
import { addBundleToSandbox, createSandbox } from '@remotion/vercel'
import { readdir } from 'fs/promises'
import path from 'path'

const getSnapshotBlobKey = () =>
  `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`

async function scanDirs(dir: string, base = ''): Promise<string[]> {
  const dirs: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      const rel = base ? `${base}/${e.name}` : e.name
      dirs.push(rel)
      dirs.push(...await scanDirs(path.join(dir, e.name), rel))
    }
  }
  return dirs
}

async function main() {
  console.log('[create-snapshot] Creating sandbox...')
  const sandbox = await createSandbox({
    onProgress: ({ progress, message }) => {
      const pct = Math.round(progress * 100)
      console.log(`[create-snapshot] ${message} (${pct}%)`)
    },
  })

  // Pre-create ALL subdirectories inside the sandbox
  // (workaround: sandbox.mkDir isn't recursive, addBundleToSandbox fails on nested dirs)
  console.log('[create-snapshot] Pre-creating sandbox directories...')
  const bundlePath = path.join(process.cwd(), '.remotion')
  const dirs = await scanDirs(bundlePath)
  for (const d of dirs.sort()) {
    await sandbox.mkDir(`remotion-bundle/${d}`)
  }

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
