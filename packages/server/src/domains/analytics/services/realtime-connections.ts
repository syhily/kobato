import { createHash } from 'node:crypto'

// Per-session SSE connection cap for `/api/analytics/events`.
const MAX_REALTIME_CONNECTIONS_PER_SESSION = 2

// Per-session connection counter — a plain Map is safe (single-threaded);
// keep this state off any future worker threads.
const activeSSEConnections = new Map<string, number>()

/** Cap key: session id when present, else a truncated SHA-256 of the client address — the raw IP is never used as a map key. */
export function realtimeConnectionKey(sessionId: string | null | undefined, clientAddress: string): string {
  if (sessionId) {
    return `session:${sessionId}`
  }
  return `ip:${createHash('sha256').update(clientAddress).digest('hex').slice(0, 32)}`
}

/** Take one of the per-key connection slots; returns an idempotent release, or `null` at the cap (caller maps that to 429). */
export function acquireRealtimeConnection(key: string): (() => void) | null {
  const current = activeSSEConnections.get(key) ?? 0
  if (current >= MAX_REALTIME_CONNECTIONS_PER_SESSION) {
    return null
  }
  activeSSEConnections.set(key, current + 1)
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    const remaining = (activeSSEConnections.get(key) ?? 0) - 1
    if (remaining <= 0) {
      activeSSEConnections.delete(key)
    } else {
      activeSSEConnections.set(key, remaining)
    }
  }
}

/** Test seam: total live connections across all registry keys. */
export function __getRealtimeConnectionCountForTests(): number {
  let total = 0
  for (const count of activeSSEConnections.values()) {
    total += count
  }
  return total
}
