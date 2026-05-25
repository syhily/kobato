import { describe, expect, it } from 'vitest'

import { extractXHandle } from '@/shared/config/utils'

describe('extractXHandle', () => {
  it('returns undefined when socials array is empty', () => {
    expect(extractXHandle([])).toBeUndefined()
  })

  it('returns undefined when no x network is present', () => {
    expect(extractXHandle([{ network: 'github', link: 'https://github.com/syhily' }])).toBeUndefined()
  })

  it('extracts handle from https://x.com/handle', () => {
    expect(extractXHandle([{ network: 'x', link: 'https://x.com/syhily' }])).toBe('@syhily')
  })

  it('extracts handle from https://twitter.com/handle (legacy URL)', () => {
    expect(extractXHandle([{ network: 'x', link: 'https://twitter.com/syhily' }])).toBe('@syhily')
  })

  it('preserves existing @ prefix if present', () => {
    expect(extractXHandle([{ network: 'x', link: 'https://x.com/@syhily' }])).toBe('@syhily')
  })

  it('returns undefined for malformed URLs', () => {
    expect(extractXHandle([{ network: 'x', link: 'not-a-url' }])).toBeUndefined()
  })

  it('returns undefined when pathname is empty', () => {
    expect(extractXHandle([{ network: 'x', link: 'https://x.com/' }])).toBeUndefined()
  })

  it('finds the x entry among mixed socials', () => {
    const socials = [
      { network: 'github' as const, link: 'https://github.com/syhily' },
      { network: 'x' as const, link: 'https://x.com/amehochan' },
      { network: 'weibo' as const, link: 'https://weibo.com/syhily' },
    ]
    expect(extractXHandle(socials)).toBe('@amehochan')
  })
})
