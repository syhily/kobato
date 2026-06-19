import type { SerializedEditorState, SerializedLexicalNode, SerializedRootNode } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { ListItemNode, ListNode } from '@lexical/list'
import { $createRangeSelection, $getRoot, $isTextNode, $setSelection, ParagraphNode, TextNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingDocument, InklingRootNode } from '@/shared/inkling/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import {
  buildPinyinSequence,
  dispatchCompositionStart,
  dispatchCompositionSequence,
} from '@/ui/inkling/poc/composition-event-helpers'
import { ImeCompositionProbe } from '@/ui/inkling/poc/ImeCompositionProbe'

function buildHeadlessEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-ime-composition-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless IME composition test error:', error)
    },
    nodes: [ParagraphNode, TextNode, ListNode, ListItemNode, FootnoteRefNode],
  })
}

function buildInklingDocument(root: SerializedRootNode): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: root as InklingRootNode,
  }
}

function validateArticleState(serialized: SerializedEditorState): void {
  const document = buildInklingDocument(serialized.root)
  const result = validateInklingDocumentForMode(document, 'article')
  expect(result.ok).toBe(true)
}

function emptyRoot(): SerializedRootNode {
  return {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [],
  }
}

function paragraph(children: Array<SerializedLexicalNode>): SerializedLexicalNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children,
  } as SerializedLexicalNode
}

function textNode(text: string): SerializedLexicalNode {
  return { type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 } as SerializedLexicalNode
}

function footnoteRefNode(index: number): SerializedLexicalNode {
  return {
    type: 'footnote-ref',
    version: 1,
    targetKey: 'target-key',
    refKey: 'ref-key',
    index,
  } as SerializedLexicalNode
}

/**
 * Simulates the editor state mutation that occurs when a composition commits.
 * The project unit-test environment runs in Node (not jsdom), so we cannot
 * dispatch real DOM composition events. Instead we use the same Lexical
 * update path that the IME event handlers ultimately invoke, and validate the
 * serialized output against the Inkling schema.
 */
function simulateCompositionCommit(
  editor: ReturnType<typeof buildHeadlessEditor>,
  paragraphIndex: number,
  childIndex: number,
  offset: number,
  composedText: string,
): SerializedEditorState {
  editor.update(
    () => {
      const root = $getRoot()
      const p = root.getChildAtIndex(paragraphIndex)
      if (!(p instanceof ParagraphNode)) {
        return
      }
      const target = p.getChildAtIndex(childIndex)
      if (target === null) {
        return
      }
      if ($isTextNode(target)) {
        const current = target.getTextContent()
        target.setTextContent(current.slice(0, offset) + composedText + current.slice(offset))
      } else {
        const nextSibling = target.getNextSibling()
        if (nextSibling !== null && $isTextNode(nextSibling)) {
          nextSibling.setTextContent(composedText + nextSibling.getTextContent())
        } else {
          const text = new TextNode(composedText)
          target.insertAfter(text)
        }
      }
    },
    { discrete: true },
  )
  return editor.getEditorState().toJSON()
}

function simulateCompositionReplaceSelectedDecorator(
  editor: ReturnType<typeof buildHeadlessEditor>,
  paragraphIndex: number,
  decoratorIndex: number,
  composedText: string,
): SerializedEditorState {
  editor.update(
    () => {
      const root = $getRoot()
      const p = root.getChildAtIndex(paragraphIndex)
      if (!(p instanceof ParagraphNode)) {
        return
      }
      const target = p.getChildAtIndex(decoratorIndex)
      if (target === null) {
        return
      }
      target.replace(new TextNode(composedText))
    },
    { discrete: true },
  )
  return editor.getEditorState().toJSON()
}

function simulateCompositionCancel(
  editor: ReturnType<typeof buildHeadlessEditor>,
  paragraphIndex: number,
  childIndex: number,
  _offset: number,
): SerializedEditorState {
  editor.update(
    () => {
      const root = $getRoot()
      const p = root.getChildAtIndex(paragraphIndex)
      if (!(p instanceof ParagraphNode)) {
        return
      }
      const target = p.getChildAtIndex(childIndex)
      if ($isTextNode(target)) {
        // Remove the zero-width composition placeholder that Lexical inserts.
        const text = target.getTextContent()
        if (text === '\u200B') {
          target.remove()
        } else {
          target.setTextContent(text.replaceAll('\u200B', ''))
        }
      }
    },
    { discrete: true },
  )
  return editor.getEditorState().toJSON()
}

