// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))

// VersionDialog (inside the footer) queries the GitHub avatar — the count no
// longer comes from react-query, but the shared mock supplies its slots.
mockTanstackQuery()

const { AppSidebarFooter } = await import('@/ui/admin/shell/AppSidebarFooter')

function renderFooter(unreadCount = 0, onOpenNotifications: () => void = () => {}) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppSidebarFooter
        id="1"
        name="管理员"
        email="admin@example.com"
        unreadCount={unreadCount}
        onOpenNotifications={onOpenNotifications}
      />
    </MemoryRouter>,
  )
}

describe('ui/admin/shell/AppSidebarFooter', () => {
  it('shows the unread dot on the avatar only with unread messages', () => {
    const { container, rerender } = renderFooter(5)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/admin']}>
        <AppSidebarFooter
          id="1"
          name="管理员"
          email="admin@example.com"
          unreadCount={0}
          onOpenNotifications={() => {}}
        />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('announces the unread count through the trigger aria-label', () => {
    renderFooter(3)
    expect(screen.getByLabelText('用户菜单，3 条未读消息')).toBeTruthy()
  })

  it('opens the shell-owned drawer from the 消息通知 menu item', () => {
    const onOpenNotifications = vi.fn()
    renderFooter(2, onOpenNotifications)
    fireEvent.click(screen.getByLabelText('用户菜单，2 条未读消息'))

    const item = screen.getByText('消息通知')
    expect(item).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()

    fireEvent.click(item)
    expect(onOpenNotifications).toHaveBeenCalledTimes(1)
  })
})
