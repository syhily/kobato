import { describe, expect, it, vi } from 'vitest'

import type { CommentAndUser, CommentItem } from '@/shared/types/comments'

// `parseComments` consumes the raw `(roots + children)` union returned by
// `loadComments` and produces the nested tree the public list renders.
// Soft-deleted rows (`deleteAt !== null`) MUST disappear from the rendered
// tree, but any surviving replies of a deleted comment have to "climb" the
// `rid` chain and re-attach to the nearest non-deleted ancestor, or become
// roots if every ancestor up to `rid=0` is deleted.
//
// We stub the blog-config bundle because `withCommentBadgeTextColor` (used
// inside the loader's projection pass) reaches it for the default badge
// colour. The exact value is irrelevant — we only assert on tree shape.

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: () => ({}),
  requireBlogSettingsBundle: () => ({}),
}))

const { parseComments } = await import('@/server/domains/comments/services/public-query')

function row(overrides: Omit<Partial<CommentAndUser>, 'id'> & { id: number }): CommentAndUser {
  const { id, ...rest } = overrides
  return {
    id,
    createAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deleteAt: null,
    content: null,
    body: [
      {
        _type: 'block' as const,
        _key: `b-${String(id)}`,
        style: 'normal' as const,
        children: [{ _type: 'span' as const, _key: `s-${String(id)}`, text: 'x' }],
      },
    ],
    type: 'post' as const,
    ownerId: 1,
    userId: 7,
    isVerified: true,
    ua: '',
    ip: '',
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: 0,
    name: 'Alice',
    email: 'a@example.com',
    emailVerified: true,
    link: '',
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    ...rest,
  }
}

function ids(items: CommentItem[]): string[] {
  return items.map((c) => String(c.id))
}

describe('services/comments/loader — parseComments soft-delete reparenting', () => {
  it('leaves a non-deleted thread unchanged', async () => {
    const input: CommentAndUser[] = [
      row({ id: 1, rid: 0, rootId: 0 }),
      row({ id: 2, rid: 1, rootId: 1 }),
      row({ id: 3, rid: 1, rootId: 1 }),
    ]

    const tree = await parseComments(input)

    expect(ids(tree)).toEqual(['1'])
    expect(tree[0].children).toBeDefined()
    expect(ids(tree[0].children ?? [])).toEqual(['2', '3'])
  })

  it('drops a soft-deleted root and promotes its replies to roots', async () => {
    const deletedAt = new Date('2024-02-01T00:00:00.000Z')
    const input: CommentAndUser[] = [
      row({ id: 1, rid: 0, rootId: 0, deleteAt: deletedAt }),
      row({ id: 2, rid: 1, rootId: 1 }),
      row({ id: 3, rid: 1, rootId: 1 }),
    ]

    const tree = await parseComments(input)

    // The deleted root vanishes; its replies become top-level roots.
    expect(ids(tree).sort()).toEqual(['2', '3'])
    expect(tree.every((c) => c.children === undefined)).toBe(true)
  })

  it('reparents a reply to its grandparent when the parent is soft-deleted', async () => {
    const deletedAt = new Date('2024-02-01T00:00:00.000Z')
    const input: CommentAndUser[] = [
      row({ id: 1, rid: 0, rootId: 0 }),
      row({ id: 2, rid: 1, rootId: 1, deleteAt: deletedAt }),
      row({ id: 3, rid: 2, rootId: 1 }),
    ]

    const tree = await parseComments(input)

    expect(ids(tree)).toEqual(['1'])
    // The grandchild re-attaches to the live grandparent (id=1).
    expect(ids(tree[0].children ?? [])).toEqual(['3'])
  })

  it('walks past multiple deleted ancestors until it finds a live one', async () => {
    const deletedAt = new Date('2024-02-01T00:00:00.000Z')
    const input: CommentAndUser[] = [
      row({ id: 1, rid: 0, rootId: 0 }),
      row({ id: 2, rid: 1, rootId: 1, deleteAt: deletedAt }),
      row({ id: 3, rid: 2, rootId: 1, deleteAt: deletedAt }),
      row({ id: 4, rid: 3, rootId: 1 }),
    ]

    const tree = await parseComments(input)

    expect(ids(tree)).toEqual(['1'])
    // 4 climbs 3 → 2 → 1 and attaches under the live root.
    expect(ids(tree[0].children ?? [])).toEqual(['4'])
  })

  it('promotes a leaf to root when every ancestor is soft-deleted', async () => {
    const deletedAt = new Date('2024-02-01T00:00:00.000Z')
    const input: CommentAndUser[] = [
      row({ id: 1, rid: 0, rootId: 0, deleteAt: deletedAt }),
      row({ id: 2, rid: 1, rootId: 1, deleteAt: deletedAt }),
      row({ id: 3, rid: 2, rootId: 1 }),
    ]

    const tree = await parseComments(input)

    expect(ids(tree)).toEqual(['3'])
    expect(tree[0].rid).toBe(0)
    expect(tree[0].children).toBeUndefined()
  })

  it('terminates when rid points back at the row itself (cycle guard)', async () => {
    // Pathological row: rid === id. Without the cycle guard the walker
    // would loop forever; we assert parseComments returns synchronously
    // with a sane shape.
    const input: CommentAndUser[] = [row({ id: 5, rid: 5, rootId: 0 })]

    const tree = await parseComments(input)

    // The row survives (it is not itself deleted); cycle guard rewrites
    // its rid to 0 so it lands as a root.
    expect(ids(tree)).toEqual(['5'])
    expect(tree[0].rid).toBe(0)
  })

  it('treats a missing ancestor as terminating the walk at root', async () => {
    // The parent id=99 is not present on this page (filtered out by
    // paging / visibility). The reply should still render and become a
    // root rather than disappear silently.
    const input: CommentAndUser[] = [row({ id: 7, rid: 99, rootId: 99 })]

    const tree = await parseComments(input)

    expect(ids(tree)).toEqual(['7'])
    expect(tree[0].rid).toBe(0)
  })
})