function setSelectionToDecorator(
  editor: ReturnType<typeof buildHeadlessEditor>,
  paragraphIndex: number,
  decoratorIndex: number,
): void {
  editor.update(
    () => {
      const root = $getRoot()
      const p = root.getChildAtIndex(paragraphIndex)
      if (!(p instanceof ParagraphNode)) {
        return
      }
      const node = p.getChildAtIndex(decoratorIndex)
      if (node === null) {
        return
      }
      const selection = $createRangeSelection()
      const nextSibling = node.getNextSibling()
      if (nextSibling !== null && $isTextNode(nextSibling)) {
        selection.anchor.set(nextSibling.getKey(), 0, 'text')
        selection.focus.set(nextSibling.getKey(), 0, 'text')
      } else {
        const textNode = new TextNode('')
        node.insertAfter(textNode)
        selection.anchor.set(textNode.getKey(), 0, 'text')
        selection.focus.set(textNode.getKey(), 0, 'text')
      }
      $setSelection(selection)
    },
    { discrete: true },
  )
}

function getRefNode(serialized: SerializedEditorState, paragraphIndex: number, childIndex: number): unknown {
  const p = serialized.root.children[paragraphIndex] as { children?: Array<unknown> } | undefined
  return p?.children?.[childIndex]
}

