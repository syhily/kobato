import { pageLifecycleAdapter } from '@kobato/server/domains/pages/services/lifecycle-adapter'
import { describe, expect, it } from 'vitest'

// Pin for the page adapter's draft-preview access rule
// (CONTEXT.md "Draft preview": pages allow admin only). Runs against
// the real adapter — the it project's module graph no longer needs the
// DB-free import mocks the unit version carried.

describe('pageLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { role: 'admin' as const, expected: true },
    { role: 'author' as const, expected: false },
    { role: 'visitor' as const, expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
  ])('returns $expected for role $role', ({ role, expected }) => {
    expect(pageLifecycleAdapter.canPreviewDraft(role)).toBe(expected)
  })
})
