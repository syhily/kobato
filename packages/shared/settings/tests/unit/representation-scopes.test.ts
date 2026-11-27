import type { SettingsSection } from '@kobato/settings/sections'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import {
  REPRESENTATION_SCOPES,
  REPRESENTATION_SECTION_DEPS,
  representationRevisionsFor,
} from '@kobato/settings/representation-scopes'
import { SECTION_TO_BUNDLE_KEY } from '@kobato/settings/sections'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clone = (overrides: Partial<BlogSettingsBundle>): BlogSettingsBundle => ({
  ...TEST_BLOG_SETTINGS_BUNDLE,
  ...overrides,
})

const ALL_DEP_SECTIONS = new Set(Object.values(REPRESENTATION_SECTION_DEPS).flat())
const SECTION_BY_BUNDLE_KEY = new Map<string, SettingsSection>(
  Object.entries(SECTION_TO_BUNDLE_KEY).map(([section, bundleKey]) => [bundleKey, section as SettingsSection]),
)
const ADMIN_ONLY = [
  'mail',
  'newsletter',
  'cache',
  'rateLimit',
  'backup',
  'limits',
  'analytics',
  'security',
  'observability',
] as const

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('settings/representation-scopes — dependency table', () => {
  it('declares every representation scope', () => {
    expect(Object.keys(REPRESENTATION_SECTION_DEPS).sort()).toEqual([...REPRESENTATION_SCOPES].sort())
  })

  it('keeps admin-only sections out of every representation', () => {
    for (const section of ADMIN_ONLY) {
      expect(ALL_DEP_SECTIONS.has(section)).toBe(false)
    }
  })

  it('invalidation is section-scoped, not global', () => {
    const base = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)

    for (const overrides of [
      { security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, csrf: { enabled: false, exemptPaths: [] } } },
      { backup: { ...TEST_BLOG_SETTINGS_BUNDLE.backup!, retention: { enabled: true, days: 90 } } },
      { mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, enabled: false } } },
    ] satisfies Partial<BlogSettingsBundle>[]) {
      expect(representationRevisionsFor(clone(overrides))).toEqual(base)
    }

    const general = representationRevisionsFor(
      clone({
        siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'zh-TW', title: 'Changed' },
      }),
    )
    for (const scope of ['detail', 'listing', 'feed', 'calendar', 'og', 'manifest', 'sitemap'] as const) {
      expect(general[scope]).not.toBe(base[scope])
    }

    const sidebar = representationRevisionsFor(
      clone({
        sidebar: {
          sidebar: {
            ...TEST_BLOG_SETTINGS_BUNDLE.sidebar!.sidebar,
            dailyQuote: { source: 'local', customQuotes: [] },
          },
        },
      }),
    )
    expect(sidebar.calendar).not.toBe(base.calendar)
    expect(sidebar.feed).toBe(base.feed)
    expect(sidebar.og).toBe(base.og)

    const comments = representationRevisionsFor(
      clone({
        comments: {
          comments: { ...TEST_BLOG_SETTINGS_BUNDLE.comments!.comments, size: 30 },
        },
      }),
    )
    expect(comments.detail).not.toBe(base.detail)
    expect(comments.feed).toBe(base.feed)
  })

  it('memoizes by bundle identity and recomputes only for a new object', () => {
    const bundle = TEST_BLOG_SETTINGS_BUNDLE
    const first = representationRevisionsFor(bundle)

    expect(representationRevisionsFor(bundle)).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)

    expect(representationRevisionsFor(null)).toBe(representationRevisionsFor(null))

    const cloneResult = representationRevisionsFor(structuredClone(bundle))
    expect(cloneResult).not.toBe(first)
    expect(cloneResult).toEqual(first)

    const refreshed = clone({
      content: {
        ...TEST_BLOG_SETTINGS_BUNDLE.content!,
        feed: { full: true, size: TEST_BLOG_SETTINGS_BUNDLE.content!.feed.size + 1 },
      },
    })
    const afterRefresh = representationRevisionsFor(refreshed)
    expect(afterRefresh).not.toBe(first)
    expect(afterRefresh.feed).not.toBe(first.feed)
    expect(afterRefresh.calendar).toBe(first.calendar)
  })

  it('is content-addressed: structurally equal bundles and fresh module graphs agree', async () => {
    const first = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)
    const structurallyEqual = representationRevisionsFor(structuredClone(TEST_BLOG_SETTINGS_BUNDLE))
    expect(structurallyEqual).toEqual(first)

    vi.resetModules()
    const { representationRevisionsFor: fresh } = await import('@kobato/settings/representation-scopes')
    expect(fresh(TEST_BLOG_SETTINGS_BUNDLE)).toEqual(first)
  })

  it('detail and listing render the same public shell', () => {
    expect([...REPRESENTATION_SECTION_DEPS.detail]).toEqual([...REPRESENTATION_SECTION_DEPS.listing])
    const revisions = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)
    expect(revisions.detail).toBe(revisions.listing)
  })

  it('covers every settings read on a public render surface', () => {
    const roots = [
      'packages/server/src/render',
      'packages/server/src/http/loaders',
      'apps/sayaka/src/server/site-files.ts',
      'packages/web/admin/src/root.tsx',
    ]
    const files: string[] = []
    for (const root of roots) {
      const absolute = resolve(process.cwd(), root)
      if (root.endsWith('.tsx') || root.endsWith('.ts')) {
        files.push(absolute)
        continue
      }
      for (const entry of readdirSync(absolute, { recursive: true })) {
        const path = join(absolute, String(entry))
        if (/\.(ts|tsx)$/.test(path) && !path.includes('/infra/')) {
          files.push(path)
        }
      }
    }

    const found = new Set<string>()
    for (const file of files) {
      if (!/\.(ts|tsx)$/.test(file)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/requireBlogSettingsSection\(\s*'([A-Za-z]+)'/g)) {
        found.add(match[1]!)
      }
      for (const match of source.matchAll(/getBlogSettingsBundleSync\(\)\?\.([A-Za-z]+)/g)) {
        found.add(match[1]!)
      }
    }

    expect(found.size).toBeGreaterThan(0)
    for (const key of found) {
      const section = SECTION_BY_BUNDLE_KEY.get(key) ?? (key as SettingsSection)
      expect(
        ALL_DEP_SECTIONS.has(section),
        `${key} is read by a render surface but absent from REPRESENTATION_SECTION_DEPS`,
      ).toBe(true)
    }
  })
})
