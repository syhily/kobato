import { describe, expect, it } from 'vitest'

import { deriveSlug, SLUG_MAX, SLUG_PATTERN } from '@/server/infra/slug'

// Contract tests for the project-wide slug helper. These pin the
// pinyin-pro -> github-slugger pipeline so any future swap of either
// dependency cannot silently change the URL shape of every tag,
// category, page, and heading anchor in one go.
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
    // `github-slugger` STRIPS most punctuation rather than replacing
    // it with `-`. Periods, slashes, parens, etc. simply vanish.
    // We document the behaviour here so a future reader doesn't
    // assume "any non-alnum collapses to a dash".
    expect(deriveSlug('a.b.c')).toBe('abc')
    expect(deriveSlug('node.js v20')).toBe('nodejs-v20')
  })

  it('returns an empty string when the input has no slug-eligible characters', () => {
    // The fallback for "all-emoji / all-punctuation" lives at the
    // call sites (category / page service throw a friendly 400);
    // the helper itself returns '' so callers can tell the difference.
    expect(deriveSlug('💯')).toBe('')
    expect(deriveSlug('!!!')).toBe('')
    expect(deriveSlug('   ')).toBe('')
  })

  it('produces stateless output (no cross-call dedup)', () => {
    // First-call vs second-call equality matters because the helper
    // allocates a fresh `GithubSlugger` per call. If we ever
    // accidentally hoist the slugger to module scope, two saves of
    // the same name would yield `foo` and `foo-1`, silently
    // duplicating taxonomy slugs.
    expect(deriveSlug('react')).toBe('react')
    expect(deriveSlug('react')).toBe('react')
  })

  it('every non-empty output satisfies SLUG_PATTERN and stays within SLUG_MAX', () => {
    const samples = ['编程', '张三', 'react', 'React Router', 'Web 开发', '架构 v2', 'Hello, World!']
    for (const sample of samples) {
      const slug = deriveSlug(sample)
      expect(slug.length).toBeGreaterThan(0)
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX)
      expect(SLUG_PATTERN.test(slug)).toBe(true)
    }
  })
})
