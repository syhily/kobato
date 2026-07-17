// @vitest-environment happy-dom

// Behavioral pins for Popup-owned outside-click dismissal.
//
// `motion/react` is stubbed as a pass-through (same pattern as
// tests/snaps/ui/admin/musics/musics-add.test.tsx) so AnimatePresence
// mounts/unmounts synchronously — the tests pin dismissal wiring, not
// animation timing.

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Popup } from '@/ui/public/widgets/Popup'

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

// Canonical consumer wiring: the trigger owns `open`, Popup owns dismissal.
// In production a re-click on the open trigger passes through the inert
// subtree and lands on the backdrop (Popup inerts every other body child);
// the toggle below models the same end state.
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        trigger
      </button>
      <Popup open={open} onClose={() => setOpen(false)} aria-label="Test popup">
        <div>Popup body</div>
      </Popup>
    </>
  )
}

function getBackdrop(): HTMLElement {
  const wrapper = screen.getByRole('dialog').parentElement
  const backdrop = Array.from(wrapper?.children ?? []).find((el) => el.getAttribute('aria-hidden') === 'true')
  if (!(backdrop instanceof HTMLElement)) {
    throw new Error('popup backdrop not found')
  }
  return backdrop
}

describe('Popup — outside-click dismissal', () => {
  it('closes when the backdrop (outside click) is clicked', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(getBackdrop())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toggles closed when the trigger is re-clicked', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'trigger' })

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays open when clicking inside the dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))

    fireEvent.click(screen.getByText('Popup body'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
