// @vitest-environment happy-dom

// Behavioral pins for the friend-apply dialog: the page shows only the
// trigger, the Popup owns the form (fields + off-screen honeypot), and a
// closed dialog reopens fresh.
//
// `motion/react` is stubbed as a pass-through (same pattern as
// tests/unit/ui/public/widgets/popup.test.tsx) so AnimatePresence
// mounts/unmounts synchronously — the tests pin dialog wiring, not
// animation timing.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FriendApplyForm } from '@/ui/public/friends/FriendApplyForm'

vi.mock('motion/react', () => {
  const MOTION_ONLY_PROPS = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'variants',
    'whileHover',
    'whileTap',
    'whileFocus',
    'whileDrag',
    'whileInView',
  ])
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

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <FriendApplyForm />
    </QueryClientProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: '申请友链' }))
  return screen.getByRole('dialog')
}

describe('FriendApplyForm dialog', () => {
  it('opens the dialog with the application fields and the honeypot tucked away', () => {
    renderForm()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    openDialog()

    expect(screen.getByPlaceholderText('站名')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('主页 URL')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('封面图 URL（可选）')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('RSS URL（可选）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交申请' })).toBeInTheDocument()
    const honeypot = screen.getByLabelText('Honeypot')
    expect(honeypot).toHaveAttribute('name', 'contact')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })

  it('closes on Escape and reopens with the form (state resets on close)', () => {
    renderForm()
    openDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    openDialog()
    expect(screen.getByPlaceholderText('站名')).toBeInTheDocument()
  })
})
