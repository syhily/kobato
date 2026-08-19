import { describe, expect, it } from 'vitest'

import { webmentionBackoffMs } from '@/server/domains/webmentions/retry'

// The worker's retry-timing contract, pinned directly (the retry-flow
// integration tests only observe it implicitly through nextRetryAt).
describe('webmentionBackoffMs', () => {
  it('doubles per attempt from the one-minute base (attempts already incremented)', () => {
    expect(webmentionBackoffMs(1)).toBe(120_000)
    expect(webmentionBackoffMs(2)).toBe(240_000)
    expect(webmentionBackoffMs(3)).toBe(480_000)
  })

  it('caps at twelve hours', () => {
    expect(webmentionBackoffMs(20)).toBe(12 * 3_600_000)
    expect(webmentionBackoffMs(100)).toBe(12 * 3_600_000)
  })
})
