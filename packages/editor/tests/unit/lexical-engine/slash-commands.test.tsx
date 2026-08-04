// @vitest-environment happy-dom

import type { ImagePickerRenderProps, RenderMusicPicker } from '@kobato/editor/engine/picker-slot'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { LexicalEditor } from 'lexical'

import { LexicalBodyEditor } from '@kobato/editor/engine/lexical/LexicalBodyEditor'
import { filterLexicalSlashCommands, LEXICAL_SLASH_COMMANDS } from '@kobato/editor/engine/lexical/slash-commands'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { render, waitFor } from '@testing-library/react'
import { $getRoot, $nodesOfType, getNearestEditorFromDOMNode, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

// R3b slash-command tests: the 16-command catalogue (parity with the
// tiptap SLASH_COMMANDS ids/titles/aliases), the filter semantics, and
// each command's insertion output asserted on the canonical reported body.

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

/** Collapse the caret inside the first paragraph's text node (or the paragraph). */
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

function lastBody(onBodyChange: ReturnType<typeof vi.fn>): LexicalBody {
  const call = onBodyChange.mock.calls.at(-1)
  return unsafeCast<LexicalBody>(call?.[0])
}

describe('editor/engine/lexical/slash-commands', () => {
  it('catalogue parity with the tiptap 16 commands', () => {
    const tiptapIds = [
      'paragraph',
      'h2',
      'h3',
      'h4',
      'bullet-list',
      'ordered-list',
      'blockquote',
      'code-block',
      'horizontal-rule',
      'image',
      'music',
      'table',
      'math-block',
      'two-columns',
      'solution',
      'footnote',
    ]
    expect(LEXICAL_SLASH_COMMANDS.map((c) => c.id)).toEqual(tiptapIds)
    // Titles / descriptions / aliases are ported verbatim — spot-check a few.
    const h2 = LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'h2')
    expect(h2?.title).toBe('二级标题')
    expect(h2?.aliases).toEqual(['h2', 'heading2', 'title', '二级标题', '标题2'])
    const footnote = LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'footnote')
    expect(footnote?.title).toBe('脚注引用')
  })

  it('filterSlashCommands matches title + aliases, case-insensitively; empty query returns all', () => {
    expect(filterLexicalSlashCommands('')).toHaveLength(LEXICAL_SLASH_COMMANDS.length)
    expect(filterLexicalSlashCommands('标题').map((c) => c.id)).toEqual(['h2', 'h3', 'h4'])
    expect(filterLexicalSlashCommands('H2').map((c) => c.id)).toEqual(['h2'])
    expect(filterLexicalSlashCommands('分栏').map((c) => c.id)).toEqual(['two-columns'])
    expect(filterLexicalSlashCommands('nope-zzz')).toEqual([])
  })

  it('paragraph clears the block format', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'paragraph')?.insert(editor)
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      expect(reported.root.children[0]?.type).toBe('paragraph')
    })
  })

  it('h2/h3/h4 produce headings with the right tags', async () => {
    for (const [id, tag] of [
      ['h2', 'h2'],
      ['h3', 'h3'],
      ['h4', 'h4'],
    ] as const) {
      const onBodyChange = vi.fn()
      const view = render(
        <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
      )
      await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
      const editor = editorOf(view.container)
      onBodyChange.mockClear()
      caretInFirstBlock(editor)
      LEXICAL_SLASH_COMMANDS.find((c) => c.id === id)?.insert(editor)
      await waitFor(() => {
        const reported = lastBody(onBodyChange)
        expect(reported.root.children[0]?.type).toBe('heading')
        expect((reported.root.children[0] as { tag: string }).tag).toBe(tag)
      })
    }
  })

  it('bullet-list / ordered-list insert lists', async () => {
    for (const id of ['bullet-list', 'ordered-list'] as const) {
      const onBodyChange = vi.fn()
      const view = render(
        <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
      )
      await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
      const editor = editorOf(view.container)
      onBodyChange.mockClear()
      caretInFirstBlock(editor)
      LEXICAL_SLASH_COMMANDS.find((c) => c.id === id)?.insert(editor)
      await waitFor(() => {
        const list = lastBody(onBodyChange).root.children.find((c) => c.type === 'list') as { listType: string }
        expect(list?.listType).toBe(id === 'bullet-list' ? 'bullet' : 'number')
      })
    }
  })

  it('blockquote / code-block convert the current block', async () => {
    for (const [id, type] of [
      ['blockquote', 'quote'],
      ['code-block', 'code'],
    ] as const) {
      const onBodyChange = vi.fn()
      const view = render(
        <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
      )
      await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
      const editor = editorOf(view.container)
      onBodyChange.mockClear()
      caretInFirstBlock(editor)
      LEXICAL_SLASH_COMMANDS.find((c) => c.id === id)?.insert(editor)
      await waitFor(() => {
        const reported = lastBody(onBodyChange)
        expect(reported.root.children[0]?.type).toBe(type)
      })
    }
  })

  it('horizontal-rule inserts a divider block', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'horizontal-rule')?.insert(editor)
    await waitFor(() =>
      expect(lastBody(onBodyChange).root.children.some((c) => c.type === 'horizontalrule')).toBe(true),
    )
  })

  it('table inserts a 3×3 table with a header row', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'table')?.insert(editor)
    await waitFor(() => {
      const table = lastBody(onBodyChange).root.children.find((c) => c.type === 'table') as {
        children: { children: { headerState: number }[] }[]
      }
      expect(table).toBeDefined()
      expect(table.children).toHaveLength(3)
      expect((table.children[0]?.children[0]?.headerState ?? 0) & 1).toBe(1)
    })
  })

  it('math-block inserts a math block with the default template', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'math-block')?.insert(editor)
    await waitFor(() => {
      const block = lastBody(onBodyChange).root.children.find((c) => c.type === 'mathBlock') as { tex: string }
      expect(block?.tex).toContain('\\begin{align*}')
    })
  })

  it('two-columns inserts a two-column container with seeded panes', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'two-columns')?.insert(editor)
    await waitFor(() => {
      const reported = lastBody(onBodyChange)
      const two = reported.root.children.find((c) => c.type === 'twoColumn') as {
        children: { side: string }[]
      }
      expect(two).toBeDefined()
      expect(two.children.map((pane) => pane.side)).toEqual(['left', 'right'])
    })
  })

  it('solution inserts a solution container with a seed paragraph', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    onBodyChange.mockClear()
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'solution')?.insert(editor)
    await waitFor(() => {
      const solution = lastBody(onBodyChange).root.children.find((c) => c.type === 'solution') as {
        children: { type: string }[]
      }
      expect(solution).toBeDefined()
      expect(solution.children[0]?.type).toBe('paragraph')
    })
  })

  it('image / music open the host pickers via the command bridge', async () => {
    const onBodyChange = vi.fn()
    const renderImagePicker = vi.fn((_props: ImagePickerRenderProps) => <div>{'img'}</div>)
    const renderMusicPicker = vi.fn((_props: Parameters<RenderMusicPicker>[0]) => <div>{'music'}</div>)
    const view = render(
      <LexicalBodyEditor
        initialBody={body([paragraph([text('x')])])}
        bodyKey="k1"
        onBodyChange={onBodyChange}
        pickerRenderers={{ renderImagePicker, renderMusicPicker }}
      />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'image')?.insert(editor)
    await waitFor(() => expect(renderImagePicker.mock.calls.at(-1)?.[0].open).toBe(true))
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'music')?.insert(editor)
    await waitFor(() => expect(renderMusicPicker.mock.calls.at(-1)?.[0].open).toBe(true))
  })

  it('footnote opens the footnote insert dialog', async () => {
    const onBodyChange = vi.fn()
    const view = render(
      <LexicalBodyEditor initialBody={body([paragraph([text('x')])])} bodyKey="k1" onBodyChange={onBodyChange} />,
    )
    await waitFor(() => expect(onBodyChange).toHaveBeenCalled())
    const editor = editorOf(view.container)
    caretInFirstBlock(editor)
    LEXICAL_SLASH_COMMANDS.find((c) => c.id === 'footnote')?.insert(editor)
    await waitFor(() => expect(view.getByText('插入脚注')).toBeTruthy())
  })
})
