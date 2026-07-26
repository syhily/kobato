import { describe, expect, it } from 'vitest'

import { acquireRealtimeConnection, realtimeConnectionKey } from '@/server/domains/analytics/services/realtime'

// Domain-seam coverage for the SSE connection registry sunk out of
// `src/server/http/resources/analytics.ts` (task C4): the cap key
// derivation (session vs hashed IP) and the per-key slot policy. The
// resource keeps only the Hono/SSE plumbing; the HTTP-level driving of
// this same registry is pinned in
// tests/it/server/http/resources/analytics-events.test.ts.

describe('realtimeConnectionKey', () => {
  it('prefers the session id when one is present', () => {
    expect(realtimeConnectionKey('abc123', '127.0.0.1')).toBe('session:abc123')
  })

  it('falls back to a truncated hash of the client address (never the raw IP)', () => {
    for (const sessionId of [undefined, null, '']) {
      const key = realtimeConnectionKey(sessionId, '203.0.113.7')
      expect(key).toMatch(/^ip:[0-9a-f]{32}$/)
      expect(key).not.toContain('203.0.113.7')
    }
  })

  it('derives distinct keys for distinct addresses and stable keys for the same one', () => {
    expect(realtimeConnectionKey(undefined, '10.0.0.1')).toBe(realtimeConnectionKey(undefined, '10.0.0.1'))
    expect(realtimeConnectionKey(undefined, '10.0.0.1')).not.toBe(realtimeConnectionKey(undefined, '10.0.0.2'))
  })
})

describe('acquireRealtimeConnection — per-key cap of two', () => {
  it('allows two concurrent slots and refuses the third', () => {
    const key = realtimeConnectionKey('cap-test-1', '10.1.0.1')
    const first = acquireRealtimeConnection(key)
    const second = acquireRealtimeConnection(key)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(acquireRealtimeConnection(key)).toBeNull()
    first!()
    second!()
  })

  it('frees the slot when the release function runs', () => {
    const key = realtimeConnectionKey('cap-test-2', '10.1.0.2')
    const first = acquireRealtimeConnection(key)
    const second = acquireRealtimeConnection(key)
    expect(acquireRealtimeConnection(key)).toBeNull()

    first!()

    const again = acquireRealtimeConnection(key)
    expect(again).not.toBeNull()
    second!()
    again!()
  })

  it('keeps the release idempotent (a double close does not over-decrement)', () => {
    const key = realtimeConnectionKey('cap-test-3', '10.1.0.3')
    const first = acquireRealtimeConnection(key)!
    const second = acquireRealtimeConnection(key)!

    first()
    first()

    // Only one slot was freed: a new acquire fills it and the next one is
    // refused again.
    const third = acquireRealtimeConnection(key)
    expect(third).not.toBeNull()
    expect(acquireRealtimeConnection(key)).toBeNull()
    second()
    third!()
  })

  it('tracks distinct keys independently', () => {
    const keyA = realtimeConnectionKey('cap-test-4a', '10.1.0.4')
    const keyB = realtimeConnectionKey('cap-test-4b', '10.1.0.5')
    const a1 = acquireRealtimeConnection(keyA)!
    const a2 = acquireRealtimeConnection(keyA)!

    const b1 = acquireRealtimeConnection(keyB)
    const b2 = acquireRealtimeConnection(keyB)
    expect(b1).not.toBeNull()
    expect(b2).not.toBeNull()
    expect(acquireRealtimeConnection(keyB)).toBeNull()

    a1()
    a2()
    b1!()
    b2!()
  })
})
