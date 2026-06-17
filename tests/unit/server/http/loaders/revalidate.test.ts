import { describe, expect, it } from 'vitest'

import { commentAwareRevalidate, isCommentAction } from '@/server/http/loaders/revalidate'

describe('commentAwareRevalidate', () => {
  it('returns false for known comment action paths', () => {
    const args = {
      formAction: '/api/comment/comments',
      defaultShouldRevalidate: true,
    } as any
    expect(commentAwareRevalidate(args)).toBe(false)
  })

  it('honours defaultShouldRevalidate for non-comment actions', () => {
    expect(
      commentAwareRevalidate({
        formAction: '/api/posts',
        defaultShouldRevalidate: true,
      } as any),
    ).toBe(true)

    expect(
      commentAwareRevalidate({
        formAction: '/api/posts',
        defaultShouldRevalidate: false,
      } as any),
    ).toBe(false)
  })

  it('treats a plain URL pathname as the action path', () => {
    expect(
      commentAwareRevalidate({
        formAction: 'https://example.com/api/comment/likes',
        defaultShouldRevalidate: true,
      } as any),
    ).toBe(false)
  })

  it('strips query string and matches the action path', () => {
    expect(
      commentAwareRevalidate({
        formAction: '/api/comment/all?foo=bar',
        defaultShouldRevalidate: true,
      } as any),
    ).toBe(false)
  })

  it('returns defaultShouldRevalidate for malformed action strings', () => {
    expect(
      commentAwareRevalidate({
        formAction: ':::not-a-url',
        defaultShouldRevalidate: true,
      } as any),
    ).toBe(true)
  })
})

describe('isCommentAction', () => {
  it('identifies comment action pathnames', () => {
    expect(isCommentAction('/api/comment/all')).toBe(true)
    expect(isCommentAction('/api/posts')).toBe(false)
  })

  it('returns false when formAction is undefined', () => {
    expect(isCommentAction(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isCommentAction('')).toBe(false)
  })
})
