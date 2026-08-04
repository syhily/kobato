import { applyLikeOptimistic, createLikeButtonState } from '@kobato/ui/public/LikeActions'
import { describe, expect, it } from 'vitest'

describe('createLikeButtonState', () => {
  it('creates an unliked state with the given key and likes', () => {
    expect(createLikeButtonState('key-1', 42)).toEqual({ commentKey: 'key-1', likes: 42, liked: false })
  })
})

describe('applyLikeOptimistic', () => {
  it('increments likes and marks liked on like action', () => {
    const state = createLikeButtonState('key-1', 5)
    expect(applyLikeOptimistic(state, 'like')).toEqual({ commentKey: 'key-1', likes: 6, liked: true })
  })

  it('decrements likes and unmarks liked on unlike action', () => {
    const state = { commentKey: 'key-1', likes: 5, liked: true }
    expect(applyLikeOptimistic(state, 'unlike')).toEqual({ commentKey: 'key-1', likes: 4, liked: false })
  })

  it('does not decrement below zero', () => {
    const state = { commentKey: 'key-1', likes: 0, liked: true }
    expect(applyLikeOptimistic(state, 'unlike')).toEqual({ commentKey: 'key-1', likes: 0, liked: false })
  })
})
