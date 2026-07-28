import { describe, expect, it } from 'vitest'

import { validateSlugFence, CatalogConsistencyError, type CatalogEntry } from '@/server/domains/pages/fence'

describe('catalog slug fence', () => {
  it('accepts disjoint page and post slug sets', () => {
    const entries: CatalogEntry[] = [
      { type: 'post', id: 1, slug: 'hello' },
      { type: 'post', id: 2, slug: 'world' },
      { type: 'page', id: 3, slug: 'about' },
      { type: 'page', id: 4, slug: 'links' },
    ]
    expect(() => validateSlugFence(entries)).not.toThrow()
  })

  it('throws when a page slug collides with a post slug', () => {
    const entries: CatalogEntry[] = [
      { type: 'post', id: 1, slug: 'about' },
      { type: 'page', id: 2, slug: 'about' },
    ]
    expect(() => validateSlugFence(entries)).toThrow(CatalogConsistencyError)
  })

  it('CatalogConsistencyError carries the conflicting entries', () => {
    const entries: CatalogEntry[] = [
      { type: 'post', id: 1, slug: 'dup' },
      { type: 'page', id: 2, slug: 'dup' },
      { type: 'post', id: 3, slug: 'safe' },
    ]
    try {
      validateSlugFence(entries)
      throw new Error('expected fence to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CatalogConsistencyError)
      const e = err as CatalogConsistencyError
      expect(e.conflicts).toHaveLength(1)
      expect(e.conflicts[0].slug).toBe('dup')
      expect(e.conflicts[0].entries).toHaveLength(2)
    }
  })

  it('accumulates multiple conflicts', () => {
    const entries: CatalogEntry[] = [
      { type: 'post', id: 1, slug: 'a' },
      { type: 'page', id: 2, slug: 'a' },
      { type: 'post', id: 3, slug: 'b' },
      { type: 'page', id: 4, slug: 'b' },
    ]
    try {
      validateSlugFence(entries)
      throw new Error('expected fence to throw')
    } catch (err) {
      const e = err as CatalogConsistencyError
      expect(e.conflicts.map((c) => c.slug).sort()).toEqual(['a', 'b'])
    }
  })
})
