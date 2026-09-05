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
import { beforeEach, describe, expect, it } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { EmEnDashPlugin } from '@/plugins/EmEnDashPlugin'

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

// Types each character as its own keystroke. The dash grammar itself is
// pinned synchronously in test/unit/plugins/behaviour/em-en-dash.test.ts;
// these tests only pin the plugin wiring — the registered scan and the
// 'history-push' tag that keeps the replacement a separate undo entry, so a
// single undo restores the raw typed dashes (the characters themselves merge
// into one history entry, which the undo never reaches).
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

describe('EmEnDashPlugin', () => {
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
      renderHook(() => EmEnDashPlugin(), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
    })

    registerRichText(editor)
  })

  it('replaces three dashes with an em dash', async () => {
    await typeText(editor, '---')
    expect(getEditorText(editor)).toBe('—')
  })

  it('replaces two dashes followed by whitespace with an en dash', async () => {
    await typeText(editor, 'a-- ')
    expect(getEditorText(editor)).toBe('a– ')
  })

  it('undoes em dash replacement back to the original dashes', async () => {
    await typeText(editor, '---')
    expect(getEditorText(editor)).toBe('—')

    await undo(editor)
    expect(getEditorText(editor)).toBe('---')
  })

  it('undoes en dash replacement back to the original dashes and space', async () => {
    await typeText(editor, 'a-- ')
    expect(getEditorText(editor)).toBe('a– ')

    await undo(editor)
    expect(getEditorText(editor)).toBe('a-- ')
  })
})