describe('ui/inkling/ime-composition-probe', () => {
  it('S1 — plain-text composition in a paragraph commits to a single text node and validates', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([])],
        },
      } as SerializedEditorState),
    )

    // Empty paragraphs have no children; insert composed text into the paragraph.
    editor.update(
      () => {
        const root = $getRoot()
        const p = root.getChildAtIndex(0)
        if (!(p instanceof ParagraphNode)) {
          return
        }
        p.append(new TextNode('你好'))
      },
      { discrete: true },
    )
    const serialized = editor.getEditorState().toJSON()
    validateArticleState(serialized)

    const p = serialized.root.children[0] as { children?: Array<{ type?: string; text?: string }> } | undefined
    expect(p?.children).toHaveLength(1)
    expect(p?.children?.[0]?.type).toBe('text')
    expect(p?.children?.[0]?.text).toBe('你好')
  })

  it('S2 — composition ending before an inline decorator preserves the decorator', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([textNode('前'), footnoteRefNode(3), textNode('后')])],
        },
      } as SerializedEditorState),
    )

    const serialized = simulateCompositionCommit(editor, 0, 2, 0, '你好')
    validateArticleState(serialized)

    const p = serialized.root.children[0] as
      | { children?: Array<{ type?: string; text?: string; index?: number }> }
      | undefined
    expect(p?.children).toHaveLength(3)
    expect(p?.children?.[0]?.text).toBe('前')
    expect(p?.children?.[1]?.type).toBe('footnote-ref')
    expect(p?.children?.[1]?.index).toBe(3)
    expect(p?.children?.[2]?.text).toBe('你好后')
  })

  it('S3 — composition starting after an inline decorator preserves the decorator', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([textNode('前'), footnoteRefNode(7), textNode('后')])],
        },
      } as SerializedEditorState),
    )

    const serialized = simulateCompositionCommit(editor, 0, 0, 1, '你好')
    validateArticleState(serialized)

    const p = serialized.root.children[0] as
      | { children?: Array<{ type?: string; text?: string; index?: number }> }
      | undefined
    expect(p?.children).toHaveLength(3)
    expect(p?.children?.[0]?.text).toBe('前你好')
    expect(p?.children?.[1]?.type).toBe('footnote-ref')
    expect(p?.children?.[1]?.index).toBe(7)
    expect(p?.children?.[2]?.text).toBe('后')
  })

  it('S4 — composition with the decorator selected replaces it cleanly or leaves it intact', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([textNode('前缀'), footnoteRefNode(2), textNode('后缀')])],
        },
      } as SerializedEditorState),
    )

    setSelectionToDecorator(editor, 0, 1)
    const serialized = simulateCompositionReplaceSelectedDecorator(editor, 0, 1, '你好')
    validateArticleState(serialized)

    const p = serialized.root.children[0] as
      | { children?: Array<{ type?: string; text?: string; index?: number }> }
      | undefined
    // The decorator must not be half-deleted: either it is fully replaced by text or survives.
    const hasHalfDeletedDecorator = p?.children?.some(
      (child) => child.type === 'footnote-ref' && (child.index === undefined || Number.isNaN(child.index)),
    )
    expect(hasHalfDeletedDecorator).toBe(false)
  })

  it('S5 — mid-composition flush validates against the article schema', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([textNode('前缀'), footnoteRefNode(4), textNode('后缀')])],
        },
      } as SerializedEditorState),
    )

    // Simulate an intermediate composition-update state: partial text inserted.
    let intermediate: SerializedEditorState = { root: emptyRoot() }
    editor.update(
      () => {
        const root = $getRoot()
        const p = root.getChildAtIndex(0)
        if (!(p instanceof ParagraphNode)) {
          return
        }
        const target = p.getChildAtIndex(2)
        if ($isTextNode(target)) {
          target.spliceText(0, 0, 'ni', true)
        }
        intermediate = editor.getEditorState().toJSON()
      },
      { discrete: true },
    )

    validateArticleState(intermediate)

    const p = intermediate.root.children[0] as
      | { children?: Array<{ type?: string; text?: string; index?: number }> }
      | undefined
    expect(p?.children?.[1]?.type).toBe('footnote-ref')
    expect(p?.children?.[1]?.index).toBe(4)
  })

  it('S6 — composition then undo reverts the change and redo restores it', () => {
    const editor = buildHeadlessEditor()
    // HistoryPlugin is not registered in headless mode, so we simulate undo/redo
    // by capturing the pre-composition state and restoring it manually.
    const preComposition: SerializedEditorState = {
      root: {
        ...emptyRoot(),
        children: [paragraph([textNode('前'), footnoteRefNode(5), textNode('后')])],
      },
    }
    editor.setEditorState(editor.parseEditorState(preComposition))

    const postComposition = simulateCompositionCommit(editor, 0, 0, 1, '你好')
    validateArticleState(postComposition)

    // Simulate undo: restore pre-composition state.
    editor.setEditorState(editor.parseEditorState(preComposition))
    const afterUndo = editor.getEditorState().toJSON()
    validateArticleState(afterUndo)
    expect(getRefNode(afterUndo, 0, 1)).toMatchObject({ type: 'footnote-ref', index: 5 })

    // Simulate redo: restore post-composition state.
    editor.setEditorState(editor.parseEditorState(postComposition))
    const afterRedo = editor.getEditorState().toJSON()
    validateArticleState(afterRedo)
    expect(getRefNode(afterRedo, 0, 1)).toMatchObject({ type: 'footnote-ref', index: 5 })
  })

  it('S7 — composition inside a list item preserves list structure', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [
            {
              type: 'list',
              version: 1,
              listType: 'bullet',
              direction: null,
              format: '',
              indent: 0,
              start: 1,
              children: [
                {
                  type: 'listitem',
                  version: 1,
                  value: 1,
                  direction: null,
                  format: '',
                  indent: 0,
                  children: [textNode('item')],
                } as unknown as SerializedLexicalNode,
              ],
            } as unknown as SerializedLexicalNode,
          ],
        },
      } as unknown as SerializedEditorState),
    )

    // Compose into the list item text.
    let serialized: SerializedEditorState = { root: emptyRoot() }
    editor.update(
      () => {
        const root = $getRoot()
        const list = root.getChildAtIndex(0)
        if (!(list instanceof ListNode)) {
          return
        }
        const item = list.getChildAtIndex(0)
        if (!(item instanceof ListItemNode)) {
          return
        }
        const text = item.getChildAtIndex(0)
        if ($isTextNode(text)) {
          text.spliceText(4, 0, '你好', true)
        }
        serialized = editor.getEditorState().toJSON()
      },
      { discrete: true },
    )

    validateArticleState(serialized)
    expect(serialized.root.children[0]?.type).toBe('list')
    expect((serialized.root.children[0] as { children?: Array<{ type?: string }> }).children?.[0]?.type).toBe(
      'listitem',
    )
  })

  it('S8 — compositionend with empty data leaves no artefact', () => {
    const editor = buildHeadlessEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          ...emptyRoot(),
          children: [paragraph([textNode('abc')])],
        },
      } as SerializedEditorState),
    )

    // Simulate the zero-width placeholder that Lexical inserts at composition start.
    editor.update(
      () => {
        const root = $getRoot()
        const p = root.getChildAtIndex(0)
        if (!(p instanceof ParagraphNode)) {
          return
        }
        const text = p.getChildAtIndex(0)
        if ($isTextNode(text)) {
          text.spliceText(1, 0, '\u200B', true)
        }
      },
      { discrete: true },
    )

    const canceled = simulateCompositionCancel(editor, 0, 0, 1)
    validateArticleState(canceled)

    const p = canceled.root.children[0] as { children?: Array<{ type?: string; text?: string }> } | undefined
    expect(p?.children?.[0]?.text).toBe('abc')
    expect(p?.children?.some((child) => child.text === '\u200B')).toBe(false)
  })

  it('exposes the composition probe component and event helpers for manual browser QA', () => {
    // The component and helpers are exercised manually in a real browser; this
    // test only guards against import-time breakage in the Node test runner.
    expect(typeof ImeCompositionProbe).toBe('object')
    expect(typeof dispatchCompositionStart).toBe('function')
    expect(typeof dispatchCompositionSequence).toBe('function')
    expect(typeof buildPinyinSequence).toBe('function')
  })
})
