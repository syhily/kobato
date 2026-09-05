import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from '@/components/ui/Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal onClose={() => {}}>content</Modal>)
    expect(container.firstChild).toBeNull()
  })

  it('renders content when open', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        Modal content
      </Modal>,
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('Modal content')
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        content
      </Modal>,
    )

    fireEvent.click(screen.getByRole('dialog').firstChild as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        content
      </Modal>,
    )

    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is activated with Enter', async () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        content
      </Modal>,
    )

    screen.getByLabelText('Close dialog').focus()
    await userEvent.keyboard('{Enter}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not swallow key presses inside children', async () => {
    const onKeyDown = vi.fn()
    document.addEventListener('keydown', onKeyDown)

    render(
      <Modal isOpen onClose={() => {}}>
        <input aria-label="note" />
      </Modal>,
    )

    const input = screen.getByLabelText('note')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
    expect(onKeyDown).toHaveBeenCalled()

    document.removeEventListener('keydown', onKeyDown)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        content
      </Modal>,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
