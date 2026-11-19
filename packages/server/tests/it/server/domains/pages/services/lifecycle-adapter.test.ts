import type { PageMetaRow } from '@kobato/db/types.ts'

import { pageLifecycleAdapter } from '@kobato/server/domains/pages/services/lifecycle-adapter.ts'
import { adminUser, authorUser, regularUser } from '@kobato/server/tests/utils/session.ts'
import { describe, expect, it } from 'vitest'

const meta = { authorId: null } as PageMetaRow

describe('pageLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { label: 'admin', viewer: adminUser(), expected: true },
    { label: 'author', viewer: authorUser(), expected: false },
    { label: 'visitor', viewer: regularUser(), expected: false },
    { label: 'anonymous', viewer: null, expected: false },
    { label: 'missing viewer', viewer: undefined, expected: false },
  ])('returns $expected for $label', ({ viewer, expected }) => {
    expect(pageLifecycleAdapter.canPreviewDraft(viewer ?? undefined, meta)).toBe(expected)
  })
})
