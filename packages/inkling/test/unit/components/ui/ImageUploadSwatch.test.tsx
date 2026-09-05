import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ImageUploadSwatch } from '@/components/ui/ImageUploadSwatch'

describe('ImageUploadSwatch', () => {
  it('renders an image swatch button', () => {
    render(<ImageUploadSwatch dataTestId="swatch" />)
    expect(screen.getByTestId('swatch')).toBeInTheDocument()
  })

  it('calls the click handler', () => {
    const onClick = vi.fn()
    render(<ImageUploadSwatch onClickHandler={onClick} dataTestId="swatch" />)

    fireEvent.click(screen.getByTestId('swatch'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the outline class when showing background image', () => {
    render(<ImageUploadSwatch showBackgroundImage dataTestId="swatch" />)
    expect(screen.getByTestId('swatch')).toHaveClass('outline-green')
  })
})
