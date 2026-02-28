export type RenderProgress =
  | { type: 'phase'; phase: string; progress: number; subtitle?: string }
  | { type: 'done'; url: string; size: number }
  | { type: 'error'; message: string }

export function formatSSE(message: RenderProgress): string {
  return `data: ${JSON.stringify(message)}\n\n`
}
