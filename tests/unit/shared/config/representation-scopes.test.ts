import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  REPRESENTATION_SCOPES,
  REPRESENTATION_SECTION_DEPS,
  representationRevisionsFor,
} from '@/shared/config/representation-scopes'
import { SECTION_TO_BUNDLE_KEY } from '@/shared/config/sections'

const clone = (overrides: Partial<BlogSettingsBundle>): BlogSettingsBundle => ({
  ...TEST_BLOG_SETTINGS_BUNDLE,
  ...overrides,
})

const ALL_DEP_SECTIONS = new Set(Object.values(REPRESENTATION_SECTION_DEPS).flat())
const SECTION_BY_BUNDLE_KEY = new Map<string, SettingsSection>(
  Object.entries(SECTION_TO_BUNDLE_KEY).map(([section, bundleKey]) => [bundleKey, section as SettingsSection]),
)
const ADMIN_ONLY = ['mail', 'newsletter', 'cache', 'rateLimit', 'backup', 'limits', 'analytics', 'security'] as const

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('shared/config/representation-scopes — dependency table', () => {
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

    // Unrelated saves move nothing.
    for (const overrides of [
      { security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, csrf: { enabled: false, exemptPaths: [] } } },
      { backup: { ...TEST_BLOG_SETTINGS_BUNDLE.backup!, retention: { enabled: true, days: 90 } } },
      { mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, enabled: false } } },
    ] satisfies Partial<BlogSettingsBundle>[]) {
      expect(representationRevisionsFor(clone(overrides))).toEqual(base)
    }

    // A locale/identity save moves every public representation.
    const general = representationRevisionsFor(
      clone({
        siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'zh-TW', title: 'Changed' },
      }),
    )
    for (const scope of ['detail', 'listing', 'feed', 'calendar', 'og', 'manifest', 'sitemap'] as const) {
      expect(general[scope]).not.toBe(base[scope])
    }
    // …but not the comments digest.
    expect(general.comments).toBe(base.comments)

    // Calendar-only inputs do not touch the feed/OG.
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

    // Comments-only inputs move the comments scope.
    const comments = representationRevisionsFor(
      clone({
        comments: {
          comments: { ...TEST_BLOG_SETTINGS_BUNDLE.comments!.comments, size: 30 },
        },
      }),
    )
    expect(comments.comments).not.toBe(base.comments)
    expect(comments.feed).toBe(base.feed)
  })

  it('memoizes by bundle identity and recomputes only for a new object', () => {
    const bundle = TEST_BLOG_SETTINGS_BUNDLE
    const first = representationRevisionsFor(bundle)

    // Same snapshot object → the SAME frozen object (no re-hash per scope/request).
    expect(representationRevisionsFor(bundle)).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)

    // Pre-install is a constant.
    expect(representationRevisionsFor(null)).toBe(representationRevisionsFor(null))

    // A structurally equal CLONE is a different object → recomputed, same values.
    const cloneResult = representationRevisionsFor(structuredClone(bundle))
    expect(cloneResult).not.toBe(first)
    expect(cloneResult).toEqual(first)

    // A refresh replaces the snapshot object → new reference, changed scope.
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

    // A "restart" (fresh module evaluation) must reuse the same cache keys.
    vi.resetModules()
    const { representationRevisionsFor: fresh } = await import('@/shared/config/representation-scopes')
    expect(fresh(TEST_BLOG_SETTINGS_BUNDLE)).toEqual(first)
  })

  it('never hashes an encrypted settings secret', async () => {
    const { SECRET_FIELDS } = await import('@/server/domains/settings/secrets')
    const { SETTINGS_SECRET_FIELD_NAMES } = await import('@/shared/config/representation-scopes')
    for (const secret of SECRET_FIELDS) {
      expect(SETTINGS_SECRET_FIELD_NAMES.has(secret.field)).toBe(true)
    }

    const base = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)
    const rotated = representationRevisionsFor(
      clone({
        assets: {
          ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
          storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, secretAccessKey: 'rotated-secret' },
        },
      }),
    )
    // Credential rotation is not a representation change.
    expect(rotated).toEqual(base)
  })

  it('detail and listing render the same public shell', () => {
    expect([...REPRESENTATION_SECTION_DEPS.detail]).toEqual([...REPRESENTATION_SECTION_DEPS.listing])
    const revisions = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)
    expect(revisions.detail).toBe(revisions.listing)
  })

  it('covers every settings read on a public render surface', () => {
    // Scan the public render perimeter: any section read there must be part of
    // at least one scope's dependency list, or the cache key would miss it.
    const roots = ['src/server/render', 'src/server/http/loaders', 'src/server/http/resources', 'src/root.tsx']
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
      // `requireBlogSettingsSection` takes a BUNDLE key (`siteIdentity`), the
      // dependency table speaks SECTION names (`general`).
      const section = SECTION_BY_BUNDLE_KEY.get(key) ?? (key as SettingsSection)
      expect(
        ALL_DEP_SECTIONS.has(section),
        `${key} is read by a render surface but absent from REPRESENTATION_SECTION_DEPS`,
      ).toBe(true)
    }
  })
})
