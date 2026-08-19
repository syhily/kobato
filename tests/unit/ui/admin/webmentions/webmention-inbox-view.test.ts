import type { InfiniteData } from '@tanstack/react-query'

import { describe, expect, it } from 'vitest'

import type { AdminWebmentionWire } from '@/shared/contracts/webmentions'

import {
  applyReverifyToPages,
  moderateMentionInPages,
  type AdminWebmentionsPage,
} from '@/ui/admin/webmentions/WebmentionInboxView'

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
    verificationStatus: 'verified',
    lastVerifiedAt: null,
    lastError: null,
    verifyFailStreak: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
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
          hidden: mentions.filter((m) => m.status === 'hidden').length,
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
    expect(page.statusCounts).toEqual({ all: 2, pending: 0, approved: 2, rejected: 0, hidden: 0 })
  })

  it('removes the row under a non-`all` filter (it no longer matches)', () => {
    const data = makeData([makeMention({ id: '1' }), makeMention({ id: '2' })])
    const next = moderateMentionInPages(data, '1', 'rejected', 'pending')

    const page = next.pages[0]!
    expect(page.mentions.map((m) => m.id)).toEqual(['2'])
    expect(page.statusCounts).toEqual({ all: 2, pending: 1, approved: 0, rejected: 1, hidden: 0 })
  })

  it('shifts the hidden count when a hidden row is rejected', () => {
    const data = makeData([makeMention({ id: '1', status: 'hidden', verificationStatus: 'failed' })])
    const next = moderateMentionInPages(data, '1', 'rejected', 'all')

    const page = next.pages[0]!
    expect(page.mentions.find((m) => m.id === '1')?.status).toBe('rejected')
    expect(page.statusCounts).toEqual({ all: 1, pending: 0, approved: 0, rejected: 1, hidden: 0 })
  })

  it('leaves pages without the row untouched', () => {
    const data = makeData([makeMention({ id: '1' })])
    const next = moderateMentionInPages(data, '999', 'approved', 'all')
    expect(next.pages[0]).toBe(data.pages[0])
  })
})

// The inbox's local cache patch after a manual re-verification: the
// server row is authoritative, and a hidden row restored to approved
// leaves the 已隐藏 filter while the counts shift.
describe('ui / applyReverifyToPages (admin reverify cache patch)', () => {
  const verified = makeMention({
    id: '1',
    status: 'approved',
    verificationStatus: 'verified',
    lastError: null,
    verifyFailStreak: 0,
  })

  it('restores a hidden row to approved in place under the `all` filter', () => {
    const data = makeData([makeMention({ id: '1', status: 'hidden', verificationStatus: 'failed' })])
    const next = applyReverifyToPages(data, verified, 'all')

    const page = next.pages[0]!
    expect(page.mentions.find((m) => m.id === '1')).toEqual(verified)
    expect(page.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, rejected: 0, hidden: 0 })
  })

  it('drops the row under the `hidden` filter once restored', () => {
    const data = makeData([makeMention({ id: '1', status: 'hidden', verificationStatus: 'failed' })])
    const next = applyReverifyToPages(data, verified, 'hidden')

    const page = next.pages[0]!
    expect(page.mentions).toHaveLength(0)
    expect(page.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, rejected: 0, hidden: 0 })
  })

  it('updates a failed pending row in place without touching the counts', () => {
    const recovered = makeMention({ id: '1', verificationStatus: 'verified', lastError: null })
    const data = makeData([makeMention({ id: '1', verificationStatus: 'failed', lastError: 'boom' })])
    const next = applyReverifyToPages(data, recovered, 'pending')

    const page = next.pages[0]!
    expect(page.mentions.find((m) => m.id === '1')).toEqual(recovered)
    expect(page.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, rejected: 0, hidden: 0 })
  })

  it('leaves pages without the row untouched', () => {
    const data = makeData([makeMention({ id: '1' })])
    const next = applyReverifyToPages(data, { ...verified, id: '999' }, 'all')
    expect(next.pages[0]).toBe(data.pages[0])
  })
})
