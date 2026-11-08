// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))

const { UserMenu } = await import('@/ui/public/chrome/UserMenu')

const currentUser: HeaderCurrentUser = {
  id: '1',
  name: '管理员',
  role: 'admin',
}

function renderMenu(unreadCount = 0, onOpenNotifications: () => void = () => {}, defaultOpen = false) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <UserMenu
        currentUser={currentUser}
        logoutRedirectTo="/"
        unreadCount={unreadCount}
        onOpenNotifications={onOpenNotifications}
        defaultOpen={defaultOpen}
      />
    </MemoryRouter>,
  )
}

describe('ui/public/chrome/UserMenu', () => {
  it('shows the red dot on the avatar trigger only with unread messages', () => {
    const { container, rerender } = renderMenu(2)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <UserMenu currentUser={currentUser} logoutRedirectTo="/" unreadCount={0} onOpenNotifications={() => {}} />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('renders the notifications item with the unread badge from the prop', () => {
    renderMenu(4)
    fireEvent.click(screen.getByLabelText('用户菜单，4 条未读消息'))

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('keeps the plain aria-label when nothing is unread', () => {
    renderMenu()
    expect(screen.getByLabelText('用户菜单')).toBeTruthy()
  })

  it('mounts with the menu already open when defaultOpen is set (LazyUserMenu activation)', async () => {
    renderMenu(3, () => {}, true)

    expect(await screen.findByText('消息通知')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('opens the shell-owned drawer from the 消息通知 item', () => {
    const onOpenNotifications = vi.fn()
    renderMenu(1, onOpenNotifications)
    fireEvent.click(screen.getByLabelText('用户菜单，1 条未读消息'))

    fireEvent.click(screen.getByText('消息通知'))
    expect(onOpenNotifications).toHaveBeenCalledTimes(1)
  })
})
