import { describe, expect, it } from 'vitest'

import type { SidebarSelection } from '@/server/domains/posts/services/featured'
import type { SidebarSettings } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { makePost, makeTag } from '#/_helpers/catalog'
import { selectSidebarTags, sidebarSelection, sidebarSelectionSeed } from '@/server/http/loaders/sidebar-select'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

const SIDEBAR_SETTINGS = TEST_BLOG_SETTINGS_BUNDLE.sidebar!

function withRandomTagCount(count: number, enabled = true): SidebarSettings {
  return {
    sidebar: {
      ...SIDEBAR_SETTINGS.sidebar,
      widgets: SIDEBAR_SETTINGS.sidebar.widgets.map((widget) =>
        widget.type === 'randomTags' ? { ...widget, enabled, count } : widget,
      ),
    },
  }
}

function selection(seed: string, settings: SidebarSettings = SIDEBAR_SETTINGS): SidebarSelection {
  return { settings, seed }
}

function tagPool(size: number) {
  return Array.from({ length: size }, (_, i) => makeTag({ slug: `tag-${i}`, counts: 100 + i }))
}

const LOCALIZATION: AppLocalization = {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-MM-dd',
  revision: 'test-boot:0000000001',
  revisions: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE),
}

describe('sidebar selection — seed composition', () => {
  it('rotates by scope, site calendar date and settings revision', () => {
    const base = sidebarSelectionSeed({ scope: 'post:7', date: '2026-11-08', revision: 'test-boot:0000000001' })

    expect(sidebarSelectionSeed({ scope: 'post:7', date: '2026-11-08', revision: 'test-boot:0000000001' })).toBe(base)
    expect(sidebarSelectionSeed({ scope: 'post:8', date: '2026-11-08', revision: 'test-boot:0000000001' })).not.toBe(
      base,
    )
    expect(sidebarSelectionSeed({ scope: 'post:7', date: '2026-11-09', revision: 'test-boot:0000000001' })).not.toBe(
      base,
    )
    expect(sidebarSelectionSeed({ scope: 'post:7', date: '2026-11-08', revision: 'test-boot:0000000002' })).not.toBe(
      base,
    )
  })

  it('uses the SITE calendar day (time zone), not the server/UTC day', () => {
    // 17:30Z is still 11-08 in UTC but already 11-09 in Shanghai.
    const instant = new Date('2026-11-08T17:30:00.000Z')
    const shanghai = sidebarSelection({
      settings: SIDEBAR_SETTINGS,
      scope: 'post:7',
      now: instant,
      localization: LOCALIZATION,
    })
    const utc = sidebarSelection({
      settings: SIDEBAR_SETTINGS,
      scope: 'post:7',
      now: instant,
      localization: { ...LOCALIZATION, timeZone: 'UTC' },
    })
    expect(shanghai.seed).not.toBe(utc.seed)

    // A zone that shares the calendar day yields the SAME rotation bucket.
    const tokyo = sidebarSelection({
      settings: SIDEBAR_SETTINGS,
      scope: 'post:7',
      now: instant,
      localization: { ...LOCALIZATION, timeZone: 'Asia/Tokyo' },
    })
    expect(tokyo.seed).toBe(shanghai.seed)
  })
})

describe('services/sidebar/select — selectSidebarTags', () => {
  it('is deterministic for the same selection (no per-request draw)', () => {
    const tags = tagPool(50)
    const first = selectSidebarTags(tags, selection('scope|day|1'))
    const second = selectSidebarTags(tags, selection('scope|day|1'))

    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })

  it('changes when the rotation bucket changes', () => {
    const tags = tagPool(50)
    const base = selectSidebarTags(tags, selection('scope|2026-11-08|1'))

    const seen = new Set<string>()
    for (const seed of ['scope|2026-11-09|1', 'scope|2026-11-10|1', 'scope|2026-11-11|1']) {
      seen.add(
        selectSidebarTags(tags, selection(seed))
          .map((tag) => tag.slug)
          .join(','),
      )
    }
    expect(seen.size).toBeGreaterThan(1)
    expect(selectSidebarTags(tags, selection('scope|2026-11-08|1'))).toEqual(base)
  })

  it('draws only from top-2N tags by count (low-rank tags are discarded)', () => {
    const top = Array.from({ length: 50 }, (_, i) => makeTag({ slug: `top-${i}`, counts: 100 + i }))
    const tail = Array.from({ length: 200 }, (_, i) => makeTag({ slug: `tail-${i}`, counts: 1 }))

    const result = selectSidebarTags([...tail, ...top], selection('scope|day|1'))
    for (const tag of result) {
      expect(tag.counts).toBeGreaterThan(1)
    }
  })

  it('returns empty when the widget is disabled or its count is zero', () => {
    const tags = tagPool(10)
    expect(selectSidebarTags([], selection('scope|day|1'))).toEqual([])
    expect(selectSidebarTags(tags, selection('scope|day|1', withRandomTagCount(0)))).toEqual([])
    expect(selectSidebarTags(tags, selection('scope|day|1', withRandomTagCount(3, false)))).toEqual([])
  })

  it('keeps a near-uniform distribution across rotation buckets', () => {
    // 8 tags, size 3 → the top-6 pool; over 180 distinct days every eligible
    // tag must be drawn and no tag may dominate (expected 90 draws each).
    const tags = tagPool(8)
    const counts = new Map<string, number>()
    for (let day = 1; day <= 30; day++) {
      for (const seed of Array.from({ length: 6 }, (_, i) => `scope|2026-11-${day}-${i}|1`)) {
        for (const tag of selectSidebarTags(tags, selection(seed, withRandomTagCount(3)))) {
          counts.set(tag.slug, (counts.get(tag.slug) ?? 0) + 1)
        }
      }
    }

    // The two lowest-count tags stay outside the top-2N window.
    expect(counts.has('tag-0')).toBe(false)
    expect(counts.has('tag-1')).toBe(false)
    const eligible = ['tag-2', 'tag-3', 'tag-4', 'tag-5', 'tag-6', 'tag-7'].map((slug) => counts.get(slug) ?? 0)
    expect(eligible.every((count) => count > 0)).toBe(true)
    expect(Math.max(...eligible) - Math.min(...eligible)).toBeLessThan(40)
  })
})

describe('services/sidebar/select — fixtures sanity', () => {
  it('makePost defaults produce a valid ClientPost', () => {
    const post = makePost()
    expect(post.slug.length).toBeGreaterThan(0)
    expect(post.permalink.startsWith('/posts/')).toBe(true)
    expect(post.published).toBe(true)
  })
})
