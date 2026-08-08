import { describe, expect, it } from 'vitest'

import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'

// Pins CONTEXT.md "Draft preview": posts allow author and above, against
// the real adapter.

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
