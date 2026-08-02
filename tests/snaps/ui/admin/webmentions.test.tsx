import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminWebmentionWire } from '@/shared/contracts/webmentions'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { WebmentionInboxView } from '@/ui/admin/webmentions/WebmentionInboxView'
import { WebmentionsView } from '@/ui/admin/webmentions/WebmentionsView'

const queryMocks = mockTanstackQuery()

function makeMention(overrides: Partial<AdminWebmentionWire> = {}): AdminWebmentionWire {
  return {
    id: '1',
    sourceUrl: 'https://sender.example/mentioning-post',
    targetUrl: 'https://example.com/posts/wm-target/',
    targetType: 'post',
    status: 'pending',
    type: 'mention',
    authorName: 'Jane Doe',
    title: '提及了你的文章',
    summary: '一段摘要。',
    fetchedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    moderatedAt: null,
    ...overrides,
  }
}

function inboxPage(mentions: AdminWebmentionWire[]) {
  return {
    mentions,
    total: mentions.length,
    hasMore: false,
    statusCounts: { all: mentions.length, pending: 1, approved: 1, rejected: 1 },
  }
}

beforeEach(() => {
  queryMocks.infinite = {
    data: { pages: [] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  }
  queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  queryMocks.queryClient = { invalidateQueries: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() }
})

describe('snapshot: WebmentionInboxView', () => {
  it('renders the empty state', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    expect(html).toContain('暂无收到的 Webmention')
  })

  it('renders status badges and only offers actions on pending rows', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          inboxPage([
            makeMention({ id: '1', status: 'pending' }),
            makeMention({ id: '2', status: 'approved', type: 'like', title: '通过的提及' }),
            makeMention({ id: '3', status: 'rejected', type: 'reply', title: '屏蔽的提及' }),
          ]),
        ],
      },
    }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    expect(html).toContain('待审核')
    expect(html).toContain('已批准')
    expect(html).toContain('已拒绝')
    // Response-type badges ride alongside the status badges.
    expect(html).toContain('喜欢')
    expect(html).toContain('回应')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('提及了你的文章')
    expect(html).toContain('一段摘要。')
    expect(html).toContain('https://example.com/posts/wm-target/')
    // Exactly one pending row → exactly one action pair: each label
    // appears as tab trigger + status badge + action button = 3.
    expect(html.match(/批准/g)).toHaveLength(3)
    expect(html.match(/拒绝/g)).toHaveLength(3)
  })

  it('renders the status filter tabs', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionInboxView />, '/admin/webmentions'))
    for (const label of ['全部', '待审核', '已批准', '已拒绝']) {
      expect(html).toContain(label)
    }
  })
})

describe('snapshot: WebmentionsView', () => {
  it('renders the page header with both direction tabs, inbox active by default', () => {
    queryMocks.infinite = { ...queryMocks.infinite, data: { pages: [inboxPage([])] } }
    const html = stableHtml(renderInRouter(<WebmentionsView />, '/admin/webmentions'))
    expect(html).toContain('Webmention 管理')
    expect(html).toContain('接收审核')
    expect(html).toContain('发送日志')
    // Inbox is the default tab — its empty state renders.
    expect(html).toContain('暂无收到的 Webmention')
  })
})
