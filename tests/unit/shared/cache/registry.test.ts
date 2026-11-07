import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { CACHE_DECLARATIONS, FIXED_CACHE_PREFIXES } from '@/shared/cache/registry'
import { RESERVED_CACHE_BUCKETS } from '@/shared/types/cache'

const tZhCN = makeTranslator('zh-CN')
const tEnUS = makeTranslator('en-US')

// The cache registry is NEUTRAL metadata: machine ids, default prefixes and
// TTLs stay put; labels/descriptions are message ids resolved by the consumer
// (the server DTO fills them through the settings locale seam).

describe('shared/cache/registry — neutral metadata', () => {
  it('keeps every machine id, prefix and tunable flag', () => {
    expect(CACHE_DECLARATIONS.map((entry) => entry.id)).toContain('og')
    expect(CACHE_DECLARATIONS.find((entry) => entry.id === 'og')?.defaultPrefix).toBe('og:')
    expect(CACHE_DECLARATIONS.find((entry) => entry.id === 'feed')?.tunable).toBe(false)
    expect(FIXED_CACHE_PREFIXES).toContain('feed:xml:')
  })

  it('resolves each label per locale', () => {
    const og = CACHE_DECLARATIONS.find((entry) => entry.id === 'og')
    expect(og).toBeDefined()
    expect(tZhCN(og!.labelId)).toBe('OG 图缓存')
    expect(tEnUS(og!.labelId)).toBe('OG image cache')
  })

  it('interpolates the live prefix into the description', () => {
    const og = CACHE_DECLARATIONS.find((entry) => entry.id === 'og')!
    expect(tZhCN(og.descriptionId, { prefix: 'og:' })).toBe(
      '/images/og/:slug.png 的渲染结果，键形如 og:<slug>-<hash>。修改 OG 尺寸或文章封面 / 摘要后清理。',
    )
    expect(tZhCN(og.descriptionId, { prefix: 'custom:' })).toContain('custom:<slug>-<hash>')
    expect(tEnUS(og.descriptionId, { prefix: 'og:' })).toContain('og:<slug>-<hash>')
    // Angle-bracket key segments survive ICU parsing (they are quoted literals).
    const feed = CACHE_DECLARATIONS.find((entry) => entry.id === 'feed')!
    expect(tZhCN(feed.descriptionId, { prefix: 'feed:xml:' })).toContain('feed:xml:cat:<slug>')
  })

  it('resolves the reserved bucket labels through the catalogs', () => {
    for (const bucket of RESERVED_CACHE_BUCKETS) {
      expect(tZhCN(bucket.labelId).length).toBeGreaterThan(0)
      expect(tEnUS(bucket.descriptionId).length).toBeGreaterThan(0)
    }
    const session = RESERVED_CACHE_BUCKETS.find((bucket) => bucket.id === 'session')!
    expect(tZhCN(session.labelId)).toBe('登录会话')
    expect(tEnUS(session.labelId)).toBe('Sign-in sessions')
  })
})
