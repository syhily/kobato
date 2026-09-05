import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor, KEY_ENTER_COMMAND, type LexicalEditor } from 'lexical'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { UrlInput } from '@/components/ui/UrlInput'

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', onError: () => {} })
}

function createComposerValue(editor: LexicalEditor): React.ContextType<typeof LexicalComposerContext> {
  return [editor, { getTheme: () => null }]
}

function renderWithEditor(ui: React.ReactElement, editor: LexicalEditor) {
  const composerValue = createComposerValue(editor)
  return render(<LexicalComposerContext.Provider value={composerValue}>{ui}</LexicalComposerContext.Provider>)
}

describe('UrlInput', () => {
  it('renders without a surrounding composer context', () => {
    render(<UrlInput dataTestId="url-input" value="https://example.com" />)

    expect(screen.getByTestId('url-input')).toBeInTheDocument()
  })

  it('submits on Enter while the input is focused', () => {
    const handleUrlSubmit = vi.fn()
    renderWithEditor(
      <UrlInput dataTestId="url-input" handleUrlSubmit={handleUrlSubmit} value="https://example.com" />,
      createTestEditor(),
    )

    fireEvent.keyDown(screen.getByTestId('url-input'), { key: 'Enter' })

    expect(handleUrlSubmit).toHaveBeenCalledTimes(1)
    expect(handleUrlSubmit).toHaveBeenCalledWith('https://example.com')
  })

  it('submits on Enter dispatched from the main editor', () => {
    const handleUrlSubmit = vi.fn()
    const editor = createTestEditor()
    renderWithEditor(
      <UrlInput dataTestId="url-input" handleUrlSubmit={handleUrlSubmit} value="https://example.com" />,
      editor,
    )

    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(handleUrlSubmit).toHaveBeenCalledTimes(1)
    // the editor-level event's target is the editor root, so the submitted
    // value is the controlled input value — a plain string, not the event
    expect(handleUrlSubmit).toHaveBeenCalledWith('https://example.com')
  })

  it('closes on Escape', () => {
    const handleClose = vi.fn()
    renderWithEditor(
      <UrlInput dataTestId="url-input" handleClose={handleClose} value="https://example.com" />,
      createTestEditor(),
    )

    fireEvent.keyDown(screen.getByTestId('url-input'), { key: 'Escape' })

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('renders a close icon instead of a text character in the error state', () => {
    const { container } = renderWithEditor(
      <UrlInput
        dataTestId="url-input"
        handleClose={vi.fn()}
        handlePasteAsLink={vi.fn()}
        handleRetry={vi.fn()}
        hasError
        value="notaurl"
      />,
      createTestEditor(),
    )

    const closeButton = screen.getByTestId('url-input-error-close')
    expect(closeButton.querySelector('svg')).toBeInTheDocument()
    expect(closeButton).not.toHaveTextContent('✕')
    expect(container.querySelector('.text-grey-400')).toBeInTheDocument()
  })
})
