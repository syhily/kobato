import { describe, expect, it } from 'vitest'

import { inboxBackoffMs } from '@/server/domains/webmentions/inbox'

// The worker's retry-timing contract, pinned directly (the retry-flow
// integration tests only observe it implicitly through nextRetryAt).
describe('inboxBackoffMs', () => {
  it('doubles per attempt from the one-minute base (attempts already incremented)', () => {
    expect(inboxBackoffMs(1)).toBe(120_000)
    expect(inboxBackoffMs(2)).toBe(240_000)
    expect(inboxBackoffMs(3)).toBe(480_000)
  })

  it('caps at twelve hours', () => {
    expect(inboxBackoffMs(20)).toBe(12 * 3_600_000)
    expect(inboxBackoffMs(100)).toBe(12 * 3_600_000)
  })
})
