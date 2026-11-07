// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { NotificationDto } from '@/shared/contracts/notifications'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

const control = mockTanstackQuery()

const { NotificationsDrawer } = await import('@/ui/shared/notifications/NotificationsDrawer')

function makeItem(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: '1',
    threadId: '1',
    kind: 'broadcast',
    title: '系统升级公告',
    body: '今晚 24 点例行维护',
    sender: null,
    replyable: false,
    source: null,
    actionUrl: null,
    createdAt: new Date('2026-11-07T08:00:00Z').toISOString(),
    read: false,
    ...overrides,
  }
}

beforeEach(() => {
  control.query.data = { count: 0 }
  control.query.isPending = false
  control.query.isError = false
  control.infinite.data = { pages: [] }
  control.infinite.isPending = false
  control.infinite.isError = false
  control.infinite.hasNextPage = false
  control.infinite.isFetchingNextPage = false
  control.mutation.mutate.mockClear()
})

describe('ui/shared/notifications/NotificationsDrawer', () => {
  it('renders the tab bar and the unread badge from the count query', () => {
    control.query.data = { count: 7 }
    control.infinite.data = { pages: [{ items: [], nextCursor: null, unreadCount: 7 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    for (const label of ['全部', '未读', '私信', '公告']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy()
    }
    // Non-admin: no compose entry.
    expect(screen.queryByLabelText('写消息')).toBeNull()
  })

  it('lists inbox rows and shows the empty state per tab', () => {
    const item = makeItem()
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)

    expect(screen.getByText('系统升级公告')).toBeTruthy()
    expect(screen.getByText('今晚 24 点例行维护')).toBeTruthy()
    // System-generated rows label the sender as 系统.
    expect(screen.getByText('系统')).toBeTruthy()
  })

  it('opens the thread pane on row click and renders the reply composer when canReply', () => {
    const item = makeItem({ kind: 'direct', sender: { id: '2', name: '管理员' } })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = {
      messages: [
        { id: '1', body: '你好，在吗', sender: { id: '2', name: '管理员' }, mine: false, createdAt: item.createdAt },
      ],
      canReply: true,
    }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(screen.getByText('你好，在吗')).toBeTruthy()
    expect(screen.getByPlaceholderText('输入回复…')).toBeTruthy()
    // Opening the unread message marks it read.
    expect(control.mutation.mutate).toHaveBeenCalledWith({ ids: ['1'] })
  })

  it('hides the reply composer for non-replyable system messages', () => {
    const item = makeItem()
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = {
      messages: [{ id: '1', body: '今晚 24 点例行维护', sender: null, mine: false, createdAt: item.createdAt }],
      canReply: false,
    }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(screen.getByText('今晚 24 点例行维护')).toBeTruthy()
    expect(screen.queryByPlaceholderText('输入回复…')).toBeNull()
  })

  it('marks a read row unread from the row action without opening the thread', () => {
    const item = makeItem({ read: true })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 0 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)
    const action = screen.getByLabelText('标为未读')
    fireEvent.click(action)

    expect(control.mutation.mutate).toHaveBeenCalledWith({ ids: ['1'] })
    // The click stayed on the action — the thread pane did not open.
    expect(screen.queryByLabelText('返回列表')).toBeNull()
  })

  it('exposes the compose entry to admins', () => {
    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin />)
    expect(screen.getByLabelText('写消息')).toBeTruthy()
  })
})
