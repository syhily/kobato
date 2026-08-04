import { formatLocalDate, formatShowDate, slicePosts } from '@kobato/shared/utils/formatter'
import { describe, expect, it } from 'vitest'

// Minimal aggregated-shaped fixture for the date formatters. Only the
// `locale` / `timeZone` / `timeFormat` slice is read.
const config = {
  settings: {
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
  },
}

describe('services/markdown/formatter — slicePosts', () => {
  it('returns the requested page slice and the correct totalPage count', () => {
    const posts = Array.from({ length: 23 }, (_, i) => i)
    const result = slicePosts(posts, 2, 10)
    expect(result.totalPage).toBe(3)
    expect(result.currentPosts).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  })

  it('returns the trailing tail (not a fixed-size window) on the last page', () => {
    const posts = Array.from({ length: 23 }, (_, i) => i)
    const result = slicePosts(posts, 3, 10)
    expect(result.currentPosts).toEqual([20, 21, 22])
  })

  it('returns an empty slice but keeps totalPage when overflowing', () => {
    expect(slicePosts([1, 2, 3], 5, 2)).toEqual({ currentPosts: [], totalPage: 2 })
  })

  it('returns totalPage=0 for an empty list', () => {
    expect(slicePosts([], 1, 10)).toEqual({ currentPosts: [], totalPage: 0 })
  })
})

// Home-only feature: when `mergeTailWhenLessThan` is set, the natural
// last page is merged into its predecessor whenever the orphan tail is
// strictly smaller than the threshold. The threshold every other listing
// route opts out of by leaving the option unset; home wires it as
// pageSize - 2 so a tail of 1 or 2 posts on a 10-per-page setting
// collapses into the previous page, while a near-full tail e.g. 8 of 10
// keeps its own page.
describe('services/markdown/formatter — slicePosts tail-merge guard', () => {
  it('does nothing when the option is left unset (legacy behaviour)', () => {
    const posts = Array.from({ length: 12 }, (_, i) => i)
    expect(slicePosts(posts, 2, 10).totalPage).toBe(2)
    expect(slicePosts(posts, 2, 10).currentPosts).toEqual([10, 11])
  })

  it('does nothing when the option is set but the tail is large enough', () => {
    // pageSize=10, threshold=8. Tail of 8 posts is NOT < 8, so no merge.
    const posts = Array.from({ length: 18 }, (_, i) => i)
    const result = slicePosts(posts, 2, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(2)
    expect(result.currentPosts).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('merges the orphan tail into the previous page when below the threshold', () => {
    // pageSize=10, threshold=8. Tail of 2 posts IS < 8, so merge.
    // Expected: totalPage drops from 2 to 1; the only remaining page
    // returns all 12 posts in one open-ended slice.
    const posts = Array.from({ length: 12 }, (_, i) => i)
    const result = slicePosts(posts, 1, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(1)
    expect(result.currentPosts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('merges across the middle of the catalogue, not just the very last tail', () => {
    // pageSize=10, threshold=8. 23 posts naturally split 10 / 10 / 3.
    // Tail of 3 IS < 8, so merge. Expected: totalPage drops 3 to 2;
    // page 2 now holds posts 10..22 (13 posts) via the open-ended slice.
    const posts = Array.from({ length: 23 }, (_, i) => i)
    const result = slicePosts(posts, 2, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(2)
    expect(result.currentPosts).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
  })

  it('out-of-range page after a merge yields the empty + new totalPage shape', () => {
    // The shared `redirectListingOverflow` helper relies on this exact
    // contract: pageNum > totalPage returns currentPosts: [] alongside
    // the merged totalPage so the helper can 301-redirect.
    const posts = Array.from({ length: 12 }, (_, i) => i)
    const result = slicePosts(posts, 2, 10, { mergeTailWhenLessThan: 8 })
    expect(result).toEqual({ currentPosts: [], totalPage: 1 })
  })

  it('never merges when there is only one natural page', () => {
    // A tail-merge on totalPage=1 has no predecessor to absorb the
    // orphans, so the guard is intentionally skipped.
    const posts = Array.from({ length: 3 }, (_, i) => i)
    const result = slicePosts(posts, 1, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(1)
    expect(result.currentPosts).toEqual([0, 1, 2])
  })

  it('threshold of 0 is a no-op (mirrors the option being absent)', () => {
    const posts = Array.from({ length: 12 }, (_, i) => i)
    const result = slicePosts(posts, 1, 10, { mergeTailWhenLessThan: 0 })
    expect(result.totalPage).toBe(2)
    expect(result.currentPosts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('boundary: tail equal to the threshold does NOT merge (strict less-than)', () => {
    // pageSize=10, threshold=8. Tail of exactly 8 stays on its own page.
    const posts = Array.from({ length: 18 }, (_, i) => i)
    const result = slicePosts(posts, 2, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(2)
    expect(result.currentPosts).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('boundary: tail one below the threshold DOES merge', () => {
    // pageSize=10, threshold=8. Tail of 7 collapses into the previous page.
    const posts = Array.from({ length: 17 }, (_, i) => i)
    const result = slicePosts(posts, 1, 10, { mergeTailWhenLessThan: 8 })
    expect(result.totalPage).toBe(1)
    expect(result.currentPosts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })
})

describe('services/markdown/formatter — date formatting', () => {
  it('formatShowDate returns 今天 for the current calendar day', () => {
    expect(formatShowDate(new Date(), config)).toBe('今天')
  })

  it('formatShowDate returns 昨天 for one day before now', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(formatShowDate(yesterday, config)).toBe('昨天')
  })

  it("formatShowDate returns 'N 天前' inside the past week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatShowDate(threeDaysAgo, config)).toMatch(/^[1-6] 天前$/)
  })

  it('formatShowDate uses the optional reference instant instead of the runtime clock', () => {
    const postDay = new Date('2024-06-10T16:00:00.000Z')
    expect(formatShowDate(postDay, config, '2024-06-11T16:00:00.000Z')).toBe('昨天')
    expect(formatShowDate(postDay, config, '2024-06-12T16:00:00.000Z')).toBe('2 天前')
  })

  it('formatLocalDate honours an explicit format string', () => {
    const date = new Date('2024-05-15T12:34:56.000Z')
    expect(formatLocalDate(date, 'yyyy-LL-dd', config)).toBe('2024-05-15')
  })
})
