import type { CommentTokenCookie, CommentTokenCookieEntry } from '@kobato/shared/utils/comment-token'

import { appendCommentToken } from '@kobato/server/domains/comments/services/token'
import { describe, expect, it } from 'vitest'

const TTL_SECONDS = 3600

function entry(token: string, expiresAt: number): CommentTokenCookieEntry {
  return { token, expiresAt }
}

/** Build a cookie with `count` entries on one page, oldest first. */
function buildCookie(pageKey: string, count: number, startExpiresAt = 1_000): CommentTokenCookie {
  const entries: CommentTokenCookieEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.push(entry(`old-token-${i}`, startExpiresAt + i * 1_000))
  }
  return { [pageKey]: entries }
}

function totalEntries(cookie: CommentTokenCookie): number {
  return Object.values(cookie).reduce((count, entries) => count + entries.length, 0)
}

describe('appendCommentToken', () => {
  it('appends the new token to the target page', () => {
    const next = appendCommentToken({}, 'page-a', 'new-token', TTL_SECONDS)
    expect(Object.keys(next)).toEqual(['page-a'])
    expect(next['page-a']).toHaveLength(1)
    expect(next['page-a']![0]!.token).toBe('new-token')
    expect(next['page-a']![0]!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('keeps entries under the cap untouched', () => {
    const existing = buildCookie('page-a', 3)
    const next = appendCommentToken(existing, 'page-a', 'new-token', TTL_SECONDS)
    expect(totalEntries(next)).toBe(4)
    expect(next['page-a']!.map((e) => e.token)).toEqual(['old-token-0', 'old-token-1', 'old-token-2', 'new-token'])
  })

  it('evicts the oldest entries once the jar exceeds 50 entries', () => {
    const existing = buildCookie('page-a', 50)
    const next = appendCommentToken(existing, 'page-a', 'new-token', TTL_SECONDS)
    expect(totalEntries(next)).toBe(50)
    const tokens = next['page-a']!.map((e) => e.token)
    expect(tokens).not.toContain('old-token-0')
    expect(tokens).toContain('old-token-49')
    expect(tokens).toContain('new-token')
  })

  it('evicts the globally oldest entry even when it lives on another page', () => {
    const existing: CommentTokenCookie = {
      'page-old': [entry('ancient-token', 500)],
      'page-a': buildCookie('page-a', 50)['page-a']!.map((e) => ({ ...e, expiresAt: e.expiresAt + 60_000 })),
    }
    const next = appendCommentToken(existing, 'page-a', 'new-token', TTL_SECONDS)
    expect(totalEntries(next)).toBe(50)
    expect(next['page-old']).toBeUndefined()
    expect(next['page-a']!.some((e) => e.token === 'new-token')).toBe(true)
  })

  it('enforces the serialized size budget before the entry cap', () => {
    // A long pageKey inflates each entry's share of the serialized jar so
    // the byte budget trips well below 50 entries.
    const pageKey = `page-${'x'.repeat(1_000)}`
    let cookie: CommentTokenCookie = {}
    for (let i = 0; i < 50; i++) {
      cookie = appendCommentToken(cookie, pageKey, `token-${i}`, TTL_SECONDS)
    }
    const serialized = encodeURIComponent(JSON.stringify(cookie))
    expect(serialized.length).toBeLessThanOrEqual(3_500)
    expect(totalEntries(cookie)).toBeLessThan(50)
    expect(cookie[pageKey]!.some((e) => e.token === 'token-49')).toBe(true)
  })

  it('never evicts the freshly-issued token', () => {
    // A single pageKey so large the jar is over budget with one entry:
    // eviction must stop rather than drop the new token.
    const pageKey = `page-${'x'.repeat(4_000)}`
    const next = appendCommentToken({}, pageKey, 'new-token', TTL_SECONDS)
    expect(next[pageKey]).toHaveLength(1)
    expect(next[pageKey]![0]!.token).toBe('new-token')
  })

  it('does not mutate the input cookie or its entry lists', () => {
    const existing = buildCookie('page-a', 50)
    const snapshot = JSON.stringify(existing)
    appendCommentToken(existing, 'page-a', 'new-token', TTL_SECONDS)
    expect(JSON.stringify(existing)).toBe(snapshot)
  })
})
