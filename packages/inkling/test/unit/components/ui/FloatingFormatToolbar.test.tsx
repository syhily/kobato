import { fireEvent, render, screen } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { FloatingFormatToolbar } from '@/components/ui/FloatingFormatToolbar'

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', onError: () => {} })
}

function selectText(editor: LexicalEditor, text: string): Promise<void> {
  return updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const textNode = $createTextNode(text)
    paragraph.append(textNode)
    root.append(paragraph)
    textNode.select(0, text.length)
  })
}

describe('FloatingFormatToolbar', () => {
  it('collapses the selection to the end of the focus node after a link update', async () => {
    const editor = createTestEditor()
    await selectText(editor, 'hello')
    const onClose = vi.fn()

    render(
      <FloatingFormatToolbar
        anchorElem={document.body}
        editor={editor}
        toolbarItemType="link"
        toolbarRef={React.createRef<HTMLDivElement>()}
        onClose={onClose}
        onOpenLink={() => {}}
        onOpenSnippet={() => {}}
      />,
    )

    fireEvent.input(screen.getByTestId('link-input'), { target: { value: 'https://example.com' } })
    fireEvent.keyDown(screen.getByTestId('link-input'), { key: 'Enter' })

    // Lexical defers the commit of non-discrete updates to a microtask
    await tick()

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.isCollapsed()).toBe(true)
        expect(selection.anchor.offset).toBe(5)
      }
    })

    expect(onClose).toHaveBeenCalled()
  })
})
