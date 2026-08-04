import { commentBadgeTextColor, withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge'
import { describe, expect, it } from 'vitest'

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
    // Admin-set override should win over the WCAG auto-pick. The
    // background here would otherwise resolve to dark text (#151b2b),
    // but the override forces white — which is the whole point of the
    // user-facing setting.
    expect(
      withCommentBadgeTextColor({
        badgeName: '站长',
        badgeColor: '#6ab7ca',
        badgeTextColor: '#ff00aa',
      }).badgeTextColor,
    ).toBe('#ff00aa')
  })

  it('falls back to the auto-pick when the override is empty or whitespace', () => {
    // Empty/whitespace overrides are treated as "no override" so
    // accidentally clearing the picker (or seeding rows with empty
    // strings) does not leave the badge with `color: ''`.
    expect(
      withCommentBadgeTextColor({ badgeName: '站长', badgeColor: '#6ab7ca', badgeTextColor: '   ' }).badgeTextColor,
    ).toBe('#151b2b')
    expect(
      withCommentBadgeTextColor({ badgeName: '站长', badgeColor: '#6ab7ca', badgeTextColor: null }).badgeTextColor,
    ).toBe('#151b2b')
  })

  it('returns null even if an override is set when the badge is absent', () => {
    // No badge → nothing to colour. Override is ignored so the public
    // renderer doesn't accidentally show a styled empty span.
    expect(
      withCommentBadgeTextColor({
        badgeName: null,
        badgeColor: '#6ab7ca',
        badgeTextColor: '#ff00aa',
      }).badgeTextColor,
    ).toBeNull()
  })
})
