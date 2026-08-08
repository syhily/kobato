import { describe, expect, it } from 'vitest'

import { deriveSlug } from '@/server/infra/slug/derive'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'

// Pins the pinyin-pro -> github-slugger pipeline: a swap of either
// dependency must not silently change URL shapes.
describe('deriveSlug', () => {
  it('romanises Han text to lowercase pinyin syllables joined by `-`', () => {
    expect(deriveSlug('编程')).toBe('bian-cheng')
    expect(deriveSlug('张三')).toBe('zhang-san')
  })

  it('keeps ASCII inputs verbatim (lowercased + kebab-cased)', () => {
    expect(deriveSlug('react')).toBe('react')
    expect(deriveSlug('React Router')).toBe('react-router')
    expect(deriveSlug('Hello, World!')).toBe('hello-world')
  })

  it('mixes Han + ASCII with a single dash separator', () => {
    expect(deriveSlug('Web 开发')).toBe('web-kai-fa')
    expect(deriveSlug('架构 v2')).toBe('jia-gou-v2')
  })

  it('collapses consecutive separators and strips leading / trailing dashes', () => {
    expect(deriveSlug('  hello   world  ')).toBe('hello-world')
    expect(deriveSlug('--foo--bar--')).toBe('foo-bar')
    // github-slugger strips most punctuation — don't assume it becomes `-`.
    expect(deriveSlug('a.b.c')).toBe('abc')
    expect(deriveSlug('node.js v20')).toBe('nodejs-v20')
  })

  it('returns an empty string when the input has no slug-eligible characters', () => {
    // Call sites map '' to a 400 — it must stay distinguishable.
    expect(deriveSlug('💯')).toBe('')
    expect(deriveSlug('!!!')).toBe('')
    expect(deriveSlug('   ')).toBe('')
  })

  it('produces stateless output (no cross-call dedup)', () => {
    // Stateless: a shared GithubSlugger would dedup repeats into `foo-1`.
    expect(deriveSlug('react')).toBe('react')
    expect(deriveSlug('react')).toBe('react')
  })

  it('every non-empty output satisfies DERIVED_SLUG_PATTERN and stays within SLUG_MAX', () => {
    const samples = ['编程', '张三', 'react', 'React Router', 'Web 开发', '架构 v2', 'Hello, World!']
    for (const sample of samples) {
      const slug = deriveSlug(sample)
      expect(slug.length).toBeGreaterThan(0)
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX)
      expect(DERIVED_SLUG_PATTERN.test(slug)).toBe(true)
    }
  })
})
