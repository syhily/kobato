import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { Spinner } from '@/components/ui/Spinner'

describe('Spinner', () => {
  it('renders with default size', () => {
    render(<Spinner />)
    expect(screen.getByTestId('spinner')).toHaveClass('size-6')
  })

  it('renders with mini size', () => {
    render(<Spinner size="mini" />)
    expect(screen.getByTestId('spinner')).toHaveClass('size-3')
  })

  it('renders with small size', () => {
    render(<Spinner size="small" />)
    expect(screen.getByTestId('spinner')).toHaveClass('size-4')
  })
})
