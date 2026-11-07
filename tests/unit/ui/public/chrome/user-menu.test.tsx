// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))
vi.mock('@/ui/shared/notifications/LazyNotificationsDrawer', () => ({
  LazyNotificationsDrawer: () => null,
  warmNotificationsDrawerChunk: vi.fn(),
}))

const control = mockTanstackQuery()

const { UserMenu } = await import('@/ui/public/chrome/UserMenu')

const currentUser: HeaderCurrentUser = {
  id: '1',
  name: '管理员',
  role: 'admin',
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <UserMenu currentUser={currentUser} logoutRedirectTo="/" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  control.query.data = { count: 0 }
  control.query.isPending = false
  control.query.isError = false
})

describe('ui/public/chrome/UserMenu', () => {
  it('shows the red dot on the avatar trigger only with unread messages', () => {
    control.query.data = { count: 2 }
    const { container, rerender } = renderMenu()
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    control.query.data = { count: 0 }
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <UserMenu currentUser={currentUser} logoutRedirectTo="/" />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('renders the notifications item with the unread badge inside the menu', () => {
    control.query.data = { count: 4 }
    renderMenu()
    fireEvent.click(screen.getByLabelText('用户菜单'))

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
  })
})
