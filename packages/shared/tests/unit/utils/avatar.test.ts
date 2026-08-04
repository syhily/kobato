import { avatarImageUrl, DEFAULT_AVATAR_SIZE } from '@kobato/shared/utils/avatar'
import { describe, expect, it } from 'vitest'

describe('shared/utils/avatar', () => {
  it('defaults to the site-wide 120px size', () => {
    expect(DEFAULT_AVATAR_SIZE).toBe(120)
    expect(avatarImageUrl('42')).toBe('/images/avatar/42.png?s=120')
  })

  it('accepts an explicit size', () => {
    expect(avatarImageUrl('abc123', 256)).toBe('/images/avatar/abc123.png?s=256')
  })
})
