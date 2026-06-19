import type { LexicalNode, SerializedEditorState, SerializedRootNode } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $getRoot, $isElementNode, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingInlineNode,
  InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import {
  collectFootnoteRefs,
  removeOrphanFootnoteDefinitions,
  synchronizeInklingFootnoteIndices,
} from '@/shared/inkling/footnotes'
import { INKLING_SCHEMA_VERSION } from '@/shared/inkling/schema'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import {
  applyFootnoteRenumberWithHistoryMerge,
  buildFootnoteIndexMap,
  footnoteSyncSignature,
} from '@/ui/inkling/editor/footnotes/renumber'

// --- fixtures ----------------------------------------------------------------

function makeDocument(rootChildren: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: rootChildren,
    },
  }
}

function paragraph(text: string): InklingNonRecursiveBlockNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{ type: 'text', version: 1, text }],
  }
}

function paragraphWithRefs(...refs: { targetKey: string; index: number }[]): InklingBlockNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      { type: 'text', version: 1, text: 'See ' },
      ...refs.map(
        (r) =>
          ({
            type: 'footnote-ref',
            version: 1,
            targetKey: r.targetKey,
            refKey: `ref-${r.targetKey}`,
            index: r.index,
          }) as InklingInlineNode,
      ),
    ],
  }
}

function definition(targetKey: string, index: number, text: string): InklingFootnoteDefinitionNode {
  return {
    type: 'footnote-definition',
    version: 1,
    targetKey,
    index,
    children: [paragraph(text)],
  }
}

function buildHeadlessArticleEditor() {
  return createHeadlessEditor({
    namespace: 'inkling-footnote-parallel-state-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Headless footnote test error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      FootnoteRefNode,
      InlineMathNode,
      ImageCardNode,
      CodeCardNode,
      MathCardNode,
      MusicCardNode,
      HorizontalRuleCardNode,
      TableCardNode,
      SolutionCardNode,
      TwoColumnCardNode,
    ],
  })
}

function editorStateToDocument(editorState: { toJSON: () => { root: unknown } }): InklingDocument {
  const serialized = editorState.toJSON()
  return {
    _type: 'inkling',
    schemaVersion: INKLING_SCHEMA_VERSION,
    lexicalVersion: '0.45.0',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: serialized.root as InklingDocument['root'],
  }
}

// --- the strip/merge round trip (read-time strip + save-time merge) ---------

describe('footnote parallel-state: strip + merge round trip', () => {
  it('strip removes footnote-definition blocks and keeps prose', () => {
    const doc = makeDocument([
      paragraphWithRefs({ targetKey: 'a', index: 1 }),
      definition('a', 1, 'First note'),
      definition('b', 2, 'Orphan note'),
    ])
    const proseChildren = doc.root.children.filter((c) => c.type !== 'footnote-definition')
    const defChildren = doc.root.children.filter(
      (c): c is InklingFootnoteDefinitionNode => c.type === 'footnote-definition',
    )
    expect(proseChildren).toHaveLength(1)
    expect(proseChildren[0]?.type).toBe('paragraph')
    expect(defChildren).toHaveLength(2)
    expect(defChildren.map((d) => d.targetKey)).toEqual(['a', 'b'])
  })

  it('merge reconstructs the persisted shape: prose first, definitions at tail', () => {
    const prose: InklingBlockNode[] = [paragraphWithRefs({ targetKey: 'a', index: 1 })]
    const definitions: FootnoteDefinitionItem[] = [{ targetKey: 'a', index: 1, children: [paragraph('First note')] }]
    const definitionBlocks: InklingFootnoteDefinitionNode[] = definitions.map((d) => ({
      type: 'footnote-definition',
      version: 1,
      targetKey: d.targetKey,
      index: d.index,
      children: structuredClone(d.children),
    }))
    const merged = makeDocument([...prose, ...definitionBlocks])
    const canonical = synchronizeInklingFootnoteIndices(merged).document
    expect(canonical.root.children.map((c) => c.type)).toEqual(['paragraph', 'footnote-definition'])
  })
})

// --- renumber: first-reference order -----------------------------------------

