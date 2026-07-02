import type { ElementNode, LexicalEditor, SerializedEditorState } from 'lexical'

import { LinkNode } from '@lexical/link'
import { $createTextNode, $getRoot } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { buildHeadlessCommentEditor } from '#/_helpers/headless-editor'
import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { insertCommentCodeBlock, insertCommentMathBlock } from '@/ui/inkling/editor/comment/block-insert'
import { $createInlineMathNode } from '@/ui/inkling/editor/comment/nodes/InlineMathNode'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'
import { toSerializedRoot } from '@/ui/inkling/editor/shared/lexical-bridge'

/**
 * Comment-editor contract, exercised headlessly against the same pieces
 * `CommentInklingEditor` wires together: the `COMMENT_NODES` registry (via
 * `buildHeadlessCommentEditor`), the raw non-debounced serialization path
 * (`editorStateToInklingDocument`, which the component's `OnChangePlugin`
 * handler calls verbatim), and the `CommentInsertActions` block-insert
 * helpers. DOM mounting of the vendored composer is covered by the article
 * editor test; the comment editor shares that composer.
 */

/** Seed the editor from an Inkling document, mirroring the hydrate path in
 *  `CommentInklingEditor` (`inklingDocumentToEditorState`). */
function seedFromDocument(editor: LexicalEditor, document: InklingDocument): void {
  editor.setEditorState(editor.parseEditorState({ root: toSerializedRoot(document.root) }))
}

function seedEmptyDocument(editor: LexicalEditor): void {
  seedFromDocument(editor, structuredClone(EMPTY_INKLING_DOCUMENT) as InklingDocument)
}

/** Place the caret at the end of the first paragraph, then run `fn`, then
 *  force Lexical's microtask-batched commit so reads see the result.
 *  (`insertCommentCodeBlock`/`insertCommentMathBlock` run their own
 *  non-discrete `editor.update`, which only commits on the next microtask —
 *  the trailing discrete no-op flushes it synchronously.) */
function withCaretInFirstParagraph(editor: LexicalEditor, fn: () => void): void {
  editor.update(
    () => {
      const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>()
      paragraph.selectEnd()
    },
    { discrete: true },
  )
  fn()
  editor.update(() => undefined, { discrete: true })
}

function buildEditor(): LexicalEditor {
  return buildHeadlessCommentEditor((error) => {
    throw error
  })
}

describe('ui/public/comments/comment-editor', () => {
  it('initializes from an empty Inkling document and round-trips it', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(document._type).toBe('inkling')
    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('fires onChange with a serialized Inkling document after an editor update', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    // Mirror CommentInklingEditor's handleChange: raw (non-debounced)
    // serialization on every committed update.
    const onDocumentChange = vi.fn<(document: InklingDocument) => void>()
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      onDocumentChange(editorStateToInklingDocument(editorState))
    })

    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>()
        paragraph.append($createTextNode('你好，世界'))
      },
      { discrete: true },
    )
    unregister()

    expect(onDocumentChange).toHaveBeenCalled()
    const document = onDocumentChange.mock.calls.at(-1)?.[0]
    expect(document).toBeDefined()
    expect(JSON.stringify(document)).toContain('你好，世界')
    expect(validateInklingDocumentForMode(document as InklingDocument, 'comment').ok).toBe(true)
  })

  it('serializes a link node', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>()
        const link = new LinkNode('https://example.com', { target: '_blank', rel: 'nofollow noreferrer' })
        link.append($createTextNode('访问示例'))
        paragraph.append(link)
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const paragraph = document.root.children[0] as {
      children: Array<{ type: string; url?: string; children?: Array<{ text: string }> }>
    }
    expect(paragraph.children[0]?.type).toBe('link')
    expect(paragraph.children[0]?.url).toBe('https://example.com')
    expect(paragraph.children[0]?.children?.[0]?.text).toBe('访问示例')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes text format bits for bold and italic', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>()
        const text = $createTextNode('加粗且斜体')
        text.setFormat(1 | 2) // bold + italic
        paragraph.append(text)
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const paragraph = document.root.children[0] as { children: Array<{ format?: number; text: string }> }
    expect(paragraph.children[0]?.text).toBe('加粗且斜体')
    const format = paragraph.children[0]?.format ?? 0
    expect(format & 1).toBe(1)
    expect(format & 2).toBe(2)
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('insertCommentCodeBlock inserts a schema-valid code-block card', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    withCaretInFirstParagraph(editor, () => {
      insertCommentCodeBlock(editor)
    })

    const document = editorStateToInklingDocument(editor.getEditorState())
    const codeBlock = document.root.children.find((child) => child.type === 'code-block')
    expect(codeBlock).toBeDefined()
    expect((codeBlock as { code: string }).code.length).toBeGreaterThan(0)
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('insertCommentMathBlock inserts a schema-valid math-block card', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    withCaretInFirstParagraph(editor, () => {
      insertCommentMathBlock(editor)
    })

    const document = editorStateToInklingDocument(editor.getEditorState())
    const mathBlock = document.root.children.find((child) => child.type === 'math-block')
    expect(mathBlock).toBeDefined()
    expect((mathBlock as { tex: string }).tex).toContain('\\begin{align*}')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('block-insert helpers are no-ops without a selection', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    insertCommentCodeBlock(editor)
    insertCommentMathBlock(editor)
    editor.update(() => undefined, { discrete: true })

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
  })

  it('serializes an inline math node (comment variant)', () => {
    const editor = buildEditor()
    seedEmptyDocument(editor)

    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>()
        paragraph.append($createTextNode('E = '), $createInlineMathNode('mc^2'))
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const paragraph = document.root.children[0] as { children: Array<{ type: string; tex?: string }> }
    expect(paragraph.children[1]?.type).toBe('inline-math')
    expect(paragraph.children[1]?.tex).toBe('mc^2')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('rejects article-only nodes because they are not registered', () => {
    const editor = buildEditor()

    const badState: SerializedEditorState = {
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [{ type: 'image-card', version: 1, src: 'https://example.com/x.png' } as never],
      },
    }

    expect(() => editor.setEditorState(editor.parseEditorState(badState))).toThrow()
  })

  it('does not register table, heading, or footnote-ref nodes', () => {
    const editor = buildEditor()

    for (const child of [
      {
        type: 'table',
        version: 1,
        rows: [{ type: 'tablerow', version: 1, cells: [{ type: 'tablecell', version: 1, children: [] }] }],
      },
      { type: 'heading', version: 1, tag: 'h2', direction: null, format: '', indent: 0, children: [] },
      { type: 'footnote-ref', version: 1, targetKey: 'fn-a', refKey: 'ref-a', index: 1 },
    ]) {
      const state: SerializedEditorState = {
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [child as never],
        },
      }
      expect(() => editor.setEditorState(editor.parseEditorState(state))).toThrow()
    }
  })
})
