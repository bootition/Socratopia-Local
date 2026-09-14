/**
 * Turn an IPC/Zod error into a short message a learner can read.
 *
 * Electron wraps main-process throwables as
 * `Error invoking remote method 'x': Error: <message>` and Zod failures
 * arrive as a JSON issue array. Neither should be shown raw in the UI.
 */
export function toUserMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  if (raw.trim().length === 0) return fallback

  let message = raw
    .replace(/^Error invoking remote method '[^']*':\s*/i, '')
    .replace(/^Error:\s*/i, '')

  // Zod issue array → first human message.
  const jsonStart = message.indexOf('[')
  if (jsonStart !== -1 && message.includes('"message"')) {
    try {
      const issues = JSON.parse(message.slice(jsonStart)) as Array<{
        message?: unknown
      }>
      const first = Array.isArray(issues) ? issues[0]?.message : undefined
      if (typeof first === 'string' && first.length > 0) return first
    } catch {
      // Not JSON — keep the stripped message.
    }
  }

  const firstLine = message.split('\n')[0]?.trim() ?? ''
  return firstLine.length > 0 ? firstLine.slice(0, 200) : fallback
}
