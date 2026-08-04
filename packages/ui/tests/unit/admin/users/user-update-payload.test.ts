import { buildUserUpdatePayload, type UserEditFields } from '@kobato/ui/admin/users/user-update-payload'
import { describe, expect, it } from 'vitest'

function makeFields(overrides: Partial<UserEditFields> = {}): UserEditFields {
  return {
    name: overrides.name ?? 'Alice',
    email: overrides.email ?? 'alice@example.com',
    link: overrides.link ?? '',
    badgeName: overrides.badgeName ?? '',
    badgeColor: overrides.badgeColor ?? '',
    useTextOverride: overrides.useTextOverride ?? false,
    badgeTextColor: overrides.badgeTextColor ?? '#ffffff',
  }
}

describe('buildUserUpdatePayload', () => {
  it('always sends name and email, even when empty', () => {
    const payload = buildUserUpdatePayload(makeFields({ name: '', email: '' }))
    expect(payload.name).toBe('')
    expect(payload.email).toBe('')
  })

  it('omits optional link and badge fields when they are empty', () => {
    const payload = buildUserUpdatePayload(makeFields())
    expect(payload).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
      badgeTextColor: null,
    })
    expect('link' in payload).toBe(false)
    expect('badgeName' in payload).toBe(false)
    expect('badgeColor' in payload).toBe(false)
  })

  it('includes optional link and badge fields when they are non-empty', () => {
    const payload = buildUserUpdatePayload(
      makeFields({ link: 'https://example.com', badgeName: 'VIP', badgeColor: '#ff0000' }),
    )
    expect(payload.link).toBe('https://example.com')
    expect(payload.badgeName).toBe('VIP')
    expect(payload.badgeColor).toBe('#ff0000')
  })

  it('sends badgeColor independently of badgeName', () => {
    const payload = buildUserUpdatePayload(makeFields({ badgeColor: '#007a82' }))
    expect(payload.badgeColor).toBe('#007a82')
    expect('badgeName' in payload).toBe(false)
  })

  it('sends badgeTextColor as null when the text-color override is off', () => {
    // Even with a picked color present, the null tells the server to clear
    // the override and use automatic black/white contrast.
    const payload = buildUserUpdatePayload(makeFields({ useTextOverride: false, badgeTextColor: '#123456' }))
    expect(payload.badgeTextColor).toBeNull()
  })

  it('sends badgeTextColor when the text-color override is on', () => {
    const payload = buildUserUpdatePayload(makeFields({ useTextOverride: true, badgeTextColor: '#123456' }))
    expect(payload.badgeTextColor).toBe('#123456')
  })
})
