import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter'
import { describe, expect, it } from 'vitest'

// Pin for the post adapter's draft-preview access rule
// (CONTEXT.md "Draft preview": posts allow author and above). Runs
// against the real adapter — the it project's module graph no longer
// needs the DB-free import mocks the unit version carried.

describe('postLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { role: 'admin' as const, expected: true },
    { role: 'author' as const, expected: true },
    { role: 'visitor' as const, expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
  ])('returns $expected for role $role', ({ role, expected }) => {
    expect(postLifecycleAdapter.canPreviewDraft(role)).toBe(expected)
  })
})
