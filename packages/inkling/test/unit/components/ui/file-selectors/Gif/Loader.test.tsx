import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { Loader } from '@/components/ui/file-selectors/Gif/Loader'

describe('Gif Loader', () => {
  it('renders the lazy loading variant', () => {
    const { container } = render(<Loader isLazyLoading />)
    expect(container.firstChild).toHaveClass('w-full')
  })

  it('renders the centered loader variant', () => {
    const { container } = render(<Loader />)
    expect(container.firstChild).toHaveClass('absolute')
  })
})
