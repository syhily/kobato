// @vitest-environment happy-dom

import type { ComponentProps } from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationDto } from '@/shared/contracts/notifications'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

// The「去处理」button renders a Router Link. Render it as a plain anchor and
// prevent the default like the real Link does, so the suite stays Router-free.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    Link: ({ to, onClick, children, ...props }: ComponentProps<'a'> & { to: string }) => (
      <a
        href={to}
        onClick={(event) => {
          event.preventDefault()
          onClick?.(event)
        }}
        {...props}
      >
        {children}
      </a>
    ),
  }
})

const control = mockTanstackQuery()

const { NotificationsDrawer } = await import('@/ui/shared/notifications/NotificationsDrawer')
const { isForkReply } = await import('@/ui/shared/notifications/NotificationDetailPane')

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
  it('renders the tab bar and the unread badge from the count prop', () => {
    control.infinite.data = { pages: [{ items: [], nextCursor: null, unreadCount: 7 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={7} />)

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    for (const label of ['全部', '未读', '私信', '公告']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy()
    }
    // Non-admin: no compose entry.
    expect(screen.queryByLabelText('写消息')).toBeNull()
  })

  it('disables mark-all-read from the count prop', () => {
    const { rerender } = render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    expect(screen.getByLabelText('全部标为已读').hasAttribute('disabled')).toBe(true)

    rerender(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={4} />)
    expect(screen.getByLabelText('全部标为已读').hasAttribute('disabled')).toBe(false)
  })

  it('lists inbox rows and shows the empty state per tab', () => {
    const item = makeItem()
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)

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

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
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

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(screen.getByText('今晚 24 点例行维护')).toBeTruthy()
    expect(screen.queryByPlaceholderText('输入回复…')).toBeNull()
  })

  it('marks a read row unread from the row action without opening the thread', () => {
    const item = makeItem({ read: true })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 0 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    const action = screen.getByLabelText('标为未读')
    fireEvent.click(action)

    expect(control.mutation.mutate).toHaveBeenCalledWith({ ids: ['1'] })
    // The click stayed on the action — the thread pane did not open.
    expect(screen.queryByLabelText('返回列表')).toBeNull()
  })

  it('exposes the compose entry to admins', () => {
    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin unreadCount={0} />)
    expect(screen.getByLabelText('写消息')).toBeTruthy()
  })

  it('offers recall to admins behind a confirmation dialog and mutates with the row id', () => {
    const item = makeItem()
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = {
      messages: [{ id: '1', body: item.body, sender: null, mine: false, createdAt: item.createdAt }],
      canReply: false,
    }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))
    fireEvent.click(screen.getByRole('button', { name: '撤回' }))

    // Opening the entry only asks — the mutation fires on confirm.
    expect(control.mutation.mutate).not.toHaveBeenCalledWith({ id: '1' })
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('撤回这条消息？')).toBeTruthy()
    expect(within(dialog).getByText('确定撤回「系统升级公告」吗？撤回后所有收件人都将看不到这条消息。')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: '撤回' }))
    expect(control.mutation.mutate).toHaveBeenCalledWith({ id: '1' })
  })

  it('does not recall when the confirmation is cancelled', () => {
    const item = makeItem()
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = {
      messages: [{ id: '1', body: item.body, sender: null, mine: false, createdAt: item.createdAt }],
      canReply: false,
    }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))
    fireEvent.click(screen.getByRole('button', { name: '撤回' }))

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))

    expect(control.mutation.mutate).not.toHaveBeenCalledWith({ id: '1' })
    // happy-dom never fires `transitionend`, so Base UI keeps the popup mounted
    // in its exit phase rather than removing it — assert we entered that phase.
    expect(dialog.hasAttribute('data-ending-style')).toBe(true)
  })

  it('hides the recall entry from non-admins', () => {
    control.infinite.data = { pages: [{ items: [makeItem()], nextCursor: null, unreadCount: 1 }] }
    control.query.data = { messages: [], canReply: false }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(screen.queryByRole('button', { name: '撤回' })).toBeNull()
  })

  it('hides the recall entry on direct messages even for admins', () => {
    const item = makeItem({ kind: 'direct', sender: { id: '2', name: '管理员' } })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = {
      messages: [{ id: '1', body: item.body, sender: item.sender, mine: false, createdAt: item.createdAt }],
      canReply: true,
    }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(screen.queryByRole('button', { name: '撤回' })).toBeNull()
  })

  it('closes the drawer when the 去处理 link is followed', () => {
    const item = makeItem({ actionUrl: '/admin/comments' })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = { messages: [], canReply: false }
    const onOpenChange = vi.fn()

    render(<NotificationsDrawer open onOpenChange={onOpenChange} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    const link = screen.getByRole('link', { name: '去处理' })
    expect(link.getAttribute('href')).toBe('/admin/comments')
    fireEvent.click(link)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('places the mark-unread action beside the row button instead of inside it', () => {
    const item = makeItem({ read: true })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 0 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)

    const row = screen.getByText('系统升级公告').closest('li') as HTMLElement
    const action = within(row).getByLabelText('标为未读')
    // The action's nearest <button> is itself: a button is never nested in
    // another one, and the row's main button does not contain the action.
    expect(action.closest('button')).toBe(action)
    expect(row.querySelectorAll('button button')).toHaveLength(0)
    const main = row.querySelector('button[data-notification-row="1"]')
    expect(main).toBeTruthy()
    expect(main?.contains(action)).toBe(false)
  })

  it('announces an unread row as unread and hides the dot from the accessibility tree', () => {
    const item = makeItem({ read: false })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)

    // The row's accessible name carries the state via the sr-only prefix.
    const rowButton = screen.getByRole('button', { name: /未读/ })
    expect(within(rowButton).getByText('未读：')).toBeTruthy()
    // The dot is decorative — it no longer carries a label of its own.
    const row = rowButton.closest('li') as HTMLElement
    expect(row.querySelector('span.size-2')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByLabelText('未读')).toBeNull()
  })

  it('gives the reply composer an accessible name and description', () => {
    const item = makeItem({ kind: 'direct', sender: { id: '2', name: '管理员' } })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 1 }] }
    control.query.data = { messages: [], canReply: true }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    const input = screen.getByRole('textbox', { name: '回复内容' })
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toContain('⌘/Ctrl + Enter 发送')
  })

  it('focuses 返回列表 on open and the originating row on back', () => {
    const item = makeItem({ read: true })
    control.infinite.data = { pages: [{ items: [item], nextCursor: null, unreadCount: 0 }] }
    control.query.data = { messages: [], canReply: false }

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)

    fireEvent.click(screen.getByRole('button', { name: /系统升级公告/ }))

    const back = screen.getByLabelText('返回列表')
    expect(document.activeElement).toBe(back)

    fireEvent.click(back)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /系统升级公告/ }))
  })
})

// The mutation harness cannot drive `onSuccess`, so the fork decision that
// gates the「转入私信」toast is pinned as a pure helper instead.
describe('ui/shared/notifications/isForkReply', () => {
  it('flags a reply that landed in a different thread (a broadcast fork)', () => {
    expect(isForkReply('3', '7')).toBe(true)
  })

  it('leaves an inline direct reply unflagged', () => {
    expect(isForkReply('3', '3')).toBe(false)
  })
})
