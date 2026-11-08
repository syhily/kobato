// @vitest-environment happy-dom

import type { ComponentProps } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { asRoute } from '#/_helpers/route-test-utils'
import AdminInstallRouteRaw from '@/routes/auth/setup'

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    Form: (props: ComponentProps<'form'>) => <form {...props} />,
    useNavigation: () => ({ state: 'idle', formMethod: null }),
    useRouteLoaderData: () => undefined,
  }
})

const AdminInstallRoute = asRoute(AdminInstallRouteRaw)

function setupPage(setupTokenVerified: boolean) {
  return wrapWithI18n(
    <MemoryRouter>
      <AdminInstallRoute loaderData={{ setupTokenVerified, csrfToken: 'csrf-setup' }} />
    </MemoryRouter>,
  )
}

describe('routes/auth/setup locale selection', () => {
  it('keeps the first-screen choice through token verification and submits it with the install form', async () => {
    const view = render(setupPage(false))

    const select = screen.getByRole('combobox', { name: '站点语言' })
    fireEvent.click(select)
    const english = await screen.findByRole('option', { name: 'English (United States)' })
    fireEvent.pointerDown(english)
    fireEvent.click(english)
    await waitFor(() => expect(select.textContent).toContain('English (United States)'))

    view.rerender(setupPage(true))

    const input = document.querySelector<HTMLInputElement>('input[name="locale"]')
    expect(input?.value).toBe('en-US')
    expect(screen.getByRole('combobox', { name: '站点语言' }).textContent).toContain('English (United States)')
  })
})
