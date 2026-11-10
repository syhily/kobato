// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))

// VersionDialog (inside the footer) queries the GitHub avatar through
// react-query, so the shared mock supplies its slots — the unread count
// arrives as a prop.
mockTanstackQuery()

const { AppSidebarFooter } = await import('@/ui/admin/shell/AppSidebarFooter')

function footer(unreadCount = 0) {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <AppSidebarFooter id="1" name="管理员" email="admin@example.com" unreadCount={unreadCount} />
    </MemoryRouter>
  )
}

function renderFooter(unreadCount = 0) {
  return render(wrapWithI18n(footer(unreadCount)))
}

describe('ui/admin/shell/AppSidebarFooter', () => {
  it('shows the unread dot on the avatar only with unread messages', () => {
    const { container, rerender } = renderFooter(5)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()

    rerender(wrapWithI18n(footer(0)))
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })

  it('announces the unread count through the trigger aria-label', () => {
    renderFooter(3)
    expect(screen.getByLabelText('用户菜单，3 条未读消息')).toBeTruthy()
  })
})
