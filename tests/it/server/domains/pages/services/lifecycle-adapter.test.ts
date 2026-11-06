import { describe, expect, it } from 'vitest'

import type { PageMetaRow } from '@/server/infra/db/types'

import { adminUser, authorUser, regularUser } from '#/_helpers/session'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'

// Pin for the draft-preview access rule (CONTEXT.md: pages allow admin
// only), against the real adapter.

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
