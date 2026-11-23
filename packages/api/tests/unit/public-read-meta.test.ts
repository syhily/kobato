import type { NoMeta, PublicReadMeta } from '@kobato/api/rpc/define-procedure'

import { accountContract } from '@kobato/api/account-contract'
import { adminContract } from '@kobato/api/admin-contract'
import { publicContract } from '@kobato/api/public-contract'
import { isContractProcedure } from '@orpc/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'

// FROZEN anonymous-read eligibility: the exact public procedure keys (each is its canonical `/rpc/public/<key>`
// transport path with `.` → `/`) carrying `~orpc.meta.publicRead === true`. The server derives its CSRF public-read
// exemption from this metadata — adding a key is a deliberate security-sensitive act, removing one breaks deployed
// headless consumers. Token reads, comment mutations, and the whole account/admin surface must never appear here.
const PUBLIC_READ_KEYS: readonly string[] = [
  'content.bootstrap',
  'content.home',
  'content.posts.list',
  'content.posts.bySlug',
  'content.pages.bySlug',
  'content.comments.byKey',
  'content.search',
  'content.categories.list',
  'content.archives',
  'comments.loadComments',
  'webmentions.list',
  'avatar.find',
  'github.avatar',
  'github.release',
  'images.resolveThumbhash',
  'music.get',
]

function leavesOf(tree: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (isContractProcedure(value)) {
      leaves.set(path, value)
    } else if (typeof value === 'object' && value !== null) {
      for (const [nestedPath, nestedLeaf] of leavesOf(value as Record<string, unknown>, path)) {
        leaves.set(nestedPath, nestedLeaf)
      }
    }
  }
  return leaves
}

function publicReadMetaOf(leaf: unknown): unknown {
  return (leaf as { '~orpc': { meta: { publicRead?: unknown } } })['~orpc'].meta.publicRead
}

describe('publicRead metadata on the contract tree', () => {
  it('marks exactly the frozen sixteen public leaves — no more, no fewer', () => {
    const marked = [...leavesOf(publicContract).entries()]
      .filter(([, leaf]) => publicReadMetaOf(leaf) === true)
      .map(([key]) => key)
      .sort()
    expect(marked).toEqual([...PUBLIC_READ_KEYS].sort())
  })

  it.each(PUBLIC_READ_KEYS)('pins the frozen key %s at a real publicContract procedure', (key) => {
    const leaf = [...leavesOf(publicContract).entries()].find(([path]) => path === key)?.[1]
    expect(leaf, `${key} must resolve to a contract procedure`).toBeDefined()
    expect(isContractProcedure(leaf)).toBe(true)
    expect(publicReadMetaOf(leaf)).toBe(true)
  })

  it.each(['comments.getRaw', 'comments.myComments', 'comments.replyComment', 'comments.edit', 'comments.revokeToken'])(
    'keeps the token read / comment mutation %s unmarked',
    (key) => {
      const leaf = [...leavesOf(publicContract).entries()].find(([path]) => path === key)?.[1]
      expect(leaf, `${key} must resolve to a contract procedure`).toBeDefined()
      expect(publicReadMetaOf(leaf)).toBeUndefined()
    },
  )

  it('marks no account or admin leaf at all', () => {
    const offenders = [...leavesOf(accountContract).entries(), ...leavesOf(adminContract).entries()]
      .filter(([, leaf]) => publicReadMetaOf(leaf) !== undefined)
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('pins the literal meta type on a marked and an unmarked procedure', () => {
    expectTypeOf(publicContract.content.home['~orpc'].meta).toEqualTypeOf<PublicReadMeta>()
    expectTypeOf(publicContract.content.home['~orpc'].meta.publicRead).toEqualTypeOf<true>()
    expectTypeOf(publicContract.comments.getRaw['~orpc'].meta).toEqualTypeOf<NoMeta>()
    // @ts-expect-error — eligibility is the literal true, not a widened boolean
    expectTypeOf(publicContract.content.home['~orpc'].meta.publicRead).toEqualTypeOf<boolean>()
  })
})
