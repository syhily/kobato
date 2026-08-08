import { describe, expect, it } from 'vitest'

import { commentBadgeTextColor, withCommentBadgeTextColor } from '@/server/domains/comments/badge'

describe('services/comments/badge', () => {
  it('uses dark text for light badge backgrounds', () => {
    expect(commentBadgeTextColor('#6ab7ca')).toBe('#151b2b')
  })

  it('uses light text for dark badge backgrounds', () => {
    expect(commentBadgeTextColor('#172554')).toBe('#ffffff')
  })

  it('computes the text color only when a badge is present', () => {
    expect(withCommentBadgeTextColor({ badgeName: '站长', badgeColor: '#6ab7ca' }).badgeTextColor).toBe('#151b2b')
    expect(withCommentBadgeTextColor({ badgeName: null, badgeColor: '#6ab7ca' }).badgeTextColor).toBeNull()
  })

  it('honours an explicit text-colour override when present', () => {
    expect(
      withCommentBadgeTextColor({
        badgeName: '站长',
        badgeColor: '#6ab7ca',
        badgeTextColor: '#ff00aa',
      }).badgeTextColor,
    ).toBe('#ff00aa')
  })

  it('falls back to the auto-pick when the override is empty or whitespace', () => {
    expect(
      withCommentBadgeTextColor({ badgeName: '站长', badgeColor: '#6ab7ca', badgeTextColor: '   ' }).badgeTextColor,
    ).toBe('#151b2b')
    expect(
      withCommentBadgeTextColor({ badgeName: '站长', badgeColor: '#6ab7ca', badgeTextColor: null }).badgeTextColor,
    ).toBe('#151b2b')
  })

  it('returns null even if an override is set when the badge is absent', () => {
    expect(
      withCommentBadgeTextColor({
        badgeName: null,
        badgeColor: '#6ab7ca',
        badgeTextColor: '#ff00aa',
      }).badgeTextColor,
    ).toBeNull()
  })
})
