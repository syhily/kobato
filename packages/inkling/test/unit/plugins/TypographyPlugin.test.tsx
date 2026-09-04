import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HistoryPlugin, createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { registerRichText } from '@lexical/rich-text'
import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  UNDO_COMMAND,
  createEditor,
} from 'lexical'
import React, { useMemo } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { TypographyPlugin } from '@/plugins/TypographyPlugin'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [],
    onError: () => {},
    theme: {},
  })
}

function getEditorText(editor: ReturnType<typeof createTestEditor>): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent())
}

// Types each character as its own keystroke. The typography grammar itself
// is pinned synchronously in test/unit/plugins/behaviour/typography.test.ts;
// these tests pin the plugin wiring — the registered scan, the
// 'history-push' tag that keeps the replacement a separate undo entry, and
// the update-scan seam's composing skip that protects IME input.
async function typeText(editor: ReturnType<typeof createTestEditor>, text: string): Promise<void> {
  for (const char of text) {
    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, char)
    })
    // Flush the listener-enqueued scan commit before the next keystroke.
    await tick()
  }
}

async function undo(editor: ReturnType<typeof createTestEditor>): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
  })
}

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: ReturnType<typeof createTestEditor> }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

describe('TypographyPlugin', () => {
  let editor: ReturnType<typeof createTestEditor>
  const historyState = createEmptyHistoryState()

  beforeEach(async () => {
    editor = createTestEditor()

    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)

    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('')
      paragraph.append(text)
      $getRoot().append(paragraph)
      text.select()
    })

    await act(async () => {
      renderHook(() => HistoryPlugin({ externalHistoryState: historyState }), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
      renderHook(() => TypographyPlugin(), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
    })

    registerRichText(editor)
  })

  it('replaces three dots with an ellipsis as they are typed', async () => {
    await typeText(editor, '...')
    expect(getEditorText(editor)).toBe('…')
  })

  it('replaces a straight quote with a directional quote as it is typed', async () => {
    await typeText(editor, '"a"')
    expect(getEditorText(editor)).toBe('“a”')
  })

  it('undoes the ellipsis replacement back to the original dots', async () => {
    await typeText(editor, '...')
    expect(getEditorText(editor)).toBe('…')

    await undo(editor)
    expect(getEditorText(editor)).toBe('...')
  })

  it('undoes the smart-quote replacement back to the straight quote', async () => {
    await typeText(editor, '"')
    expect(getEditorText(editor)).toBe('“')

    await undo(editor)
    expect(getEditorText(editor)).toBe('"')
  })

  // IME composition protection: editor.isComposing() is not reachable
  // through jsdom composition events — spy it like the at-link/link-editing
  // specs do. While composing, the update-scan seam skips every commit, so
  // quote/ellipsis sequences land verbatim; once composition ends the next
  // keystroke's commit fires the scan and the text converts.
  it('does not rewrite text typed during IME composition', async () => {
    const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)

    await typeText(editor, '"...')
    expect(getEditorText(editor)).toBe('"...')

    composing.mockRestore()

    await typeText(editor, 'x')
    expect(getEditorText(editor)).toBe('“…x')
  })

  it('leaves text typed after composition ends subject to replacement again', async () => {
    const composing = vi.spyOn(editor, 'isComposing').mockReturnValue(true)
    await typeText(editor, 'a')
    composing.mockRestore()

    await typeText(editor, '...')
    expect(getEditorText(editor)).toBe('a…')
  })
})
