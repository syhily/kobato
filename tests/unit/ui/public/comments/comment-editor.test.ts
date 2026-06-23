import type { SerializedEditorState } from 'lexical'
import type { ElementNode, SerializedParagraphNode } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { QuoteNode } from '@lexical/rich-text'
import { $createTextNode, $getRoot, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { CodeCardNode, MathCardNode, $createCodeCardNode, $createMathCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'
import { InlineMathNode, $createInlineMathNode } from '@/ui/inkling/editor/comment/nodes/InlineMathNode'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

const COMMENT_NODES = [
  ParagraphNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeCardNode,
  MathCardNode,
  InlineMathNode,
]

function buildCommentEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-comment-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Comment editor test error:', error)
    },
    nodes: COMMENT_NODES,
  })
}

function emptyParagraph(): SerializedParagraphNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    children: [],
  }
}

function emptyDocumentState(): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [emptyParagraph() as never],
    },
  }
}

describe('ui/public/comments/comment-editor', () => {
  it('initializes from an empty Inkling document', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(document._type).toBe('inkling')
    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes plain text typed into a paragraph', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
        paragraph.append($createTextNode('Hello world'))
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const paragraph = document.root.children[0]
    expect(paragraph?.type).toBe('paragraph')
    expect((paragraph as { children: Array<{ text: string }> }).children[0]?.text).toBe('Hello world')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes a link node', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
        const link = new LinkNode('https://example.com', { target: '_blank', rel: 'nofollow noreferrer' })
        link.append($createTextNode('visit example'))
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
    expect(paragraph.children[0]?.children?.[0]?.text).toBe('visit example')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes text format bits for bold and italic', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
        const text = $createTextNode('decorated')
        text.setFormat(1 | 2) // bold + italic
        paragraph.append(text)
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const paragraph = document.root.children[0] as { children: Array<{ format?: number; text: string }> }
    expect(paragraph.children[0]?.text).toBe('decorated')
    const format = paragraph.children[0]?.format ?? 0
    expect(format & 1).toBe(1) // bold
    expect(format & 2).toBe(2) // italic
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes a code block node', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
        const codeBlock = $createCodeCardNode({ code: 'const x = 1', language: 'ts' })
        paragraph.insertAfter(codeBlock)
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const codeBlock = document.root.children[1]
    expect(codeBlock?.type).toBe('code-block')
    expect((codeBlock as { code: string; language?: string }).code).toBe('const x = 1')
    expect((codeBlock as { language?: string }).language).toBe('ts')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes a math block node', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
        const mathBlock = $createMathCardNode({ tex: 'E = mc^2' })
        paragraph.insertAfter(mathBlock)
      },
      { discrete: true },
    )

    const document = editorStateToInklingDocument(editor.getEditorState())
    const mathBlock = document.root.children[1]
    expect(mathBlock?.type).toBe('math-block')
    expect((mathBlock as { tex: string }).tex).toBe('E = mc^2')
    expect(validateInklingDocumentForMode(document, 'comment').ok).toBe(true)
  })

  it('serializes an inline math node', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState(emptyDocumentState()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow<ElementNode>()
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

  it('rejects unknown article-only nodes because they are not registered', () => {
    const editor = buildCommentEditor()

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
    const editor = buildCommentEditor()

    const tableState: SerializedEditorState = {
      root: {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'table',
            version: 1,
            rows: [{ type: 'tablerow', version: 1, cells: [{ type: 'tablecell', version: 1, children: [] }] }],
          } as never,
        ],
      },
    }

    expect(() => editor.setEditorState(editor.parseEditorState(tableState))).toThrow()
  })

  it('reports editable false when disabled', () => {
    const readOnlyEditor = createHeadlessEditor({
      namespace: 'inkling-comment-readonly-test',
      onError: () => undefined,
      nodes: COMMENT_NODES,
      editable: false,
    })
    readOnlyEditor.setEditorState(readOnlyEditor.parseEditorState(emptyDocumentState()))

    expect(readOnlyEditor.isEditable()).toBe(false)
  })

  it('round-trips the empty Inkling document constant', () => {
    const editor = buildCommentEditor()
    editor.setEditorState(editor.parseEditorState({ root: EMPTY_INKLING_DOCUMENT.root as never }))

    const document = editorStateToInklingDocument(editor.getEditorState())
    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
  })
})
