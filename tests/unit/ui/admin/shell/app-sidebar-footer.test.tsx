// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
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

function renderFooter(unreadCount = 0) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppSidebarFooter id="1" name="管理员" email="admin@example.com" unreadCount={unreadCount} />
    </MemoryRouter>,
  )
}

describe('ui/admin/shell/AppSidebarFooter', () => {
  it('shows the unread dot on the avatar only with unread messages', () => {
    const { container, rerender } = renderFooter(5)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/admin']}>
        <AppSidebarFooter id="1" name="管理员" email="admin@example.com" unreadCount={0} />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('announces the unread count through the trigger aria-label', () => {
    renderFooter(3)
    expect(screen.getByLabelText('用户菜单，3 条未读消息')).toBeTruthy()
  })
})
