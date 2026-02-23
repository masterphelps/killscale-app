import { execSync } from 'child_process'

export type RenderProgress =
  | { type: 'phase'; phase: string; progress: number; subtitle?: string }
  | { type: 'done'; url: string; size: number }
  | { type: 'error'; message: string }

export function formatSSE(message: RenderProgress): string {
  return `data: ${JSON.stringify(message)}\n\n`
}

export function bundleRemotionProject(bundleDir: string): void {
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
