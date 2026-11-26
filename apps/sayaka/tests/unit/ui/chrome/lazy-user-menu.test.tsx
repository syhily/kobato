// @vitest-environment happy-dom

import type { HeaderCurrentUser } from '@sayaka/ui/chrome/Header'

import { diffHtmlStructures } from '@kobato/test/dom-structure'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'

const useLogoutSpy = vi.spyOn(await import('@kobato/web-kit/ui/shared/auth/use-logout'), 'useLogout')
useLogoutSpy.mockImplementation((() => vi.fn()) as never)

afterAll(() => {
  useLogoutSpy.mockRestore()
})

const { LazyUserMenu } = await import('@sayaka/ui/chrome/LazyUserMenu')
const { UserMenu } = await import('@sayaka/ui/chrome/UserMenu')

const currentUser: HeaderCurrentUser = { id: '1', name: '管理员', role: 'admin' }

const defaultProps = {
  currentUser,
  logoutRedirectTo: '/',
  onOpenNotifications: () => {},
}

function renderLazy(unreadCount: number | null = 0) {
  return render(
    wrapWithI18n(
      <MemoryRouter initialEntries={['/']}>
        <LazyUserMenu {...defaultProps} unreadCount={unreadCount} />
      </MemoryRouter>,
    ),
  )
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('ui/public/chrome/LazyUserMenu', () => {
  it('renders only the static trigger placeholder before interaction (SSR-stable)', () => {
    const { container } = renderLazy(2)
    expect(screen.getByLabelText('用户菜单，2 条未读消息')).toBeTruthy()
    expect(container.querySelector('.bg-destructive')).not.toBeNull()
    expect(screen.queryByText('消息通知')).toBeNull()
  })

  it('mounts the real menu OPEN on the first click and keeps it mounted after close', async () => {
    await import('@sayaka/ui/chrome/UserMenu')

    renderLazy(1)
    fireEvent.click(screen.getByLabelText('用户菜单，1 条未读消息'))
    await settle()

    expect(screen.getByText('消息通知')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('用户菜单，1 条未读消息'))
    await settle()
    expect(screen.getByText('消息通知')).toBeTruthy()
  }, 15_000)

  it('moves focus into the open menu after a keyboard activation (Base UI virtual focus)', async () => {
    await import('@sayaka/ui/chrome/UserMenu')

    renderLazy()
    fireEvent.click(screen.getByLabelText('用户菜单'), { detail: 0 })
    await settle()

    expect(document.activeElement?.getAttribute('role')).toBe('menu')
  }, 15_000)

  it('keeps the placeholder trigger markup-identical to the real trigger', () => {
    const placeholder = renderLazy(2)
    const real = render(
      wrapWithI18n(
        <MemoryRouter initialEntries={['/']}>
          <UserMenu {...defaultProps} unreadCount={2} />
        </MemoryRouter>,
      ),
    )
    const diffs = diffHtmlStructures(
      within(real.container as HTMLElement).getByLabelText('用户菜单，2 条未读消息').outerHTML,
      within(placeholder.container as HTMLElement).getByLabelText('用户菜单，2 条未读消息').outerHTML,
      { dataAttributes: [], attributes: ['aria-label'] },
    )
    placeholder.unmount()
    real.unmount()
    expect(diffs).toEqual([])
  })
})
