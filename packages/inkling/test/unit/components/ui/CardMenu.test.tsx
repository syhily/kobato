import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CardMenu, CardMenuItem, CardMenuSection, CardSnippetItem } from '@/components/ui/CardMenu'

describe('CardMenuItem', () => {
  it('renders label and description', () => {
    render(<CardMenuItem label="Item" desc="Description" dataTestId="menu-item" />)

    expect(screen.getByTestId('menu-item')).toHaveTextContent('Item')
    expect(screen.getByTestId('menu-item')).toHaveTextContent('Description')
  })

  it('renders shortcut', () => {
    render(<CardMenuItem label="Item" shortcut="Ctrl+K" dataTestId="menu-item" />)

    expect(screen.getByTestId('menu-item')).toHaveTextContent('Ctrl+K')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<CardMenuItem label="Item" dataTestId="menu-item" onClick={onClick} />)

    fireEvent.click(screen.getByTestId('menu-item'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onRemove without triggering onClick', () => {
    const onClick = vi.fn()
    const onRemove = vi.fn()
    render(<CardMenuItem label="Item" dataTestId="menu-item" onClick={onClick} onRemove={onRemove} />)

    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders custom content', () => {
    render(<CardMenuItem customContent={<div data-testid="custom-content">Custom</div>} />)
    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
  })

  it('renders with Icon component', () => {
    const Icon = () => <svg data-testid="icon" />
    render(<CardMenuItem label="Item" Icon={Icon} dataTestId="menu-item" />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})

describe('CardMenuSection', () => {
  it('renders label and children', () => {
    render(
      <CardMenuSection label="Section">
        <li data-testid="child">Child</li>
      </CardMenuSection>,
    )

    expect(screen.getByText('Section')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})

describe('CardSnippetItem', () => {
  it('renders label', () => {
    render(<CardSnippetItem label="Snippet" dataTestId="snippet-item" />)
    expect(screen.getByTestId('snippet-item')).toHaveTextContent('Snippet')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<CardSnippetItem label="Snippet" dataTestId="snippet-item" onClick={onClick} />)

    fireEvent.click(screen.getByTestId('snippet-item'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onRemove without triggering onClick', () => {
    const onClick = vi.fn()
    const onRemove = vi.fn()
    render(<CardSnippetItem label="Snippet" dataTestId="snippet-item" onClick={onClick} onRemove={onRemove} />)

    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('closes the menu after removing a snippet', () => {
    const onRemove = vi.fn()
    const closeMenu = vi.fn()
    render(<CardSnippetItem label="Snippet" closeMenu={closeMenu} dataTestId="snippet-item" onRemove={onRemove} />)

    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(closeMenu).toHaveBeenCalledTimes(1)
  })
})

describe('CardMenu', () => {
  const insert = vi.fn()
  const closeMenu = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty menu', () => {
    render(<CardMenu insert={insert} sections={[]} closeMenu={closeMenu} />)
    expect(document.querySelector('[data-inkling-card-menu]')).toBeInTheDocument()
  })

  it('renders card items and calls insert on click', () => {
    const sections = [
      {
        label: 'Basic',
        items: [
          { label: 'Paragraph', name: 'paragraph', dataTestId: 'paragraph-item' },
          { label: 'Heading', name: 'heading', dataTestId: 'heading-item' },
        ],
      },
    ]

    render(<CardMenu insert={insert} sections={sections} selectedItemIndex={0} closeMenu={closeMenu} />)

    expect(screen.getByText('Basic')).toBeInTheDocument()
    expect(screen.getByTestId('paragraph-item')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('heading-item'))
    expect(insert).toHaveBeenCalledWith(undefined, { insertParams: undefined, queryParams: undefined })
  })

  it('renders snippet items and remove button', () => {
    const onRemove = vi.fn()
    const sections = [
      {
        label: 'Snippets',
        items: [
          {
            label: 'My Snippet',
            type: 'snippet' as const,
            onRemove,
          },
        ],
      },
    ]

    render(<CardMenu insert={insert} sections={sections} selectedItemIndex={0} closeMenu={closeMenu} />)

    expect(screen.getByText('My Snippet')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(closeMenu).toHaveBeenCalledTimes(1)
  })

  it('does not render dead inkling.local help links', () => {
    const sections = [
      { label: 'Primary', items: [{ label: 'Paragraph', name: 'paragraph', dataTestId: 'paragraph-item' }] },
      { label: 'Snippets', items: [{ label: 'My Snippet', type: 'snippet' as const }] },
    ]

    const { container } = render(<CardMenu insert={insert} sections={sections} closeMenu={closeMenu} />)

    expect(container.querySelector('a[href*="inkling.local"]')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders the snippet item icon', () => {
    const SnippetIcon = (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="snippet-icon" {...props} />
    const sections = [
      {
        label: 'Snippets',
        items: [
          {
            label: 'My Snippet',
            type: 'snippet' as const,
            Icon: SnippetIcon,
            dataTestId: 'snippet-menu-item',
          },
        ],
      },
    ]

    render(<CardMenu insert={insert} sections={sections} selectedItemIndex={0} closeMenu={closeMenu} />)

    expect(screen.getByTestId('snippet-menu-item').querySelector('svg')).not.toBeNull()
  })

  it('marks selected item', () => {
    const sections = [
      {
        label: 'Basic',
        items: [
          { label: 'Paragraph', name: 'paragraph', dataTestId: 'paragraph-item' },
          { label: 'Heading', name: 'heading', dataTestId: 'heading-item' },
        ],
      },
    ]

    render(<CardMenu insert={insert} sections={sections} selectedItemIndex={1} closeMenu={closeMenu} />)

    const headingItem = screen.getByTestId('heading-item')
    expect(headingItem.className).toContain('bg-grey-100')
  })

  it('numbers item indexes across section boundaries', () => {
    const sections = [
      { label: 'Primary', items: [{ label: 'Paragraph', name: 'paragraph', dataTestId: 'paragraph-item' }] },
      { label: 'Snippets', items: [{ label: 'My Snippet', type: 'snippet' as const, dataTestId: 'snippet-item' }] },
    ]

    render(<CardMenu insert={insert} sections={sections} selectedItemIndex={1} closeMenu={closeMenu} />)

    expect(screen.getByTestId('paragraph-item').querySelector('[data-inkling-cardmenu-idx]')).toHaveAttribute(
      'data-inkling-cardmenu-idx',
      '0',
    )
    const snippetItem = screen.getByTestId('snippet-item').querySelector('[data-inkling-cardmenu-idx]')
    expect(snippetItem).toHaveAttribute('data-inkling-cardmenu-idx', '1')
    expect(snippetItem).toHaveAttribute('data-inkling-cardmenu-selected', 'true')
  })
})
