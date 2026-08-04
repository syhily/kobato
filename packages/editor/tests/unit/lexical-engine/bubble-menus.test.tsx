// @vitest-environment happy-dom

import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { LexicalEditor } from 'lexical'

import { applyBlockStyle } from '@kobato/editor/engine/lexical/block-commands'
import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { $getRoot, $nodesOfType, getNearestEditorFromDOMNode, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R3b floating-menu smoke: the selection bubble appears on a text
// selection, the table bubble on a table caret, the code bubble inside
// a code block. Full interaction flows stay covered by the tiptap-parity
// unit tests; here we assert presence + a single format action.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function text(text: string): Record<string, unknown> {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function body(children: unknown[] = []): LexicalBody {
  return unsafeCast<LexicalBody>({ root: { ...elementBase(), type: 'root', children } })
}

function editorOf(container: HTMLElement): LexicalEditor {
  const editable = container.querySelector('[contenteditable]')
  if (editable === null) {
    throw new Error('contenteditable not found')
  }
  const found = getNearestEditorFromDOMNode(editable)
  if (found === null) {
    throw new Error('editor not found')
  }
  return found
}

function lastBody(onBodyChange: ReturnType<typeof vi.fn>): LexicalBody {
  const call = onBodyChange.mock.calls.at(-1)
  return unsafeCast<LexicalBody>(call?.[0])
}

describe('editor/engine/lexical/floating menus', () => {
  it('shows the selection bubble for a text range and applies bold from it', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('加粗这段文字')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    editor.update(() => {
      for (const node of $nodesOfType(TextNode)) {
        if (node.getTextContent() === '加粗这段文字') {
          node.select(0, 4)
          return
        }
      }
    })
    // The bubble portals into document.body.
    await waitFor(() => {
      const buttons = Array.from(document.body.querySelectorAll('button[aria-label="加粗"]'))
      expect(buttons.length).toBeGreaterThan(0)
    })
    const bold = Array.from(document.body.querySelectorAll('button[aria-label="加粗"]'))[0]
    fireEvent.click(bold!)
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const p = reported.root.children[0] as { children: { format: number }[] }
      expect(p.children[0]?.format).toBe(1)
    })
  })

  it('shows the table bubble when the caret is inside a table cell', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Focus first — the table command needs a live selection.
    editor.focus()
    editor.dispatchCommand(INSERT_TABLE_COMMAND, unsafeCast({ rows: 2, columns: 2, includeHeaders: false }))
    await waitFor(() => {
      expect(Array.from(document.body.querySelectorAll('button[aria-label="删除整张表"]')).length).toBeGreaterThan(0)
    })
    // The table bubble action works: delete the table.
    const deleteTable = Array.from(document.body.querySelectorAll('button[aria-label="删除整张表"]'))[0]
    fireEvent.click(deleteTable!)
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children.some((c) => c.type === 'table')).toBe(false)
      // A paragraph replaces the removed table (caret recovery).
      expect(reported.root.children.some((c) => c.type === 'paragraph')).toBe(true)
    })
  })

  it('shows the code bubble inside a code block', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    editor.update(() => {
      const root = $getRoot()
      const first = root.getFirstChild()
      if (first !== null) {
        unsafeCast<import('lexical').ElementNode>(first).selectStart()
      }
    })
    applyBlockStyle(editor, 'codeBlock')
    await waitFor(() => {
      expect(Array.from(document.body.querySelectorAll('button[aria-label="代码语言"]')).length).toBeGreaterThan(0)
    })
  })
})
