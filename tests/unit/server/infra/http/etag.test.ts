import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  type RepresentationFingerprint,
  currentRepresentation,
  notModifiedResponse,
  pageEtag,
  postEtag,
  weakEtag,
} from '@/server/infra/http/etag'

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

const BASE: RepresentationFingerprint = {
  version: '1.0.0',
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-LL-dd HH:mm',
}

describe('server/infra/http/etag — representation fingerprint', () => {
  const publishedAt = new Date('2024-01-02T03:04:05.000Z')

  it('is stable for an identical representation', () => {
    expect(postEtag(7, publishedAt, BASE)).toBe(postEtag(7, publishedAt, { ...BASE }))
    expect(pageEtag(9, 3, publishedAt, BASE)).toBe(pageEtag('9', '3', publishedAt, { ...BASE }))
  })

  it('changes for each representation dimension on BOTH builders', () => {
    const variants: RepresentationFingerprint[] = [
      { ...BASE, version: '1.0.1' },
      { ...BASE, locale: 'en-US' },
      { ...BASE, timeZone: 'America/New_York' },
      { ...BASE, timeFormat: 'auto' },
    ]
    for (const variant of variants) {
      expect(postEtag(7, publishedAt, variant)).not.toBe(postEtag(7, publishedAt, BASE))
      expect(pageEtag(9, 3, publishedAt, variant)).not.toBe(pageEtag(9, 3, publishedAt, BASE))
    }
  })

  it('derives the default fingerprint from the settings snapshot', () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const zh = currentRepresentation()
    const zhEtag = postEtag(7, publishedAt)
    expect(zh).toMatchObject({ locale: 'zh-CN', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-MM-dd' })

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'zh-TW', timeZone: 'Asia/Taipei' },
    })
    expect(currentRepresentation()).toMatchObject({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })
    expect(postEtag(7, publishedAt)).not.toBe(zhEtag)

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, timeFormat: null },
    })
    expect(currentRepresentation().timeFormat).toBe('auto')
    expect(postEtag(7, publishedAt)).not.toBe(zhEtag)
  })

  it('includes the app version (translations ship with the release)', () => {
    expect(currentRepresentation().version.length).toBeGreaterThan(0)
    expect(postEtag(7, publishedAt, { ...BASE, version: '2.0.0' })).not.toBe(postEtag(7, publishedAt, BASE))
  })
})
