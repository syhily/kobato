import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetMemoryCacheForTests,
  clearMemoryBucket,
  getMemoryItem,
  removeMemoryItem,
  setMemoryItem,
  wipeMemoryCache,
} from '@/server/infra/cache/memory-store'

// githubAvatar carries a 4-entry / 64KiB budget — the smallest one, so the
// count and byte caps are reachable with a handful of tiny values.
const BUCKET = 'githubAvatar'

beforeEach(() => {
  __resetMemoryCacheForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('memory store — LRU', () => {
  it('evicts the least recently used entry when the count cap is reached', () => {
    setMemoryItem(BUCKET, 'a', 'a', { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'b', 'b', { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'c', 'c', { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'd', 'd', { expiresAtMs: 0 })

    // Reading `a` makes `b` the oldest.
    expect(getMemoryItem(BUCKET, 'a')).toBe('a')
    setMemoryItem(BUCKET, 'e', 'e', { expiresAtMs: 0 })

    expect(getMemoryItem(BUCKET, 'b')).toBeUndefined()
    expect(getMemoryItem(BUCKET, 'a')).toBe('a')
    expect(getMemoryItem(BUCKET, 'c')).toBe('c')
    expect(getMemoryItem(BUCKET, 'd')).toBe('d')
    expect(getMemoryItem(BUCKET, 'e')).toBe('e')
  })

  it('keeps the count cap per bucket', () => {
    for (let index = 0; index < 4; index += 1) {
      setMemoryItem(BUCKET, `k${index}`, index, { expiresAtMs: 0 })
    }
    for (let index = 0; index < 8; index += 1) {
      setMemoryItem('tags', `k${index}`, index, { expiresAtMs: 0 })
    }

    // The tags budget is 8 entries, so the githubAvatar fill cannot evict it.
    expect(getMemoryItem('tags', 'k0')).toBe(0)
    expect(getMemoryItem(BUCKET, 'k0')).toBe(0)
  })
})

describe('memory store — byte cap and oversized entries', () => {
  it('evicts by bytes even when the count cap is not reached', () => {
    const chunk = 'x'.repeat(40 * 1024)
    setMemoryItem(BUCKET, 'first', chunk, { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'second', chunk, { expiresAtMs: 0 })

    // 2 × ~40KiB exceeds the 64KiB bucket budget.
    expect(getMemoryItem(BUCKET, 'first')).toBeUndefined()
    expect(getMemoryItem(BUCKET, 'second')).toBe(chunk)
  })

  it('never admits a single entry above the 64KiB threshold', () => {
    const oversized = 'x'.repeat(64 * 1024)
    setMemoryItem(BUCKET, 'big', oversized, { expiresAtMs: 0 })

    expect(getMemoryItem(BUCKET, 'big')).toBeUndefined()
  })

  it('uses an explicit byte size instead of serializing a Buffer wrapper', () => {
    const buffer = Buffer.alloc(50 * 1024, 7)
    const entry = { status: 0, buffer }

    setMemoryItem('avatar', 'a@b.c', entry, { expiresAtMs: 0, bytes: buffer.byteLength })

    expect(getMemoryItem('avatar', 'a@b.c')).toBe(entry)
  })

  it('replaces a rewritten entry instead of double counting it', () => {
    const chunk = 'x'.repeat(40 * 1024)
    const small = 'y'.repeat(20 * 1024)
    setMemoryItem(BUCKET, 'key', chunk, { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'key', chunk, { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'other', small, { expiresAtMs: 0 })

    // Correct accounting: ~40KiB + ~20KiB fits the 64KiB budget. A rewrite that
    // kept the old bytes would leave no room for `other`.
    expect(getMemoryItem(BUCKET, 'key')).toBe(chunk)
    expect(getMemoryItem(BUCKET, 'other')).toBe(small)
  })

  it('would reject the same Buffer wrapper without an explicit size', () => {
    const entry = { status: 0, buffer: Buffer.alloc(50 * 1024, 7) }

    // JSON.stringify expands the Buffer into a numeric array, far past the cap.
    setMemoryItem('avatar', 'a@b.c', entry, { expiresAtMs: 0 })

    expect(getMemoryItem('avatar', 'a@b.c')).toBeUndefined()
  })

  it('keeps the L1-exempt render buckets out of memory even below the entry cap', () => {
    setMemoryItem('og', 'og:small', Buffer.alloc(1024, 1), { expiresAtMs: 0, bytes: 1024 })
    setMemoryItem('calendar', 'calendar:small', Buffer.alloc(1024, 1), { expiresAtMs: 0, bytes: 1024 })

    expect(getMemoryItem('og', 'og:small')).toBeUndefined()
    expect(getMemoryItem('calendar', 'calendar:small')).toBeUndefined()
  })

  it('rejects even a zero-byte value in an L1-exempt bucket', () => {
    // Without the zero-budget early return, `0 > maxBytes` is false and an empty
    // value would slip past the exemption.
    setMemoryItem('og', 'og:empty', Buffer.alloc(0), { expiresAtMs: 0, bytes: 0 })
    setMemoryItem('calendar', 'calendar:empty', '', { expiresAtMs: 0, bytes: 0 })

    expect(getMemoryItem('og', 'og:empty')).toBeUndefined()
    expect(getMemoryItem('calendar', 'calendar:empty')).toBeUndefined()
  })
})

describe('memory store — expiry', () => {
  it('expires lazily on the deadline and never before it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    setMemoryItem(BUCKET, 'key', 'value', { expiresAtMs: Date.now() + 5_000 })

    vi.setSystemTime(new Date('2026-01-01T00:00:04.999Z'))
    expect(getMemoryItem(BUCKET, 'key')).toBe('value')

    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    expect(getMemoryItem(BUCKET, 'key')).toBeUndefined()
  })

  it('treats zero as never expiring', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    setMemoryItem(BUCKET, 'key', 'value', { expiresAtMs: 0 })

    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    expect(getMemoryItem(BUCKET, 'key')).toBe('value')
  })

  it('refuses an already-expired entry', () => {
    setMemoryItem(BUCKET, 'key', 'value', { expiresAtMs: Date.now() - 1 })

    expect(getMemoryItem(BUCKET, 'key')).toBeUndefined()
  })
})

describe('memory store — invalidation', () => {
  it('removes a single key', () => {
    setMemoryItem(BUCKET, 'a', 'a', { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'b', 'b', { expiresAtMs: 0 })

    removeMemoryItem(BUCKET, 'a')

    expect(getMemoryItem(BUCKET, 'a')).toBeUndefined()
    expect(getMemoryItem(BUCKET, 'b')).toBe('b')
  })

  it('clears one bucket without touching its neighbours', () => {
    setMemoryItem(BUCKET, 'a', 'a', { expiresAtMs: 0 })
    setMemoryItem('tags', 'a', 'a', { expiresAtMs: 0 })

    clearMemoryBucket(BUCKET)

    expect(getMemoryItem(BUCKET, 'a')).toBeUndefined()
    expect(getMemoryItem('tags', 'a')).toBe('a')
  })

  it('wipes every bucket', () => {
    setMemoryItem(BUCKET, 'a', 'a', { expiresAtMs: 0 })
    setMemoryItem('tags', 'a', 'a', { expiresAtMs: 0 })

    wipeMemoryCache()

    expect(getMemoryItem(BUCKET, 'a')).toBeUndefined()
    expect(getMemoryItem('tags', 'a')).toBeUndefined()
  })

  it('never stores null or undefined', () => {
    setMemoryItem(BUCKET, 'null', null, { expiresAtMs: 0 })
    setMemoryItem(BUCKET, 'undefined', undefined, { expiresAtMs: 0 })

    expect(getMemoryItem(BUCKET, 'null')).toBeUndefined()
    expect(getMemoryItem(BUCKET, 'undefined')).toBeUndefined()
  })
})
