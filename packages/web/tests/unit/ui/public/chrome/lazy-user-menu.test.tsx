// @vitest-environment happy-dom

import type { HeaderCurrentUser } from '@kobato/web/ui/public/chrome/Header.tsx'

import { diffHtmlStructures } from '@kobato/test/dom-structure.ts'
import { wrapWithI18n } from '@kobato/test/i18n-render.tsx'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/web/ui/shared/auth/use-logout.ts', () => ({
  useLogout: () => vi.fn(),
}))

const { LazyUserMenu } = await import('@kobato/web/ui/public/chrome/LazyUserMenu.tsx')
const { UserMenu } = await import('@kobato/web/ui/public/chrome/UserMenu.tsx')

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
    // Resolve the chunk the lazy boundary imports, so the assertions never
    // race module loading when the full suite saturates the machine.
    await import('@kobato/web/ui/public/chrome/UserMenu.tsx')

    renderLazy(1)
    fireEvent.click(screen.getByLabelText('用户菜单，1 条未读消息'))
    await settle()

    expect(screen.getByText('消息通知')).toBeTruthy()

    // Close via Escape, then reopen by clicking the (now real) trigger — the
    // mounted menu survives instead of falling back to the placeholder.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('用户菜单，1 条未读消息'))
    await settle()
    expect(screen.getByText('消息通知')).toBeTruthy()
  }, 15_000)

  it('moves focus into the open menu after a keyboard activation (Base UI virtual focus)', async () => {
    await import('@kobato/web/ui/public/chrome/UserMenu.tsx')

    renderLazy()
    fireEvent.click(screen.getByLabelText('用户菜单'), { detail: 0 })
    await settle()

    expect(document.activeElement?.getAttribute('role')).toBe('menu')
  }, 15_000)

  // The placeholder must mirror the real UserMenu trigger subtree exactly —
  // the mount-time swap has to be visually invisible (the music-player
  // fallback parity pin uses the same helper).
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
      // Base UI's trigger wiring adds ids/data-* the static placeholder
      // cannot know; the visual skeleton is the contract.
      { dataAttributes: [], attributes: ['aria-label'] },
    )
    placeholder.unmount()
    real.unmount()
    expect(diffs).toEqual([])
  })
})
