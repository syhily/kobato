// @vitest-environment happy-dom

// Behavioral pins for the friend-apply dialog; `motion/react` is stubbed
// as a pass-through so AnimatePresence mounts/unmounts synchronously.

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
  // The Popup is lazy-loaded, so the dialog appears only once the chunk resolves.
  return screen.findByRole('dialog')
}

describe('FriendApplyForm dialog', () => {
  it('opens the dialog with the application fields and the honeypot tucked away', async () => {
    renderForm()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openDialog()

    expect(screen.getByPlaceholderText('站名')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('主页 URL')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('封面图 URL（可选）')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('RSS URL（可选）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交申请' })).toBeInTheDocument()
    const honeypot = screen.getByLabelText('Honeypot')
    expect(honeypot).toHaveAttribute('name', 'contact')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })

  it('closes on Escape and reopens with the form (state resets on close)', async () => {
    renderForm()
    await openDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openDialog()
    expect(screen.getByPlaceholderText('站名')).toBeInTheDocument()
  })
})
