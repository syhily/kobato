import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { EditorPlaceholder } from '@/components/ui/EditorPlaceholder'

describe('EditorPlaceholder', () => {
  it('renders the default placeholder text', () => {
    render(<EditorPlaceholder />)
    expect(screen.getByText('Begin writing your post...')).toBeInTheDocument()
  })

  it('renders custom placeholder text', () => {
    render(<EditorPlaceholder text="Custom placeholder" />)
    expect(screen.getByText('Custom placeholder')).toBeInTheDocument()
  })
})
