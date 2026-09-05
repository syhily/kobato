import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import Portal from '@/components/ui/Portal'

describe('Portal', () => {
  it('renders children in a portal attached to document.body', () => {
    render(
      <Portal data-testid="portal">
        <span>Ported content</span>
      </Portal>,
    )

    const portal = screen.getByTestId('portal')
    expect(portal).toBeInTheDocument()
    expect(portal).toHaveAttribute('data-inkling-portal')
    expect(portal).toContainElement(screen.getByText('Ported content'))
  })
})
