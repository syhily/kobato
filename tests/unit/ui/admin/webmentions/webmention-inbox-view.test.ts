import type { InfiniteData } from '@tanstack/react-query'

import { describe, expect, it } from 'vitest'

import type { AdminWebmentionWire } from '@/shared/contracts/webmentions'

import { moderateMentionInPages, type AdminWebmentionsPage } from '@/ui/admin/webmentions/WebmentionInboxView'

function makeMention(overrides: Partial<AdminWebmentionWire> = {}): AdminWebmentionWire {
  return {
    id: '1',
    sourceUrl: 'https://sender.example/post',
    targetUrl: 'https://example.com/posts/wm-target/',
    targetType: 'post',
    status: 'pending',
    type: 'mention',
    authorName: 'Jane Doe',
    title: 'A mention',
    summary: null,
    fetchedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    moderatedAt: null,
    ...overrides,
  }
}

function makeData(mentions: AdminWebmentionWire[]): InfiniteData<AdminWebmentionsPage, number> {
  return {
    pages: [
      {
        mentions,
        total: mentions.length,
        hasMore: false,
        statusCounts: {
          all: mentions.length,
          pending: mentions.filter((m) => m.status === 'pending').length,
          approved: mentions.filter((m) => m.status === 'approved').length,
          rejected: mentions.filter((m) => m.status === 'rejected').length,
        },
      },
    ],
    pageParams: [0],
  }
}

// The inbox's local cache patch after a moderation mutation (no refetch)
// — the UI logic half of what used to sit in the contracts test file.
describe('ui / moderateMentionInPages (admin inbox cache patch)', () => {
  it('updates the row in place under the `all` filter and shifts the counts', () => {
    const data = makeData([makeMention({ id: '1' }), makeMention({ id: '2', status: 'approved' })])
    const next = moderateMentionInPages(data, '1', 'approved', 'all')

    const page = next.pages[0]!
    expect(page.mentions.find((m) => m.id === '1')?.status).toBe('approved')
    expect(page.mentions).toHaveLength(2)
    expect(page.statusCounts).toEqual({ all: 2, pending: 0, approved: 2, rejected: 0 })
  })

  it('removes the row under a non-`all` filter (it no longer matches)', () => {
    const data = makeData([makeMention({ id: '1' }), makeMention({ id: '2' })])
    const next = moderateMentionInPages(data, '1', 'rejected', 'pending')

    const page = next.pages[0]!
    expect(page.mentions.map((m) => m.id)).toEqual(['2'])
    expect(page.statusCounts).toEqual({ all: 2, pending: 1, approved: 0, rejected: 1 })
  })

  it('leaves pages without the row untouched', () => {
    const data = makeData([makeMention({ id: '1' })])
    const next = moderateMentionInPages(data, '999', 'approved', 'all')
    expect(next.pages[0]).toBe(data.pages[0])
  })
})
