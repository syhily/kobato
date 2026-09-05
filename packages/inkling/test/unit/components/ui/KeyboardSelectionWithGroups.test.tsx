import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { ListOptionItem } from '@/hooks/useSearchLinks'

import { KeyboardSelectionWithGroups } from '@/components/ui/KeyboardSelectionWithGroups'

function EmptyIcon() {
  return <svg />
}

function createListOptionItem(label: string, value: string | null): ListOptionItem {
  return { Icon: EmptyIcon, highlight: false, label, type: 'url', value }
}

describe('KeyboardSelectionWithGroups', () => {
  it('lets Enter fall through when there is no selectable item', () => {
    const onKeyDown = vi.fn()
    const onSelect = vi.fn()

    render(
      <div onKeyDown={onKeyDown}>
        <input aria-label="URL" />
        <KeyboardSelectionWithGroups
          getGroup={() => <></>}
          getItem={() => <></>}
          groups={[{ label: 'Results', items: [] }]}
          onSelect={onSelect}
        />
      </div>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'URL' }), { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(onKeyDown.mock.calls[0][0].defaultPrevented).toBe(false)
  })

  it('consumes Enter and calls onEnterWithoutSelection when provided and no item is selectable', () => {
    const onKeyDown = vi.fn()
    const onEnterWithoutSelection = vi.fn()
    const onSelect = vi.fn()

    render(
      <div onKeyDown={onKeyDown}>
        <input aria-label="At-link" />
        <KeyboardSelectionWithGroups
          getGroup={() => <></>}
          getItem={() => <></>}
          groups={[{ label: 'No results found', items: [] }]}
          onEnterWithoutSelection={onEnterWithoutSelection}
          onSelect={onSelect}
        />
      </div>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'At-link' }), { key: 'Enter' })

    expect(onEnterWithoutSelection).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('consumes Enter and selects the item when one exists', () => {
    const onSelect = vi.fn()
    const item = createListOptionItem('Enter URL to create link', null)

    render(
      <div>
        <input aria-label="URL" />
        <KeyboardSelectionWithGroups
          getGroup={() => <></>}
          getItem={() => <></>}
          groups={[{ label: 'Results', items: [item] }]}
          onSelect={onSelect}
        />
      </div>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'URL' }), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it('never shows a null-valued placeholder selected, even when the index lands on it', () => {
    const placeholder = createListOptionItem('No results', null)
    const real = createListOptionItem('Example', 'https://example.com')

    render(
      <KeyboardSelectionWithGroups
        getGroup={() => <></>}
        getItem={(item, selected) => (
          <li key={item.label} aria-selected={selected} role="option">
            {item.label}
          </li>
        )}
        groups={[{ label: '', items: [placeholder, real] }]}
        onSelect={vi.fn()}
      />,
    )

    // the default index is 0 — the placeholder — but it must not render selected
    expect(screen.getByText('No results')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Example')).toHaveAttribute('aria-selected', 'false')
  })

  it('still lets Enter fall through a flagged link input before any navigation (inkling behavior)', () => {
    const onKeyDown = vi.fn()
    const onSelect = vi.fn()
    const item = createListOptionItem('Example', 'https://example.com')

    render(
      <div onKeyDown={onKeyDown}>
        <input aria-label="URL" data-inkling-link-input="" />
        <KeyboardSelectionWithGroups
          getGroup={() => <></>}
          getItem={() => <></>}
          groups={[{ label: 'Results', items: [item] }]}
          onSelect={onSelect}
        />
      </div>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'URL' }), { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onKeyDown).toHaveBeenCalledOnce()
  })
})
