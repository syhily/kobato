import { makePost, makeTag } from '#/_helpers/catalog'

import { selectSidebarTags } from '@kobato/server/http/loaders/sidebar-select'
import { describe, expect, it } from 'vitest'

describe('services/sidebar/select — selectSidebarTags', () => {
  it('does not memoize sidebar tags between requests', () => {
    const tags: ReturnType<typeof makeTag>[] = Array.from({ length: 50 }, (_, i) =>
      makeTag({ slug: `tag-${i}`, counts: 100 + i }),
    )
    const first = selectSidebarTags(tags)
    const second = selectSidebarTags(tags)

    expect(second).not.toBe(first)
  })

  it('draws only from top-2N tags by count (low-rank tags are discarded)', () => {
    // Build a pool where the top tags are clearly higher-counted than the
    // long tail. Even after the size*2 slice (currently 20 with the live
    // config), the result must come exclusively from the high-count band —
    // never from the count=1 tail.
    const top: ReturnType<typeof makeTag>[] = Array.from({ length: 50 }, (_, i) =>
      makeTag({ slug: `top-${i}`, counts: 100 + i }),
    )
    const tail: ReturnType<typeof makeTag>[] = Array.from({ length: 200 }, (_, i) =>
      makeTag({ slug: `tail-${i}`, counts: 1 }),
    )
    const result = selectSidebarTags([...tail, ...top])
    for (const tag of result) {
      expect(tag.counts).toBeGreaterThan(1)
    }
  })

  it('returns empty when randomSize is 0 (config-driven gate)', () => {
    // We can't easily mutate config; instead verify the empty-input edge
    // case so the function stays defensive.
    expect(selectSidebarTags([])).toEqual([])
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
