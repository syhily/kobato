import { describe, expect, it } from 'vitest'

import type { CommentItemWire } from '@/shared/contracts/comments'

import { commentTreeReducer, createCommentTreeState } from '@/ui/public/comments/Comments'
import { applyLikeOptimistic, createLikeButtonState } from '@/ui/public/LikeActions'

function makeComment(id: bigint, ownerId: bigint, name = 'Alice'): CommentItemWire {
  return {
    id: String(id),
    createAt: '2024-01-15T08:30:00.000Z',
    updatedAt: '2024-01-15T08:30:00.000Z',
    deleteAt: null,
    content: null,
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hello.' }],
      },
    ],
    type: 'post',
    ownerId: String(ownerId),
    userId: '42',
    isVerified: true,
    ua: '',
    ip: '',
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: '0',
    name,
    email: `${name.toLowerCase()}@example.com`,
    emailVerified: true,
    link: '',
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    children: [],
  }
}

describe('public detail island state reset', () => {
  it('resets like state when React Router reuses the detail route for another commentKey', () => {
    // The like API actions key off the metric's `public_id` UUID
    // (`commentKey`), so the in-memory state must echo that wire key
    // back when React Router reuses the detail-route module for a
    // different permalink. `permalink` lives on the consumer side as
    // the `localStorage` namespace and is intentionally not part of
    // `LikeButtonState` — keying both off the same field would let a
    // post id renumber across deployments and silently clobber a
    // visitor's like-token cache.
    let state = createLikeButtonState('comment-key-1', 3)
    state = applyLikeOptimistic(state, 'like')

    expect(state).toMatchObject({ commentKey: 'comment-key-1', likes: 4, liked: true })

    // Simulating route reuse: create fresh state for the new commentKey.
    state = createLikeButtonState('comment-key-2', 1)
    expect(state).toEqual({ commentKey: 'comment-key-2', likes: 1, liked: false })
  })

  it('resets the comment tree and clears active replies for another comment key', () => {
    const first = makeComment(1n, 1n)
    const second = makeComment(2n, 2n, 'Bob')

    let state = createCommentTreeState([first], 3)
    state = commentTreeReducer(state, { type: 'setReplyTo', rid: 1 })
    state = commentTreeReducer(state, {
      type: 'append',
      items: [makeComment(3n, 1n, 'Carol')],
      rootsLoaded: 2,
    })

    expect(state.replyToId).toBe(1)
    expect(state.items.map((item) => item.ownerId)).toEqual(['1', '1'])

    state = commentTreeReducer(state, {
      type: 'reset',
      items: [second],
      rootsTotal: 1,
      rootsLoaded: 1,
    })

    expect(state.replyToId).toBe(0)
    expect(state.rootsLoaded).toBe(1)
    expect(state.rootsTotal).toBe(1)
    expect(state.items).toEqual([second])
  })
})
