import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { CodeBlockCard } from '@/inkling/components/ui/cards/CodeBlockCard'
import InklingUiPrefsContext from '@/inkling/context/InklingUiPrefsContext'
import { DEFAULT_LABELS } from '@/inkling/labels/inkling-labels'

type UiPrefs = React.ComponentProps<typeof InklingUiPrefsContext.Provider>['value']

function UiPrefsWrapper({ prefs, children }: { prefs: Partial<UiPrefs>; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ darkMode: false, labels: DEFAULT_LABELS, ...prefs }), [prefs])
  return <InklingUiPrefsContext.Provider value={value}>{children}</InklingUiPrefsContext.Provider>
}

function renderEditingCard(
  prefs: Partial<UiPrefs> = {},
  props: Partial<React.ComponentProps<typeof CodeBlockCard>> = {},
) {
  return render(
    <UiPrefsWrapper prefs={prefs}>
      <CodeBlockCard isEditing={true} code="const a = 1" language="javascript" {...props} />
    </UiPrefsWrapper>,
  )
}

describe('CodeBlockCard — plain code editor (codeEditor: plain)', () => {
  it('renders the auto-sizing textarea with the language badge instead of the lazy CodeMirror editor', () => {
    renderEditingCard({ codeEditor: 'plain' })

    const textarea = screen.getByTestId('code-block-plain-editor')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveValue('const a = 1')
    expect(screen.getByText('javascript')).toBeInTheDocument()
  })

  it('focuses the textarea on mount (CodeMirror autoFocus parity)', () => {
    renderEditingCard({ codeEditor: 'plain' })

    expect(document.activeElement).toBe(screen.getByTestId('code-block-plain-editor'))
  })

  it('forwards edits to updateCode', () => {
    const updateCode = vi.fn()
    renderEditingCard({ codeEditor: 'plain' }, { updateCode })

    fireEvent.change(screen.getByTestId('code-block-plain-editor'), { target: { value: 'const a = 2' } })

    expect(updateCode).toHaveBeenCalledWith('const a = 2')
  })

  it('calls onEscape on Escape and inserts newlines natively on Enter', () => {
    const onEscape = vi.fn()
    const updateCode = vi.fn()
    renderEditingCard({ codeEditor: 'plain' }, { onEscape, updateCode })

    const textarea = screen.getByTestId('code-block-plain-editor')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onEscape).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('keeps the rich path as the default: no textarea without codeEditor: plain', () => {
    const { container } = renderEditingCard()

    expect(screen.queryByTestId('code-block-plain-editor')).toBeNull()
    // the lazy boundary's static fallback is the display-mode code box
    expect(container.querySelector('pre')).not.toBeNull()
  })
})
