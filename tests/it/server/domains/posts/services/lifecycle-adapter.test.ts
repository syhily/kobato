import { describe, expect, it } from 'vitest'

import type { PostMetaRow } from '@/server/infra/db/types'

import { adminUser, authorUser, regularUser } from '#/_helpers/session'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'

// Pins CONTEXT.md "Draft preview": posts require author+ AND ownership —
// admins may preview anyone's draft, authors only their own.

const AUTHOR_ID = Number(authorUser().id)

function meta(authorId: number | null): PostMetaRow {
  return { authorId } as PostMetaRow
}

describe('postLifecycleAdapter.canPreviewDraft', () => {
  it.each([
    { label: 'admin on someone else’s draft', viewer: adminUser(), authorId: 99, expected: true },
    { label: 'admin on an orphaned draft', viewer: adminUser(), authorId: null, expected: true },
    { label: 'author on their own draft', viewer: authorUser(), authorId: AUTHOR_ID, expected: true },
    { label: 'author on another author’s draft', viewer: authorUser(), authorId: 99, expected: false },
    { label: 'author on an orphaned draft', viewer: authorUser(), authorId: null, expected: false },
    {
      label: 'visitor on a row that names them',
      viewer: regularUser(),
      authorId: Number(regularUser().id),
      expected: false,
    },
    { label: 'anonymous', viewer: null, authorId: AUTHOR_ID, expected: false },
    { label: 'missing viewer', viewer: undefined, authorId: AUTHOR_ID, expected: false },
  ])('returns $expected for $label', ({ viewer, authorId, expected }) => {
    expect(postLifecycleAdapter.canPreviewDraft(viewer ?? undefined, meta(authorId))).toBe(expected)
  })
})
