import { describe, expect, it } from 'vitest'

import { notModifiedResponse, weakEtag } from '@/server/infra/http/etag'

describe('server/infra/http/etag — weakEtag', () => {
  it('returns a weak-etag-prefixed 16-char hex digest', () => {
    const tag = weakEtag(['a', 1])
    expect(tag).toMatch(/^W\/"[0-9a-f]{16}"$/)
  })

  it('is deterministic for the same parts', () => {
    expect(weakEtag(['a', 1])).toBe(weakEtag(['a', 1]))
  })

  it('changes when a part changes', () => {
    expect(weakEtag(['a', 1])).not.toBe(weakEtag(['a', 2]))
  })

  it('serialises Dates via toISOString and treats null/undefined as empty', () => {
    const date = new Date('2025-01-01T00:00:00.000Z')
    expect(weakEtag([date, null, undefined])).toBe(weakEtag([date, '', '']))
  })

  it('handles bigint parts', () => {
    expect(weakEtag([1])).toBe(weakEtag([1]))
  })
})

describe('server/infra/http/etag — notModifiedResponse', () => {
  it('returns a 304 response with the etag and Vary headers', () => {
    const tag = 'W/"abc"'
    const res = notModifiedResponse(tag)
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(tag)
    expect(res.headers.get('Vary')).toBe('Cookie')
  })
})