describe('footnote parallel-state: renumber via buildFootnoteIndexMap', () => {
  it('assigns indices by first-reference document order', () => {
    const refs = collectFootnoteRefs(
      makeDocument([paragraphWithRefs({ targetKey: 'b', index: 0 }, { targetKey: 'a', index: 0 })]),
    )
    const map = buildFootnoteIndexMap(refs, [])
    expect(map.get('b')).toBe(1)
    expect(map.get('a')).toBe(2)
  })

  it('keeps unreferenced definitions at the tail', () => {
    const refs = collectFootnoteRefs(makeDocument([paragraphWithRefs({ targetKey: 'a', index: 1 })]))
    const definitions: FootnoteDefinitionItem[] = [
      { targetKey: 'a', index: 1, children: [paragraph('A')] },
      { targetKey: 'orphan', index: 0, children: [paragraph('Orphan')] },
    ]
    const map = buildFootnoteIndexMap(refs, definitions)
    expect(map.get('a')).toBe(1)
    expect(map.get('orphan')).toBe(2)
  })

  it('dedupes refs pointing to the same definition', () => {
    const refs = collectFootnoteRefs(
      makeDocument([paragraphWithRefs({ targetKey: 'a', index: 1 }, { targetKey: 'a', index: 1 })]),
    )
    const map = buildFootnoteIndexMap(refs, [{ targetKey: 'a', index: 1, children: [paragraph('A')] }])
    expect(map.get('a')).toBe(1)
    expect(map.size).toBe(1)
  })
})

// --- signature: loop prevention ----------------------------------------------

describe('footnote parallel-state: footnoteSyncSignature', () => {
  it('is stable for identical ref+definition state', () => {
    const refs = collectFootnoteRefs(makeDocument([paragraphWithRefs({ targetKey: 'a', index: 1 })]))
    const defs: FootnoteDefinitionItem[] = [{ targetKey: 'a', index: 1, children: [paragraph('A')] }]
    expect(footnoteSyncSignature(refs, defs)).toBe(footnoteSyncSignature(refs, defs))
  })

  it('changes when a ref index changes', () => {
    const refs1 = collectFootnoteRefs(makeDocument([paragraphWithRefs({ targetKey: 'a', index: 1 })]))
    const refs2 = collectFootnoteRefs(makeDocument([paragraphWithRefs({ targetKey: 'a', index: 2 })]))
    const defs: FootnoteDefinitionItem[] = [{ targetKey: 'a', index: 1, children: [paragraph('A')] }]
    expect(footnoteSyncSignature(refs1, defs)).not.toBe(footnoteSyncSignature(refs2, defs))
  })

  it('changes when a definition is added or removed', () => {
    const refs = collectFootnoteRefs(makeDocument([paragraphWithRefs({ targetKey: 'a', index: 1 })]))
    const oneDef: FootnoteDefinitionItem[] = [{ targetKey: 'a', index: 1, children: [paragraph('A')] }]
    const twoDefs: FootnoteDefinitionItem[] = [
      { targetKey: 'a', index: 1, children: [paragraph('A')] },
      { targetKey: 'b', index: 2, children: [paragraph('B')] },
    ]
    expect(footnoteSyncSignature(refs, oneDef)).not.toBe(footnoteSyncSignature(refs, twoDefs))
  })
})

// --- orphan cleanup ----------------------------------------------------------

describe('footnote parallel-state: removeOrphanFootnoteDefinitions', () => {
  it('drops definitions with no matching ref', () => {
    const doc = makeDocument([
      paragraphWithRefs({ targetKey: 'a', index: 1 }),
      definition('a', 1, 'A'),
      definition('orphan', 2, 'Orphan'),
    ])
    const cleaned = removeOrphanFootnoteDefinitions(doc)
    const defs = cleaned.root.children.filter(
      (c): c is InklingFootnoteDefinitionNode => c.type === 'footnote-definition',
    )
    expect(defs.map((d) => d.targetKey)).toEqual(['a'])
  })

  it('keeps definitions that still have a ref', () => {
    const doc = makeDocument([
      paragraphWithRefs({ targetKey: 'a', index: 1 }, { targetKey: 'b', index: 2 }),
      definition('a', 1, 'A'),
      definition('b', 2, 'B'),
    ])
    const cleaned = removeOrphanFootnoteDefinitions(doc)
    const defs = cleaned.root.children.filter(
      (c): c is InklingFootnoteDefinitionNode => c.type === 'footnote-definition',
    )
    expect(defs.map((d) => d.targetKey).sort()).toEqual(['a', 'b'])
  })
})

// --- editor-tree renumber (live indices on FootnoteRefNode) ------------------

