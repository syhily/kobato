// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))

const drawerProps = vi.fn()
vi.mock('@/ui/shared/notifications/LazyNotificationsDrawer', () => ({
  LazyNotificationsDrawer: (props: { open: boolean; isAdmin: boolean }) => {
    drawerProps(props)
    return null
  },
  warmNotificationsDrawerChunk: vi.fn(),
}))

const control = mockTanstackQuery()

const { AppSidebarFooter } = await import('@/ui/admin/shell/AppSidebarFooter')

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppSidebarFooter id="1" name="管理员" email="admin@example.com" role="admin" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  drawerProps.mockClear()
  control.query.data = { count: 0 }
  control.query.isPending = false
  control.query.isError = false
})

describe('ui/admin/shell/AppSidebarFooter', () => {
  it('shows the unread dot on the avatar only with unread messages', () => {
    control.query.data = { count: 5 }
    const { container, rerender } = renderFooter()
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    control.query.data = { count: 0 }
    rerender(
      <MemoryRouter initialEntries={['/admin']}>
        <AppSidebarFooter id="1" name="管理员" email="admin@example.com" role="admin" />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('announces the unread count through the trigger aria-label', () => {
    control.query.data = { count: 3 }
    renderFooter()
    expect(screen.getByLabelText('用户菜单，3 条未读消息')).toBeTruthy()
  })

  it('opens the notifications drawer from the 消息通知 menu item', () => {
    control.query.data = { count: 2 }
    renderFooter()
    fireEvent.click(screen.getByLabelText('用户菜单，2 条未读消息'))

    const item = screen.getByText('消息通知')
    expect(item).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()

    fireEvent.click(item)
    expect(drawerProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, isAdmin: true }))
  })
})
