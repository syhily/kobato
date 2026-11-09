// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { SearchIconButton } from '@/ui/public/Search'

vi.mock('motion/react', () => {
  const MOTION_ONLY_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap'])
  const MotionStub = ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => {
    for (const key of MOTION_ONLY_PROPS) {
      delete rest[key]
    }
    return <div {...rest}>{children}</div>
  }
  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    motion: new Proxy({}, { get: () => MotionStub }),
  }
})

describe('SearchIconButton popup focus', () => {
  it('opens without activating the search input', async () => {
    const router = createMemoryRouter([{ path: '/', element: <SearchIconButton /> }])
    render(wrapWithI18n(<RouterProvider router={router} />))

    fireEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    const input = await screen.findByRole('searchbox', { name: '搜索文章' })
    const dialog = screen.getByRole('dialog', { name: '搜索文章' })

    await waitFor(() => expect(dialog).toHaveFocus())
    expect(input).not.toHaveFocus()
  })
})
