// @vitest-environment happy-dom

import type { ImagePickerRenderProps } from '@kobato/editor/engine/picker-slot'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { LexicalEditor } from 'lexical'

import { applyBlockStyle } from '@kobato/editor/engine/lexical/block-commands'
import { TOGGLE_LINK_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { $createParagraphNode, $getRoot, $nodesOfType, getNearestEditorFromDOMNode, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R3b toolbar tests: active states, format apply + undo, block styles,
// lists, table insert, the link popover, and the footnote-button
// disabled logic (canInsertFootnoteMark equivalent inside tables / code).

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

/** Select the whole first text node matching `content`. */
function selectText(editor: LexicalEditor, content: string): void {
  editor.update(() => {
    for (const node of $nodesOfType(TextNode)) {
      if (node.getTextContent() === content) {
        node.select(0, content.length)
        return
      }
    }
  })
}

/** Collapse the caret at the end of the first text node matching `content`. */
function caretAtEnd(editor: LexicalEditor, content: string): void {
  editor.update(() => {
    for (const node of $nodesOfType(TextNode)) {
      if (node.getTextContent() === content) {
        node.select(content.length, content.length)
        return
      }
    }
  })
}

function lastBody(onBodyChange: ReturnType<typeof vi.fn>): LexicalBody {
  const call = onBodyChange.mock.calls.at(-1)
  return unsafeCast<LexicalBody>(call?.[0])
}

function reportedTypes(onBodyChange: ReturnType<typeof vi.fn>): string[] {
  return lastBody(onBodyChange).root.children.map((child) => child.type)
}

describe('editor/engine/lexical/LexicalToolbar', () => {
  it('applies bold via the toolbar button and reflects the active state', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('选中我')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    selectText(editor, '选中我')
    await waitFor(() => {
      const bold = view.getByTitle('加粗 (Cmd/Ctrl+B)')
      expect(bold.getAttribute('aria-pressed')).toBe('false')
    })
    fireEvent.click(view.getByTitle('加粗 (Cmd/Ctrl+B)'))
    await waitFor(() => expect(view.getByTitle('加粗 (Cmd/Ctrl+B)').getAttribute('aria-pressed')).toBe('true'))
    const reported = lastBody(onBodyChange)
    const p = reported.root.children[0] as { children: { format: number }[] }
    expect(p.children[0]?.format).toBe(1) // bold bit
  })

  it('undo reverts a format change (full density toolbar)', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('文字')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    selectText(editor, '文字')
    fireEvent.click(view.getByTitle('加粗 (Cmd/Ctrl+B)'))
    await waitFor(() => {
      const p = lastBody(onBodyChange).root.children[0] as { children: { format: number }[] }
      expect(p.children[0]?.format).toBe(1)
    })
    const undo = view.getByTitle('撤销 (Cmd/Ctrl+Z)')
    expect(undo.hasAttribute('disabled')).toBe(false)
    fireEvent.click(undo)
    await waitFor(() => {
      const p = lastBody(onBodyChange).root.children[0] as { children: { format: number }[] }
      expect(p.children[0]?.format).toBe(0)
    })
  })

  it('applies heading / paragraph block styles', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('标题文字')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    caretAtEnd(editor, '标题文字')
    fireEvent.click(view.getByTitle('二级标题'))
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children[0]?.type).toBe('heading')
      expect((reported.root.children[0] as { tag: string }).tag).toBe('h2')
    })
    fireEvent.click(view.getByTitle('正文段落'))
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children[0]?.type).toBe('paragraph')
    })
  })

  it('toggles bullet / ordered lists', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('列表项')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    caretAtEnd(editor, '列表项')
    fireEvent.click(view.getByTitle('无序列表'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).toContain('list'))
    expect(view.getByTitle('无序列表').getAttribute('aria-pressed')).toBe('true')
    // Clicking the active list button removes the list (tiptap toggle parity).
    fireEvent.click(view.getByTitle('无序列表'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).not.toContain('list'))
  })

  it('inserts a 3×3 table with a header row via the toolbar button', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()

    fireEvent.click(view.getByTitle('插入表格 (3×3 含表头)'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).toContain('table'))
    const table = lastBody(onBodyChange).root.children.find((c) => c.type === 'table') as {
      children: { children: { headerState: number }[] }[]
    }
    expect(table.children).toHaveLength(3)
    expect(table.children[0]?.children).toHaveLength(3)
    // Header row — first row cells carry the ROW header bit.
    expect(table.children[0]?.children.every((cell) => (cell.headerState & 1) === 1)).toBe(true)
    expect(table.children[1]?.children.every((cell) => (cell.headerState & 1) === 0)).toBe(true)
  })

  it('inserts a horizontal rule', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()
    fireEvent.click(view.getByTitle('水平分隔线'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).toContain('horizontalrule'))
  })

  it('dispatches OPEN_IMAGE_PICKER_COMMAND through the picker bridge', async () => {
    const onBodyChange = vi.fn()
    const renderImagePicker = vi.fn((_props: ImagePickerRenderProps) => (
      <div data-testid="image-picker-dialog">{'x'}</div>
    ))
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
        pickerRenderers={{ renderImagePicker, renderMusicPicker: () => null }}
      />,
    )
    await waitFor(() => expect(editorOf(view.container)).toBeTruthy())
    fireEvent.click(view.getByTitle('插入图片'))
    await waitFor(() => expect(renderImagePicker.mock.calls.at(-1)?.[0].open).toBe(true))
  })

  it('renders the toolbar link popover and inserts linked text via the command', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Park the caret inside the empty paragraph.
    editor.update(() => {
      const first = $getRoot().getFirstChild()
      if (first !== null) {
        unsafeCast<import('lexical').ElementNode>(first).selectStart()
      }
    })

    // Smoke: clicking the toolbar link button opens the popover.
    fireEvent.click(view.getByTitle('链接'))
    await waitFor(() => expect(view.getByPlaceholderText('链接显示的文字')).toBeTruthy())
    fireEvent.click(view.getByTitle('取消'))

    // The insertion itself goes through TOGGLE_LINK_COMMAND (the popover's
    // apply is a thin trim+dispatch wrapper — its input interaction is not
    // exercised here because base-ui's portaled popover content remounts on
    // input in happy-dom, resetting the draft state).
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: 'https://example.com', text: '示例站', openInNewTab: false })
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const p = reported.root.children[0] as { children: { type: string; url?: string }[] }
      const link = p.children.find((child) => child.type === 'link')
      expect(link?.url).toBe('https://example.com')
      expect(unsafeCast<{ rel: string | null }>(link).rel).toBeNull()
    })
  })

  it('disables the footnote button inside a table cell and a code block', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    const footnoteButton = () => view.getByTitle(/脚注引用/)

    // Baseline: enabled in a plain paragraph.
    await waitFor(() => expect(footnoteButton().hasAttribute('disabled')).toBe(false))

    // Insert a table — the caret lands in the first cell (the INSERT
    // handler selects the first descendant), so the button must disable.
    fireEvent.click(view.getByTitle('插入表格 (3×3 含表头)'))
    await waitFor(() => expect(footnoteButton().hasAttribute('disabled')).toBe(true))

    // Move back out into a paragraph.
    editor.update(() => {
      const root = $getRoot()
      const paragraph = $createParagraphNode()
      root.append(paragraph)
      paragraph.selectStart()
    })
    await waitFor(() => expect(footnoteButton().hasAttribute('disabled')).toBe(false))

    // Code block — the same guard.
    applyBlockStyle(editor, 'codeBlock')
    await waitFor(() => expect(footnoteButton().hasAttribute('disabled')).toBe(true))
  })
})
