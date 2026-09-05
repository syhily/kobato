import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PlusButton, PlusMenu } from '@/components/ui/PlusMenu'

describe('PlusMenu', () => {
  it('renders children inside the plus menu container', () => {
    render(
      <PlusMenu>
        <span>Menu item</span>
      </PlusMenu>,
    )

    expect(screen.getByText('Menu item')).toBeInTheDocument()
    expect(screen.getByText('Menu item').parentElement).toHaveAttribute('data-inkling-plus-menu')
  })

  it('renders a plus button and calls onClick', () => {
    const onClick = vi.fn()
    render(<PlusButton onClick={onClick} />)

    screen.getByLabelText('Add a card').click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
