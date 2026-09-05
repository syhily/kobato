import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SubscribeForm } from '@/components/ui/SubscribeForm'

describe('SubscribeForm', () => {
  it('renders with the provided value and button text', () => {
    render(<SubscribeForm value="me@example.com" buttonText="Subscribe" dataTestId="subscribe" />)

    expect(screen.getByDisplayValue('me@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe')).toBeInTheDocument()
  })

  it('calls onChange when the input changes', () => {
    const onChange = vi.fn()
    render(<SubscribeForm onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('adjusts padding for large button size', () => {
    const { container } = render(<SubscribeForm buttonSize="large" />)
    expect(container.firstChild).toHaveClass('p-[3px]')
  })

  it('disables the input when disabled is set', () => {
    render(<SubscribeForm disabled />)

    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('tabIndex', '-1')
  })

  it('updates the input when the value prop changes', () => {
    const { rerender } = render(<SubscribeForm value="me@example.com" />)
    expect(screen.getByDisplayValue('me@example.com')).toBeInTheDocument()

    rerender(<SubscribeForm value="you@example.com" />)
    expect(screen.getByDisplayValue('you@example.com')).toBeInTheDocument()
  })
})
