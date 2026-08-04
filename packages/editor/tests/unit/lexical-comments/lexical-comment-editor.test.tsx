// @vitest-environment happy-dom

import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalEditor } from 'lexical'

import { COMMENT_LEXICAL_SLASH_COMMANDS } from '@kobato/editor/comments-editor/lexical/comment-lexical-slash-commands'
import { LexicalCommentEditor } from '@kobato/editor/comments-editor/lexical/LexicalCommentEditor'
import { TOGGLE_LINK_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { filterLexicalSlashCommands } from '@kobato/editor/engine/lexical/slash-commands'
import {
  COMMENT_EDITOR_NAMESPACE,
  createCommentEditorConfig,
} from '@kobato/editor/lexical-core/create-comment-editor-config'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { $getRoot, $getSelection, $nodesOfType, getNearestEditorFromDOMNode, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R4 comment editor tests: subset registry, canonical reporting, toolbar
// (formats / lists / quote / link dialog), the 6-command slash
// catalogue (menu shows the subset only), `$…$` math conversion,
// disabled + bodyKey reset semantics.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []): Record<string, unknown> {
  return { ...elementBase(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function text(text: string): Record<string, unknown> {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function body(children: unknown[] = []): LexicalCommentBody {
  return unsafeCast<LexicalCommentBody>({ root: { ...elementBase(), type: 'root', children } })
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

/** Collapse the caret at the start of the first paragraph. */
function caretInFirstBlock(editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot()
    const first = root.getFirstChild()
    if (first === null) {
      return
    }
    const textNode = $nodesOfType(TextNode)[0]
    if (textNode !== undefined) {
      textNode.select(textNode.getTextContent().length, textNode.getTextContent().length)
    } else if (first.getType() === 'paragraph') {
      first.selectStart()
    }
  })
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

function lastBody(onBodyChange: ReturnType<typeof vi.fn>): LexicalCommentBody {
  const call = onBodyChange.mock.calls.at(-1)
  return unsafeCast<LexicalCommentBody>(call?.[0])
}

function reportedTypes(onBodyChange: ReturnType<typeof vi.fn>): string[] {
  return lastBody(onBodyChange).root.children.map((child) => child.type)
}

describe('editor/comments-editor/lexical/LexicalCommentEditor', () => {
  it('uses the comment node subset registry', () => {
    const config = createCommentEditorConfig()
    expect(config.namespace).toBe(COMMENT_EDITOR_NAMESPACE)
    const types = (config.nodes as unknown as { getType?: () => string }[]).map((node) => node.getType?.())
    expect(types).toContain('paragraph')
    expect(types).toContain('quote')
    expect(types).toContain('list')
    expect(types).toContain('link')
    expect(types).toContain('code')
    expect(types).toContain('mathInline')
    expect(types).toContain('mathBlock')
    for (const banned of [
      'heading',
      'image',
      'horizontalrule',
      'musicPlayer',
      'table',
      'solution',
      'twoColumn',
      'footnoteRef',
      'footnoteDefinition',
    ]) {
      expect(types).not.toContain(banned)
    }
  })

  it('renders and reports the canonical initial body', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor initialBody={body([paragraph([text('你好')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const reported = lastBody(onBodyChange)
    expect(reported.root.children.map((child) => child.type)).toEqual(['paragraph'])
    const p = reported.root.children[0] as {
      children: { type: string; text: string }[]
      textFormat: number
      textStyle: string
    }
    expect(p.textFormat).toBe(0)
    expect(p.textStyle).toBe('')
    expect(p.children[0]?.text).toBe('你好')
    expect(view.getByText(/块级命令/)).toBeTruthy() // hint strip
  })

  it('typing produces canonical subset output', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    typeText(editor, '评论内容')
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const p = reported.root.children[0] as { children: { type: string; text: string; format: number }[] }
      expect(p.children[0]?.type).toBe('text')
      expect(p.children[0]?.text).toBe('评论内容')
      expect(p.children[0]?.format).toBe(0)
    })
  })

  it('applies bold via the toolbar button and reflects the active state', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor
        initialBody={body([paragraph([text('选中我')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    selectText(editor, '选中我')
    await waitFor(() => expect(view.getByTitle('加粗 (Cmd/Ctrl+B)').getAttribute('aria-pressed')).toBe('false'))
    fireEvent.click(view.getByTitle('加粗 (Cmd/Ctrl+B)'))
    await waitFor(() => expect(view.getByTitle('加粗 (Cmd/Ctrl+B)').getAttribute('aria-pressed')).toBe('true'))
    const p = lastBody(onBodyChange).root.children[0] as { children: { format: number }[] }
    expect(p.children[0]?.format).toBe(1) // bold bit
  })

  it('toggles bullet / ordered lists and the blockquote', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor
        initialBody={body([paragraph([text('列表项')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Bullet list on / off (tiptap toggle parity).
    caretAtEnd(editor, '列表项')
    fireEvent.click(view.getByTitle('无序列表'))
    await waitFor(() => {
      expect(reportedTypes(onBodyChange)).toContain('list')
      // The toolbar state must reflect the active list before the toggle
      // click below can dispatch REMOVE_LIST_COMMAND.
      expect(view.getByTitle('无序列表').getAttribute('aria-pressed')).toBe('true')
    })
    // The reported body carries the 0.45 runtime shape: the text run
    // sits directly inside the list item (ListItemNode unwraps
    // paragraphs), which the comment dialect accepts.
    {
      const list = lastBody(onBodyChange).root.children.find((c) => c.type === 'list') as {
        children: { children: { type: string }[] }[]
      }
      const item = list?.children[0]
      expect(item?.children.map((child) => child.type)).toEqual(['text'])
    }
    fireEvent.click(view.getByTitle('无序列表'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).not.toContain('list'))

    // Ordered list.
    fireEvent.click(view.getByTitle('有序列表'))
    await waitFor(() => {
      const list = lastBody(onBodyChange).root.children.find((c) => c.type === 'list') as { listType: string }
      expect(list?.listType).toBe('number')
      // The toolbar state must reflect the active list before the toggle
      // click below can dispatch REMOVE_LIST_COMMAND.
      expect(view.getByTitle('有序列表').getAttribute('aria-pressed')).toBe('true')
    })
    fireEvent.click(view.getByTitle('有序列表'))
    await waitFor(() => expect(reportedTypes(onBodyChange)).not.toContain('list'))

    // Blockquote.
    fireEvent.click(view.getByTitle('引用'))
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children[0]?.type).toBe('quote')
      expect(view.getByTitle('引用').getAttribute('aria-pressed')).toBe('true')
    })
    // Active quote button is a no-op (tiptap parity — slash paragraph is the way out).
    const before = JSON.stringify(lastBody(onBodyChange))
    fireEvent.click(view.getByTitle('引用'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(JSON.stringify(lastBody(onBodyChange))).toBe(before)
  })

  it('opens the link prompt dialog and inserts / removes links via TOGGLE_LINK_COMMAND', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor
        initialBody={body([paragraph([text('链接文字')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()

    // Smoke: the toolbar link button opens the prompt dialog.
    fireEvent.click(view.getByTitle('链接'))
    await waitFor(() => expect(view.getByPlaceholderText('https://example.com')).toBeTruthy())
    fireEvent.click(view.getByRole('button', { name: '取消' }))

    // Insertion goes through TOGGLE_LINK_COMMAND (same surface the
    // dialog's confirm dispatches).
    selectText(editor, '链接文字')
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: 'https://example.com', text: undefined, openInNewTab: false })
    await waitFor(() => {
      const p = lastBody(onBodyChange).root.children[0] as { children: { type: string; url?: string }[] }
      const link = p.children.find((child) => child.type === 'link')
      expect(link?.url).toBe('https://example.com')
      expect(unsafeCast<{ rel: string | null }>(link).rel).toBeNull()
      expect(unsafeCast<{ target: string | null }>(link).target).toBeNull()
    })
    // Unlink: empty url removes the link (the dialog's "留空移除" path).
    caretAtEnd(editor, '链接文字')
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: '', openInNewTab: false })
    await waitFor(() => {
      const p = lastBody(onBodyChange).root.children[0] as { children: { type: string }[] }
      expect(p.children.every((child) => child.type !== 'link')).toBe(true)
    })
  })

  it('slash menu catalogue is the 6-command comment subset', () => {
    expect(COMMENT_LEXICAL_SLASH_COMMANDS.map((c) => c.id)).toEqual([
      'paragraph',
      'bullet-list',
      'ordered-list',
      'blockquote',
      'code-block',
      'math-block',
    ])
    // Titles / aliases match the tiptap COMMENT_SLASH_COMMANDS — spot check.
    const blockquote = COMMENT_LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'blockquote')
    expect(blockquote?.title).toBe('引用')
    expect(blockquote?.aliases).toEqual(['quote', 'blockquote', '引用'])
    // The filter semantics work on the comment catalogue.
    expect(filterLexicalSlashCommands('', COMMENT_LEXICAL_SLASH_COMMANDS)).toHaveLength(6)
    expect(filterLexicalSlashCommands('公式', COMMENT_LEXICAL_SLASH_COMMANDS).map((c) => c.id)).toEqual(['math-block'])
  })

  it('slash commands convert blocks within the subset', async () => {
    for (const [id, type] of [
      ['paragraph', 'paragraph'],
      ['blockquote', 'quote'],
      ['code-block', 'code'],
    ] as const) {
      const onBodyChange = vi.fn()
      const view = render(
        <LexicalCommentEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
      )
      await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
      const editor = editorOf(view.container)
      onBodyChange.mockClear()
      caretInFirstBlock(editor)
      COMMENT_LEXICAL_SLASH_COMMANDS.find((c) => c.id === id)?.insert(editor)
      await waitFor(() => {
        const reported = lastBody(onBodyChange)
        expect(reported.root.children[0]?.type).toBe(type)
      })
    }
  })

  it('slash commands insert lists and math blocks', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    COMMENT_LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'bullet-list')?.insert(editor)
    await waitFor(() => {
      const list = lastBody(onBodyChange).root.children.find((c) => c.type === 'list') as { listType: string }
      expect(list?.listType).toBe('bullet')
    })
    COMMENT_LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'math-block')?.insert(editor)
    await waitFor(() => {
      const block = lastBody(onBodyChange).root.children.find((c) => c.type === 'mathBlock') as { tex: string }
      expect(block?.tex).toContain('\\begin{align*}')
    })
  })

  it('converts a typed $…$ run into an inline math node', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    typeText(editor, '前缀 $a^2$')
    await waitFor(() => {
      const p = lastBody(onBodyChange).root.children[0] as { children: { type: string }[] }
      expect(p.children.map((c) => c.type)).toContain('mathInline')
    })
    const p = lastBody(onBodyChange).root.children[0] as { children: { type: string; tex?: string }[] }
    const math = p.children.find((c) => c.type === 'mathInline')
    expect(math?.tex).toBe('a^2')
    expect(p.children[0]?.type).toBe('text')
    expect((p.children[0] as { text?: string }).text).toBe('前缀 ')
  })

  it('honors disabled (read-only) and the placeholder contract', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor initialBody={body([paragraph([])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editable = () => view.container.querySelector('[contenteditable]')
    // Empty document marks the placeholder state.
    await waitFor(() => expect(editable()?.classList.contains('is-editor-empty')).toBe(true))
    expect(editable()?.getAttribute('data-placeholder')).toBe('写下你的评论…  / 命令，$ 公式')

    view.rerender(
      <LexicalCommentEditor
        initialBody={body([paragraph([])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
        disabled
        placeholder="自定义占位"
      />,
    )
    await waitFor(() => expect(editable()?.getAttribute('contenteditable')).toBe('false'))
    expect(view.getByTitle('加粗 (Cmd/Ctrl+B)').hasAttribute('disabled')).toBe(true)
    expect(view.getByTitle('链接').hasAttribute('disabled')).toBe(true)
    expect(editable()?.getAttribute('data-placeholder')).toBe('自定义占位')
  })

  it('resets content and reports the canonical body when bodyKey changes', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalCommentEditor
        initialBody={body([paragraph([text('第一版')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    onBodyChange.mockClear()

    view.rerender(
      <LexicalCommentEditor
        initialBody={body([paragraph([text('第二版')])])}
        bodyKey="k2"
        onBodyChange={onBodyChange}
      />,
    )
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const p = reported.root.children[0] as { children: { text?: string }[] }
      expect(p.children[0]?.text).toBe('第二版')
      expect(reported.root.children).toHaveLength(1)
    })
  })
})
