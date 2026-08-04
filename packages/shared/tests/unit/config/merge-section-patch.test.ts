import { mergeSectionPatch } from '@kobato/shared/config/merge-section-patch'
import { describe, expect, it } from 'vitest'

describe('shared/config/mergeSectionPatch', () => {
  it('merges records recursively and leaves untouched keys alone', () => {
    const base = { mail: { host: 'old.example.com', sender: 'a@b.co', tls: { secure: true } }, other: 1 }
    const merged = mergeSectionPatch(base, { mail: { host: 'new.example.com' } })

    expect(merged).toEqual({
      mail: { host: 'new.example.com', sender: 'a@b.co', tls: { secure: true } },
      other: 1,
    })
  })

  it('replaces arrays instead of concatenating them', () => {
    const base = { csrf: { enabled: true, exemptPaths: ['/a', '/b'] } }
    const merged = mergeSectionPatch(base, { csrf: { exemptPaths: ['/c'] } })

    expect(merged).toEqual({ csrf: { enabled: true, exemptPaths: ['/c'] } })
  })

  it('replaces arrays of objects wholesale', () => {
    const base = {
      sidebar: {
        widgets: [
          { type: 'search', enabled: true },
          { type: 'recentPosts', enabled: true, count: 5 },
        ],
      },
    }
    const merged = mergeSectionPatch(base, { sidebar: { widgets: [{ type: 'search', enabled: false }] } })

    expect(merged).toEqual({ sidebar: { widgets: [{ type: 'search', enabled: false }] } })
  })

  it('replaces primitives, nulls, and records that replace a leaf', () => {
    const base = { a: 1, b: 'x', c: { nested: true }, d: { keep: 1 } }
    const merged = mergeSectionPatch(base, { a: 2, b: null, c: 'flat' })

    expect(merged).toEqual({ a: 2, b: null, c: 'flat', d: { keep: 1 } })
  })

  it('treats a record patch over a missing base key as a plain assignment', () => {
    const base = { a: 1 }
    const merged = mergeSectionPatch(base, { b: { nested: true } })

    expect(merged).toEqual({ a: 1, b: { nested: true } })
  })

  it('does not mutate the base or the patch', () => {
    const base = { mail: { host: 'old.example.com', tls: { secure: true } } }
    const patch = { mail: { host: 'new.example.com' } }
    const baseSnapshot = JSON.parse(JSON.stringify(base))
    const patchSnapshot = JSON.parse(JSON.stringify(patch))

    mergeSectionPatch(base, patch)

    expect(base).toEqual(baseSnapshot)
    expect(patch).toEqual(patchSnapshot)
  })

  it('skips cycles in the patch instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { host: 'new.example.com' }
    cyclic.self = cyclic
    const base = { mail: { host: 'old.example.com', self: { keep: true } } }

    const merged = mergeSectionPatch(base, { mail: cyclic })

    expect(merged.mail.host).toBe('new.example.com')
    // The cyclic `self` branch was already visited, so the base value survives.
    expect(merged.mail.self).toEqual({ keep: true })
  })
})
