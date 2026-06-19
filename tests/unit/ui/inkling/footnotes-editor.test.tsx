import type { SerializedEditorState, SerializedRootNode } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $getRoot, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

function buildHeadlessEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-footnote-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless footnote test error:', error)
    },
    nodes: [ParagraphNode, HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, FootnoteRefNode],
  })
}

function buildEditorStateWithFootnoteRef(): SerializedEditorState {
  const root = {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          { type: 'text', version: 1, text: 'Hello', format: 0, style: '', mode: 'normal', detail: 0 },
          {
            type: 'footnote-ref',
            version: 1,
            targetKey: 'def-key-1',
            refKey: 'ref-key-1',
            index: 1,
          },
        ],
      },
    ],
  } as unknown as SerializedRootNode
  return { root }
}

describe('ui/inkling/footnotes-editor', () => {
  it('parses and serializes a footnote ref node preserving targetKey, refKey, and index', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(editor.parseEditorState(buildEditorStateWithFootnoteRef()))

    const serialized = editor.getEditorState().toJSON()
    const paragraph = serialized.root.children[0] as { type?: string; children?: Array<{ type?: string }> } | undefined
    expect(paragraph?.type).toBe('paragraph')
    const refNode = paragraph?.children?.[1]
    expect(refNode?.type).toBe('footnote-ref')
    expect(refNode).toMatchObject({
      targetKey: 'def-key-1',
      refKey: 'ref-key-1',
      index: 1,
    })
  })

  it('reads footnote ref node text content as its display index', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(editor.parseEditorState(buildEditorStateWithFootnoteRef()))

    let textContent = ''
    editor.read(() => {
      textContent = $getRoot().getTextContent()
    })
    expect(textContent).toBe('Hello1')
  })

  it('updates display index when setIndex is called', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(editor.parseEditorState(buildEditorStateWithFootnoteRef()))

    editor.update(
      () => {
        const root = $getRoot()
        const paragraph = root.getFirstChildOrThrow() as ParagraphNode
        const refNode = paragraph.getChildren()[1]
        expect(refNode).toBeInstanceOf(FootnoteRefNode)
        ;(refNode as FootnoteRefNode).setIndex(7)
      },
      { discrete: true },
    )

    const serialized = editor.getEditorState().toJSON()
    const paragraph = serialized.root.children[0] as
      | { type?: string; children?: Array<{ type?: string; index?: number }> }
      | undefined
    const refNode = paragraph?.children?.[1]
    expect(refNode?.type).toBe('footnote-ref')
    expect(refNode?.index).toBe(7)
  })

  it('serializes nested solution content to valid Inkling blocks via headless editor', () => {
    const editor = buildHeadlessEditor()
    const initialBlocks: InklingNonRecursiveBlockNode[] = [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [{ type: 'text', version: 1, text: 'Nested solution body' }],
      },
    ]
    const root: SerializedRootNode = {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: initialBlocks as never[],
    }
    editor.setEditorState(editor.parseEditorState({ root }))

    const serialized = editor.getEditorState().toJSON()
    expect(serialized.root.children).toHaveLength(1)
    expect(serialized.root.children[0]?.type).toBe('paragraph')
  })
})
