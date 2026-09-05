import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { SlashMenu } from '@/components/ui/SlashMenu'

describe('SlashMenu', () => {
  it('renders children inside the slash menu container', () => {
    render(
      <SlashMenu>
        <span>Item</span>
      </SlashMenu>,
    )

    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.getByText('Item').parentElement).toHaveAttribute('data-inkling-slash-menu')
  })
})
