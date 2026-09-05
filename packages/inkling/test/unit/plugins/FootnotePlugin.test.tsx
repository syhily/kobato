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
  type LexicalEditor,
} from 'lexical'
import React, { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import { createFootnoteHandle, type FootnoteHandle } from '@/plugins/behaviour/footnoteHandle'
import { $collectFootnoteSnapshot, registerFootnotes } from '@/plugins/behaviour/footnotes'

// The undo-merge pin:
// the caret-trigger insertion commits untagged, so it merges into the typing
// history entry — ONE undo reverts the whole footnote insertion (ref +
// definition) together with the `^ ` typing, kobato's `addToHistory: false`
// analogue. The undo-resurrection guard (the restored text must not re-fire
// the trigger) is the update-scan gate's history-tag skip, pinned at the
// gate level in update-scan.test.ts.

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    onError: () => {},
    theme: {},
  })
}

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: LexicalEditor }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

describe('FootnotePlugin undo semantics', () => {
  let editor: LexicalEditor
  let handle: FootnoteHandle

  beforeEach(() => {
    editor = createTestEditor()
    handle = createFootnoteHandle()
    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  async function mountHistory() {
    const historyState = createEmptyHistoryState()
    await act(async () => {
      renderHook(() => HistoryPlugin({ externalHistoryState: historyState }), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
    })
    registerRichText(editor)
    registerFootnotes(editor, handle)
  }

  async function setContent(text: string) {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode(text))
      $getRoot().append(paragraph)
      paragraph.selectEnd()
    })
  }

  async function typeText(text: string) {
    for (const char of text) {
      await act(async () => {
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, char)
      })
      await tick()
    }
  }

  function rootChildTypes(): string[] {
    return editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType()),
    )
  }

  function footnoteCounts(): { refs: number; definitions: number } {
    return editor.getEditorState().read(() => {
      const snapshot = $collectFootnoteSnapshot()
      return { refs: snapshot.refs.length, definitions: snapshot.definitions.length }
    })
  }

  function firstParagraphText(): string {
    return editor.getEditorState().read(() => $getRoot().getFirstChild()?.getTextContent() ?? '')
  }

  it('reverts the whole `^ ` insertion with one undo (the insertion merges into the typing entry)', async () => {
    await mountHistory()
    await setContent('hello')

    await typeText(' ^ ')

    expect(rootChildTypes()).toEqual(['paragraph', 'footnotedefinition'])
    expect(footnoteCounts()).toEqual({ refs: 1, definitions: 1 })
    expect(firstParagraphText()).toBe('hello 1')

    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await tick()

    // the untagged conversion commit merges into the typing transaction
    // (kobato's addToHistory: false analogue): ONE undo reverts trigger text
    // and insertion together — ref, definition, and the `^ ` are all gone
    expect(rootChildTypes()).toEqual(['paragraph'])
    expect(footnoteCounts()).toEqual({ refs: 0, definitions: 0 })
    expect(firstParagraphText()).toBe('hello')

    // no resurrection on the historic commit itself (the gate's history-tag
    // skip is pinned at the gate level in update-scan.test.ts)
    await tick()
    expect(footnoteCounts()).toEqual({ refs: 0, definitions: 0 })
  })
})
