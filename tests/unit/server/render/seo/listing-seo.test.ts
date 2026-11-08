import type { MetaDescriptor } from 'react-router'

import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { listingSeo } from '@/server/render/seo/listing-seo'

// Listing pagination copy is system copy: it must come from the REQUEST
// locale's server translator, not a hardcoded zh-CN template. URLs, canonical,
// prev/next and noindex semantics stay byte-identical across locales.

type MetaEntry = MetaDescriptor & Record<string, unknown>

function findByProperty(meta: MetaEntry[], property: string) {
  return meta.find((m) => m.property === property) as MetaEntry | undefined
}

function findLink(meta: MetaEntry[], rel: string) {
  return meta.find((m) => m.tagName === 'link' && m.rel === rel) as MetaEntry | undefined
}

function seoFor(locale: AppLocale, overrides: Partial<Parameters<typeof listingSeo>[0]> = {}) {
  return listingSeo(
    {
      pageNum: 2,
      totalPage: 4,
      rootPath: '/cats/general',
      locale,
      ...overrides,
    },
    TEST_BLOG_SETTINGS_BUNDLE,
  ) as MetaEntry[]
}

const PAGE_TOKEN: Record<AppLocale, string> = {
  'en-US': 'Page 2',
  'zh-CN': '第 2 页',
  'zh-TW': '第 2 頁',
  'zh-HK': '第 2 頁',
}

describe('listingSeo — pagination titles follow the request locale', () => {
  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'localizes the bare page title and og:title (%s)',
    (locale) => {
      const meta = seoFor(locale)
      const title = meta[0]?.title as string

      expect(title).toContain(PAGE_TOKEN[locale])
      expect(findByProperty(meta, 'og:title')?.content).toBe(title)
      // Hardcoded Simplified Chinese must never leak into another locale.
      if (locale !== 'zh-CN') {
        expect(title).not.toContain('第 2 页')
      }
    },
  )

  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'localizes the titled page title and keeps the content title (%s)',
    (locale) => {
      const meta = seoFor(locale, { title: 'General' })
      const title = meta[0]?.title as string

      expect(title).toContain('General')
      expect(title).toContain(PAGE_TOKEN[locale])
      expect(findByProperty(meta, 'og:title')?.content).toBe(title)
      if (locale !== 'zh-CN') {
        expect(title).not.toContain('第 2 页')
      }
    },
  )

  it('keeps the public URL contract unchanged across locales', () => {
    const locales = ['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const
    const perLocale = locales.map((locale) => seoFor(locale, { title: 'General' }))

    for (const meta of perLocale) {
      expect(findLink(meta, 'canonical')?.href).toBe('https://example.com/cats/general/page/2')
      expect(findLink(meta, 'prev')?.href).toBe('https://example.com/cats/general')
      expect(findLink(meta, 'next')?.href).toBe('https://example.com/cats/general/page/3')
      expect(meta.find((m) => m.name === 'robots')?.content).toBe('noindex,follow')
    }
  })

  it('leaves the first page title untouched (no page suffix)', () => {
    const meta = seoFor('en-US', { title: 'General', pageNum: 1 })
    expect(meta[0]?.title).toBe('General - 且听书吟')
  })
})
