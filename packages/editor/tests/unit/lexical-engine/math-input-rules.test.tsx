// @vitest-environment happy-dom

import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { LexicalEditor } from 'lexical'

import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import { render, waitFor } from '@testing-library/react'
import { $getRoot, $getSelection, getNearestEditorFromDOMNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R3b math input rules: typing `$…$` converts the run into an inline
// math node; the rule is disabled inside table cells (tiptap table
// guard) and code blocks; the floating bubbles appear on selection.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
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

/** Insert text at the caret as a single typing action. */
function typeText(editor: LexicalEditor, value: string): void {
  editor.update(() => {
    const selection = $getSelection()
    if (selection !== null && selection.insertText) {
      selection.insertText(value)
    } else {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<import('lexical').ElementNode>(first).selectStart()
        $getSelection()?.insertText(value)
      }
    }
  })
}

function paragraphInlineTypes(reported: LexicalBody): string[] {
  const p = reported.root.children[0] as { children: { type: string }[] }
  return p.children.map((c) => c.type)
}

describe('editor/engine/lexical/math-input-rules', () => {
  it('converts a typed $…$ run into an inline math node', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<import('lexical').ElementNode>(first).selectStart()
      }
    })
    typeText(editor, '前缀 $a^2$')
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(paragraphInlineTypes(reported)).toContain('mathInline')
    })
    const reported = lastBody(onBodyChange)
    const p = reported.root.children[0] as { children: { type: string; tex?: string }[] }
    const math = p.children.find((c) => c.type === 'mathInline')
    expect(math?.tex).toBe('a^2')
    // The prefix stays as plain text.
    expect(p.children[0]?.type).toBe('text')
    expect((p.children[0] as { text?: string }).text).toBe('前缀 ')
  })

  it('leaves an escaped \\$…\\$ run as plain text', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<import('lexical').ElementNode>(first).selectStart()
      }
    })
    typeText(editor, '\\$a$')
    await waitFor(() => {
      expect(paragraphInlineTypes(lastBody(onBodyChange))).not.toContain('mathInline')
    })
  })

  it('does not convert inside table cells', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    editor.focus()
    editor.dispatchCommand(INSERT_TABLE_COMMAND, unsafeCast({ rows: 2, columns: 2, includeHeaders: false }))
    // The table insert parks the caret in the first cell; wait for it to land.
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children.some((c) => c.type === 'table')).toBe(true)
    })
    typeText(editor, '$x$')
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const table = reported.root.children.find((c) => c.type === 'table') as unknown as
        | undefined
        | {
            children: { children: { children: { children: { type: string }[] }[] }[] }[]
          }
      const cellChildren = table?.children[0]?.children[0]?.children[0]?.children ?? []
      expect(cellChildren.some((c) => c.type === 'mathInline')).toBe(false)
      expect(cellChildren.some((c) => c.type === 'text')).toBe(true)
    })
  })
})
