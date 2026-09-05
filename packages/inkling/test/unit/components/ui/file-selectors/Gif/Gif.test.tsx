import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Gif } from '@/components/ui/file-selectors/Gif/Gif'

describe('Gif', () => {
  const data = {
    id: 'gif-1',
    title: 'A gif',
    media_formats: {
      gif: { url: 'https://example.com/gif.gif', dims: [100, 80] as [number, number] },
    },
  }

  it('returns null when no gif media format is available', () => {
    const { container } = render(<Gif data={{ id: 'empty', media_formats: {} }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the gif image and calls handlers', () => {
    const onClick = vi.fn()
    const onMouseEnter = vi.fn()

    render(<Gif data={data} isHighlighted onClick={onClick} onMouseEnter={onMouseEnter} />)

    const item = screen.getByTestId('gif-item')
    expect(item).toHaveClass('border-green')

    const img = screen.getByAltText('A gif')
    expect(img).toHaveAttribute('src', 'https://example.com/gif.gif')

    fireEvent.mouseEnter(item)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)

    fireEvent.click(item)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('falls back to the tinygif format', () => {
    const tinyData = {
      id: 'gif-2',
      media_formats: {
        tinygif: { url: 'https://example.com/tiny.gif', dims: [50, 40] as [number, number] },
      },
    }

    render(<Gif data={tinyData} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/tiny.gif')
  })
})
