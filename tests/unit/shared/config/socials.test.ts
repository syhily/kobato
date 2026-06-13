import { describe, expect, it } from 'vitest'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS, getSocialNetworkMeta } from '@/shared/config/socials'

describe('shared/config/socials — SOCIAL_NETWORKS', () => {
  it('exposes the closed list of branded networks', () => {
    expect(SOCIAL_NETWORKS).toEqual(['github', 'x', 'wechat', 'weibo', 'qq'])
  })
})

describe('shared/config/socials — SOCIAL_NETWORK_META', () => {
  it('has one entry per network with matching network key', () => {
    for (const network of SOCIAL_NETWORKS) {
      const meta = SOCIAL_NETWORK_META[network]
      expect(meta.network).toBe(network)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.defaultName.length).toBeGreaterThan(0)
      expect(meta.linkPlaceholder.length).toBeGreaterThan(0)
    }
  })

  it('classifies each network as link or qrcode', () => {
    expect(SOCIAL_NETWORK_META.github.type).toBe('link')
    expect(SOCIAL_NETWORK_META.x.type).toBe('link')
    expect(SOCIAL_NETWORK_META.weibo.type).toBe('link')
    expect(SOCIAL_NETWORK_META.wechat.type).toBe('qrcode')
    expect(SOCIAL_NETWORK_META.qq.type).toBe('qrcode')
  })
})

describe('shared/config/socials — getSocialNetworkMeta', () => {
  it('returns the same reference as the lookup table', () => {
    expect(getSocialNetworkMeta('github')).toBe(SOCIAL_NETWORK_META.github)
    expect(getSocialNetworkMeta('wechat')).toBe(SOCIAL_NETWORK_META.wechat)
  })
})
