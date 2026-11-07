// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

vi.mock('@/client/hooks/use-logout', () => ({
  useLogout: () => vi.fn(),
}))

const control = mockTanstackQuery()

const { AppSidebarFooter } = await import('@/ui/admin/shell/AppSidebarFooter')

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppSidebarFooter id="1" name="管理员" email="admin@example.com" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
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
        <AppSidebarFooter id="1" name="管理员" email="admin@example.com" />
      </MemoryRouter>,
    )
    expect(container.querySelector('.bg-destructive')).toBeNull()
  })
})
