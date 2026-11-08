import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS, getSocialNetworkMeta } from '@/shared/config/socials'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'

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
      expect(meta.labelId.length).toBeGreaterThan(0)
      expect(meta.brandName.length).toBeGreaterThan(0)
      expect(meta.defaultName.length).toBeGreaterThan(0)
      expect(meta.linkPlaceholder.length).toBeGreaterThan(0)
      expect(meta.linkLabelId.length).toBeGreaterThan(0)
    }
  })

  it('uses catalog ids for every displayed label (never prose)', () => {
    for (const network of SOCIAL_NETWORKS) {
      const meta = SOCIAL_NETWORK_META[network]
      expect(Object.hasOwn(uiMessagesEnUS, meta.labelId)).toBe(true)
      expect(Object.hasOwn(uiMessagesEnUS, meta.linkLabelId)).toBe(true)
      expect(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(meta.labelId)).toBe(false)
      expect(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(meta.brandName)).toBe(false)
    }
  })

  it('keeps the pre-i18n seed names untouched (stored content compatibility)', () => {
    // `defaultName` seeds `socials[].name`; it must never follow the UI locale.
    expect(SOCIAL_NETWORK_META.weibo.defaultName).toBe('微博')
    expect(SOCIAL_NETWORK_META.wechat.defaultName).toBe('微信')
    // The machine/validation spelling stays locale-neutral.
    expect(SOCIAL_NETWORK_META.weibo.brandName).toBe('Weibo')
    expect(SOCIAL_NETWORK_META.wechat.brandName).toBe('WeChat')
  })

  it('resolves the editor labels in all four locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = makeTranslator(locale)
      for (const network of SOCIAL_NETWORKS) {
        const meta = SOCIAL_NETWORK_META[network]
        expect(t(meta.labelId), `${locale} ${network} label`).not.toBe(meta.labelId)
        expect(t(meta.linkLabelId), `${locale} ${network} link label`).not.toBe(meta.linkLabelId)
      }
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
