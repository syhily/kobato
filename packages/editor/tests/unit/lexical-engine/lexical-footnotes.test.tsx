// @vitest-environment happy-dom

import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { LexicalEditor } from 'lexical'

import { OPEN_FOOTNOTE_DIALOG_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { FootnoteRefNode as FootnoteRefNodeClass } from '@kobato/editor/lexical-core/nodes/footnote-ref-node'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { $nodesOfType, getNearestEditorFromDOMNode, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R3b footnote loop tests: definition blocks are stripped from the
// editor surface at load, merged back at save, refs insert through the
// dialog, indices renumber by citation order, and the in-editor `<sup>`
// numbers stay in sync.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function text(text: string): Record<string, unknown> {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function footnoteDef(ptKey: string, index: number, bodyText: string): Record<string, unknown> {
  return {
    ...elementBase(),
    type: 'footnoteDefinition',
    ptKey,
    index,
    children: [paragraph([text(bodyText)])],
  }
}

function footnoteRef(targetKey: string, index: number): Record<string, unknown> {
  return { type: 'footnoteRef', version: 1, targetKey, index }
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

function defsOf(reported: LexicalBody): { ptKey?: string; index: number }[] {
  return reported.root.children
    .filter((c) => c.type === 'footnoteDefinition')
    .map((c) => ({ ptKey: (c as { ptKey?: string }).ptKey, index: (c as { index: number }).index }))
}

function refsOf(reported: LexicalBody): { targetKey: string; index: number }[] {
  const out: { targetKey: string; index: number }[] = []
  for (const block of reported.root.children) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      for (const child of block.children) {
        if (child.type === 'footnoteRef') {
          out.push({ targetKey: child.targetKey, index: child.index })
        }
      }
    }
  }
  return out
}

/** Fill the open footnote dialog and confirm. */
function confirmFootnoteDialog(view: ReturnType<typeof render>, plainText: string): void {
  const textarea = view.getByLabelText('脚注正文')
  fireEvent.change(textarea, { target: { value: plainText } })
  fireEvent.click(view.getByText('保存'))
}

describe('editor/engine/lexical/use-lexical-footnotes (via LexicalBodyEditor)', () => {
  it('strips definition blocks from the editor surface at load', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('正文'), footnoteRef('def-1', 1)]), footnoteDef('def-1', 1, '注释一')])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editable = view.container.querySelector('[contenteditable="true"]')
    expect(editable?.textContent).toContain('正文')
    expect(editable?.textContent).not.toContain('注释一')
    // The reported body keeps the definition (merged back at the end).
    const reported = lastBody(onBodyChange)
    expect(defsOf(reported)).toEqual([{ ptKey: 'def-1', index: 1 }])
    expect(refsOf(reported)).toEqual([{ targetKey: 'def-1', index: 1 }])
  })

  it('inserts a ref through the dialog and reports the definition + ref', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('这里')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Park the caret after "这里".
    editor.update(() => {
      for (const node of $nodesOfType(TextNode)) {
        if (node.getTextContent() === '这里') {
          node.select(2, 2)
          return
        }
      }
    })

    editor.dispatchCommand(OPEN_FOOTNOTE_DIALOG_COMMAND, undefined)
    await waitFor(() => expect(view.getByText('插入脚注')).toBeTruthy())
    confirmFootnoteDialog(view, '脚注内容 A')
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(refsOf(reported)).toHaveLength(1)
      expect(defsOf(reported)).toHaveLength(1)
      expect(defsOf(reported)[0]?.index).toBe(1)
      expect(refsOf(reported)[0]?.index).toBe(1)
    })
    // The editor surface shows the superscript ref, not the definition.
    const editable = view.container.querySelector('[contenteditable="true"]')
    expect(editable?.textContent).toContain('这里')
    expect(editable?.textContent).not.toContain('脚注内容 A')
    expect(view.container.querySelector('sup[data-footnote-ref]')?.textContent).toBe('1')
  })

  it('renumbers refs and defs by citation order on save', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([
          paragraph([text('a'), footnoteRef('def-1', 1), text('b'), footnoteRef('def-2', 2)]),
          footnoteDef('def-1', 1, '一'),
          footnoteDef('def-2', 2, '二'),
        ])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Swap the citation order: move the first ref after the second.
    editor.update(() => {
      const refs = $nodesOfType(FootnoteRefNodeClass)
      const first = refs[0]
      const second = refs[1]
      if (first !== undefined && second !== undefined) {
        first.remove()
        second.insertAfter(first)
      }
    })
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      // Citation order now def-2 first — both defs renumber 1..2.
      expect(refsOf(reported).map((r) => r.targetKey)).toEqual(['def-2', 'def-1'])
      expect(refsOf(reported).map((r) => r.index)).toEqual([1, 2])
      expect(defsOf(reported).map((d) => d.index)).toEqual([1, 2])
      // Definitions moved to the end of the body.
      const types = reported.root.children.map((c) => c.type)
      expect(types.slice(-2)).toEqual(['footnoteDefinition', 'footnoteDefinition'])
    })
    // The in-editor sup indices follow the renumbering.
    await waitFor(() => {
      const sups = Array.from(view.container.querySelectorAll('sup[data-footnote-ref]'))
      expect(sups.map((s) => s.textContent)).toEqual(['1', '2'])
    })
  })

  it('edit mode rewrites the definition children', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('x'), footnoteRef('def-1', 1)]), footnoteDef('def-1', 1, '旧内容')])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()

    // Click the sup — opens the edit dialog seeded with the def text.
    const refAnchor = view.container.querySelector('sup[data-footnote-ref] a')
    expect(refAnchor).not.toBeNull()
    fireEvent.click(refAnchor!)
    await waitFor(() => expect(view.getByText('编辑脚注')).toBeTruthy())
    confirmFootnoteDialog(view, '新内容')
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const def = reported.root.children.find((c) => c.type === 'footnoteDefinition') as {
        children: { children: { text: string }[] }[]
      }
      expect(def.children[0]?.children[0]?.text).toBe('新内容')
    })
  })

  it('delete removes the definition and its inline refs', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('x'), footnoteRef('def-1', 1)]), footnoteDef('def-1', 1, '内容')])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()

    const refAnchor = view.container.querySelector('sup[data-footnote-ref] a')
    fireEvent.click(refAnchor!)
    await waitFor(() => expect(view.getByText('编辑脚注')).toBeTruthy())
    fireEvent.click(view.getByText('删除'))
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(defsOf(reported)).toHaveLength(0)
      expect(refsOf(reported)).toHaveLength(0)
    })
  })

  it('reports an empty document when only definitions exist', async () => {
    const onBodyChange = vi.fn()
    render(
      <LexicalBodyEditor
        initialBody={body([paragraph([]), footnoteDef('def-1', 1, '孤立的定义')])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = lastBody(onBodyChange)
    expect(defsOf(reported)).toHaveLength(1)
  })
})
