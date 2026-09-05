import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchLinksFn } from '@/hooks/useSearchLinks'

import { BookmarkCard, BookmarkIcon } from '@/components/ui/cards/BookmarkCard'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'

function renderWithSearchLinks(searchLinks: SearchLinksFn, ui: React.ReactElement) {
  return render(
    <InklingHostIntegrationProvider
      value={{
        fileUploader: { useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }) },
        cardConfig: { searchLinks },
        onError: vi.fn(),
      }}
    >
      {ui}
    </InklingHostIntegrationProvider>,
  )
}

vi.mock('../../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => <div data-testid="card-caption-editor" />,
}))

function createCaptionEditor() {
  return createEditor({ namespace: 'test', onError: () => {} })
}

describe('BookmarkCard', () => {
  const defaultProps = {
    handleClose: vi.fn(),
    handlePasteAsLink: vi.fn(),
    handleRetry: vi.fn(),
    handleUrlChange: vi.fn(),
    handleUrlSubmit: vi.fn(),
    captionEditor: createCaptionEditor(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the populated bookmark card when url and title are present', () => {
    render(
      <BookmarkCard
        {...defaultProps}
        url="https://example.com"
        title="Example"
        description="An example bookmark"
        publisher="Example Inc"
        icon="https://example.com/favicon.ico"
        author="Author Name"
        thumbnail="https://example.com/image.png"
      />,
    )

    expect(screen.getByTestId('bookmark-container')).toBeInTheDocument()
    expect(screen.getByTestId('bookmark-title')).toHaveTextContent('Example')
    expect(screen.getByTestId('bookmark-description')).toHaveTextContent('An example bookmark')
    expect(screen.getByTestId('bookmark-publisher')).toHaveTextContent('Example Inc')
    expect(screen.getByTestId('bookmark-author')).toHaveTextContent('Author Name')
    expect(screen.getByTestId('bookmark-thumbnail')).toBeInTheDocument()
    expect(screen.getByTestId('card-caption-editor')).toBeInTheDocument()
  })

  it('hides thumbnail on image error', () => {
    render(
      <BookmarkCard
        {...defaultProps}
        url="https://example.com"
        title="Example"
        thumbnail="https://example.com/broken.png"
      />,
    )

    const thumbnail = screen.getByTestId('bookmark-thumbnail')
    fireEvent.error(thumbnail)
    expect(screen.queryByTestId('bookmark-thumbnail')).not.toBeInTheDocument()
  })

  it('does not render thumbnail when thumbnail prop is missing', () => {
    render(<BookmarkCard {...defaultProps} url="https://example.com" title="Example" />)

    expect(screen.queryByTestId('bookmark-thumbnail-container')).not.toBeInTheDocument()
  })

  it('renders the search-capable field when the host configures searchLinks', () => {
    const searchLinks: SearchLinksFn = vi.fn().mockResolvedValue([])
    renderWithSearchLinks(searchLinks, <BookmarkCard {...defaultProps} urlInputValue="test" />)

    expect(screen.getByTestId('bookmark-url')).toBeInTheDocument()
  })

  it('renders the plain field when searchLinks is not configured', () => {
    render(<BookmarkCard {...defaultProps} urlInputValue="test" />)

    expect(screen.getByTestId('bookmark-url')).toBeInTheDocument()
  })

  it('submits the input value as a plain string on Enter in the plain branch', () => {
    const handleUrlSubmit = vi.fn()
    render(<BookmarkCard {...defaultProps} handleUrlSubmit={handleUrlSubmit} urlInputValue="https://example.com" />)

    fireEvent.keyDown(screen.getByTestId('bookmark-url'), { key: 'Enter' })

    expect(handleUrlSubmit).toHaveBeenCalledTimes(1)
    expect(handleUrlSubmit).toHaveBeenCalledWith('https://example.com')
  })

  it('submits the input value as a plain string on Enter in the search branch', () => {
    const handleUrlSubmit = vi.fn()
    const searchLinks: SearchLinksFn = vi.fn().mockResolvedValue([])
    renderWithSearchLinks(
      searchLinks,
      <BookmarkCard {...defaultProps} handleUrlSubmit={handleUrlSubmit} urlInputValue="https://example.com" />,
    )

    fireEvent.keyDown(screen.getByTestId('bookmark-url'), { key: 'Enter' })

    expect(handleUrlSubmit).toHaveBeenCalledTimes(1)
    // a bare URL query short-circuits the dropdown to a 'url'-typed option,
    // which Enter selects — the submit is still a plain string pair
    expect(handleUrlSubmit).toHaveBeenCalledWith('https://example.com', 'url')
  })

  it('renders loading state when urlError is true', () => {
    render(<BookmarkCard {...defaultProps} urlInputValue="test" urlError={true} isLoading={true} />)

    expect(screen.getByTestId('bookmark-url-loading-container')).toBeInTheDocument()
  })
})

describe('BookmarkIcon', () => {
  it('renders an icon image', () => {
    render(<BookmarkIcon src="https://example.com/favicon.ico" />)
    expect(screen.getByTestId('bookmark-icon')).toHaveAttribute('src', 'https://example.com/favicon.ico')
  })
})
