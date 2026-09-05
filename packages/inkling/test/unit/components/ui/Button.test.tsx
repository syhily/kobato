import { render, screen } from '@testing-library/react'

import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('defaults to accent styling with rounded corners and shrink-0', () => {
    render(<Button value="Click" />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-accent')
    expect(button.className).toContain('text-white')
    expect(button.className).toContain('rounded-md')
    expect(button.className).toContain('shrink-0')
  })

  it('omits shrink-0 when shrink is set so long text can wrap', () => {
    render(<Button shrink value="Click" />)
    expect(screen.getByRole('button').className).not.toContain('shrink-0')
  })

  it('omits rounded-md when rounded is false', () => {
    render(<Button rounded={false} value="Click" />)
    expect(screen.getByRole('button').className).not.toContain('rounded-md')
  })

  it('dims the button when the value is empty', () => {
    render(<Button placeholder="Add button text" value="" />)
    expect(screen.getByRole('button').className).toContain('opacity-50')
  })

  it('does not leak the shrink prop onto the DOM element', () => {
    render(<Button shrink value="Click" />)
    expect(screen.getByRole('button')).not.toHaveAttribute('shrink')
  })

  it('keeps inkling’s full-width behavior', () => {
    render(<Button value="Click" width="full" />)
    expect(screen.getByRole('button').className).toContain('w-full')
  })
})
