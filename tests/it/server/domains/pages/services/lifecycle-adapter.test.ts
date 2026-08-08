import { describe, expect, it } from 'vitest'

import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'

// Pin for the draft-preview access rule (CONTEXT.md: pages allow admin
// only), against the real adapter.

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
