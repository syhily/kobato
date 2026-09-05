import { render, screen } from '@testing-library/react'

import { TextInput } from '@/components/ui/TextInput'

describe('TextInput', () => {
  it('passes a numeric maxLength through to the input', () => {
    render(<TextInput maxLength={10} data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('maxlength', '10')
  })

  it('passes a numeric-string maxLength through to the input', () => {
    render(<TextInput maxLength="25" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('maxlength', '25')
  })

  it('passes maxLength 0 through instead of dropping it', () => {
    render(<TextInput maxLength={0} data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('maxlength', '0')
  })

  it('omits maxLength for a non-numeric string instead of rendering NaN', () => {
    render(<TextInput maxLength="abc" data-testid="input" />)
    expect(screen.getByTestId('input')).not.toHaveAttribute('maxlength')
  })

  it('omits maxLength when it is absent or an empty string', () => {
    const { rerender } = render(<TextInput data-testid="input" />)
    expect(screen.getByTestId('input')).not.toHaveAttribute('maxlength')
    rerender(<TextInput maxLength="" data-testid="input" />)
    expect(screen.getByTestId('input')).not.toHaveAttribute('maxlength')
  })
})
