import { describe, expect, it } from 'vitest'

import { blobsMap, doublesMap, index1Of } from '@/server/domains/analytics/services/access-log'

// Contract pin for the access_events slot allocation: every blob1..16 is
// assigned at most once, the reserved slot is documented, and privacy
// invariants (no raw IP anywhere) hold by construction.

describe('blobsMap slot contract', () => {
  it('assigns all 16 blob slots exactly once', () => {
    const keys = Object.keys(blobsMap)
    expect(keys).toHaveLength(16)
    expect([...keys].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))).toEqual(
      Array.from({ length: 16 }, (_, i) => `blob${i + 1}`),
    )
    expect(new Set(Object.values(blobsMap)).size).toBe(16)
  })

  it('pins the slot semantics', () => {
    expect(blobsMap).toEqual({
      blob1: 'path',
      blob2: 'referer',
      blob3: 'refererHost',
      blob4: 'ua',
      blob5: 'visitorHash',
      blob6: 'language',
      blob7: 'country',
      blob8: 'region',
      blob9: 'city',
      blob10: 'timezone',
      blob11: 'os',
      blob12: 'browser',
      blob13: 'browserType',
      blob14: 'device',
      blob15: 'deviceType',
      blob16: 'reserved',
    })
  })

  it('never stores a raw IP in any slot', () => {
    expect(Object.values(blobsMap)).not.toContain('ip')
    expect(Object.values(doublesMap)).not.toContain('ip')
  })

  it('assigns the double slots to coordinates', () => {
    expect(doublesMap).toEqual({ double1: 'latitude', double2: 'longitude' })
  })
})

describe('index1Of', () => {
  it('builds the entity key for posts and pages', () => {
    expect(index1Of('post', 42)).toBe('post:42')
    expect(index1Of('page', 7)).toBe('page:7')
  })

  it('returns the empty string for site-level views', () => {
    expect(index1Of(null, null)).toBe('')
    expect(index1Of('post', null)).toBe('')
    expect(index1Of(null, 1)).toBe('')
  })
})