describe('footnote parallel-state: applyFootnoteRenumberWithHistoryMerge', () => {
  function editorWithRefs(
    ...refs: { targetKey: string; index: number }[]
  ): ReturnType<typeof buildHeadlessArticleEditor> {
    const editor = buildHeadlessArticleEditor()
    const state: SerializedEditorState = {
      root: {
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
            children: [
              { type: 'text', version: 1, text: 'See ' },
              ...refs.map(
                (r) =>
                  ({
                    type: 'footnote-ref',
                    version: 1,
                    targetKey: r.targetKey,
                    refKey: `ref-${r.targetKey}`,
                    index: r.index,
                  }) as const,
              ),
            ],
          },
        ],
      } as unknown as SerializedRootNode,
    }
    editor.setEditorState(editor.parseEditorState(state))
    return editor
  }

  function readRefIndices(
    editor: ReturnType<typeof buildHeadlessArticleEditor>,
  ): { targetKey: string; index: number }[] {
    const out: { targetKey: string; index: number }[] = []
    editor.getEditorState().read(() => {
      const root = $getRoot()
      // Walk in document order so the returned array matches first-reference
      // order (the same order `collectFootnoteRefs` uses).
      const visit = (node: LexicalNode): void => {
        if (node instanceof FootnoteRefNode) {
          out.push({ targetKey: node.getTargetKey(), index: node.getIndex() })
          return
        }
        if ($isElementNode(node)) {
          for (const child of node.getChildren()) {
            visit(child)
          }
        }
      }
      for (const child of root.getChildren()) {
        visit(child)
      }
    })
    return out
  }

  it('rewrites ref indices in place to follow first-reference order', () => {
    // Refs start with stale indices (3, 1) — first-ref order should be (1, 2).
    const editor = editorWithRefs({ targetKey: 'b', index: 3 }, { targetKey: 'a', index: 1 })
    const refs = collectFootnoteRefs(editorStateToDocument(editor.getEditorState()))
    const definitions: FootnoteDefinitionItem[] = [
      { targetKey: 'b', index: 3, children: [paragraph('B')] },
      { targetKey: 'a', index: 1, children: [paragraph('A')] },
    ]
    applyFootnoteRenumberWithHistoryMerge(editor, refs, definitions)
    expect(readRefIndices(editor)).toEqual([
      { targetKey: 'b', index: 1 },
      { targetKey: 'a', index: 2 },
    ])
  })

  it('is idempotent: running twice with the same input produces the same state', () => {
    const editor = editorWithRefs({ targetKey: 'a', index: 1 }, { targetKey: 'b', index: 2 })
    const refs = collectFootnoteRefs(editorStateToDocument(editor.getEditorState()))
    const definitions: FootnoteDefinitionItem[] = [
      { targetKey: 'a', index: 1, children: [paragraph('A')] },
      { targetKey: 'b', index: 2, children: [paragraph('B')] },
    ]
    applyFootnoteRenumberWithHistoryMerge(editor, refs, definitions)
    const afterFirst = readRefIndices(editor)
    const refs2 = collectFootnoteRefs(editorStateToDocument(editor.getEditorState()))
    applyFootnoteRenumberWithHistoryMerge(editor, refs2, definitions)
    expect(readRefIndices(editor)).toEqual(afterFirst)
  })

  it('does not throw when the editor tree has no refs', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
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
              children: [{ type: 'text', version: 1, text: 'No footnotes here' }],
            },
          ],
        } as unknown as SerializedRootNode,
      }),
    )
    expect(() => applyFootnoteRenumberWithHistoryMerge(editor, [], [])).not.toThrow()
  })
})

// --- editor tree is prose-only after strip (no FootnoteDefinitionNode) -------

describe('footnote parallel-state: editor tree never contains footnote-definition', () => {
  it('FootnoteDefinitionNode is not registered in the article editor node set', () => {
    // The article editor no longer registers FootnoteDefinitionNode. A document
    // containing a footnote-definition block, when parsed, should drop the
    // unknown block rather than render it as an editable section.
    const editor = buildHeadlessArticleEditor()
    const state: SerializedEditorState = {
      root: {
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
            children: [{ type: 'text', version: 1, text: 'Prose' }],
          },
          {
            type: 'footnote-definition',
            version: 1,
            targetKey: 'a',
            index: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [],
          },
        ],
      } as unknown as SerializedRootNode,
    }
    // parseEditorState on an unregistered node type should not throw; Lexical
    // will simply skip the unknown block.
    expect(() => editor.setEditorState(editor.parseEditorState(state))).not.toThrow()
    const serialized = editor.getEditorState().toJSON()
    const types = (serialized.root as { children: { type: string }[] }).children.map((c) => c.type)
    // The footnote-definition block is dropped because the node class is not
    // registered — exactly the isolation we want.
    expect(types).not.toContain('footnote-definition')
  })
})
