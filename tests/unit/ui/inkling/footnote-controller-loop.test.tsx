import type { SerializedEditorState } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $createParagraphNode, $createTextNode, $getRoot, ParagraphNode } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { InklingFootnoteRefEntry } from '@/shared/inkling/footnotes'
import type { InklingBlockNode, InklingDocument, InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { collectFootnoteRefs } from '@/shared/inkling/footnotes'
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
import { FootnoteRefNode, $createFootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { generateFootnoteKey } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import {
  applyFootnoteRenumberWithHistoryMerge,
  buildFootnoteIndexMap,
  footnoteSyncSignature,
} from '@/ui/inkling/editor/footnotes/renumber'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

// This test pins the FootnoteController update-listener loop-prevention
// invariants by simulating the listener chain on a real headless editor:
//   1. editor update → read refs
//   2. removeOrphans (simulated via the provider's pure renumber)
//   3. signature gate → renumber only when changed
//   4. the renumber's own update must not re-trigger renumber (bounded loop)
//
// We don't mount the React components; we replicate the listener wiring
// against the headless editor + a plain definitions array, which is exactly
// the logic FootnoteController.tsx:127-172 runs.

interface ListenerSimulatorState {
  definitions: { targetKey: string; index: number; children: InklingNonRecursiveBlockNode[] }[]
  lastSignature: string
  renumberCount: number
}

function buildHeadlessArticleEditor() {
  return createHeadlessEditor({
    namespace: 'footnote-controller-loop-test',
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Test editor error:', error)
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

function refText(targetKey: string, index: number, label = ''): InklingBlockNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      { type: 'text', version: 1, text: label },
      { type: 'footnote-ref', version: 1, targetKey, refKey: `ref-${targetKey}`, index },
    ],
  }
}

/** Build a live paragraph node containing a text label + a footnote ref. */
function $createRefParagraph(targetKey: string, index: number, label = ''): ParagraphNode {
  const p = $createParagraphNode()
  p.append($createTextNode(label), $createFootnoteRefNode(targetKey, `ref-${targetKey}`, index))
  return p
}

function editorStateToDocumentRoot(editor: ReturnType<typeof buildHeadlessArticleEditor>): InklingDocument {
  return editorStateToInklingDocument(editor.getEditorState())
}

function readRefIndices(editor: ReturnType<typeof buildHeadlessArticleEditor>): { targetKey: string; index: number }[] {
  const out: { targetKey: string; index: number }[] = []
  editor.getEditorState().read(() => {
    const visit = (node: { __key: string } & { getChildren?: () => unknown[] }): void => {
      if (node instanceof FootnoteRefNode) {
        out.push({ targetKey: node.getTargetKey(), index: node.getIndex() })
        return
      }
      const getChildren = (node as { getChildren?: () => unknown[] }).getChildren
      if (typeof getChildren === 'function') {
        for (const child of getChildren.call(node) as unknown[]) {
          visit(child as { __key: string } & { getChildren?: () => unknown[] })
        }
      }
    }
    const root = $getRoot()
    for (const child of root.getChildren()) {
      visit(child)
    }
  })
  return out
}

/**
 * The core listener logic, mirroring FootnoteController.tsx:127-172 but
 * driven synchronously by the test. Returns whether a renumber was dispatched.
 */
function runListenerPass(
  editor: ReturnType<typeof buildHeadlessArticleEditor>,
  state: ListenerSimulatorState,
): boolean {
  const refs = collectFootnoteRefs(editorStateToDocumentRoot(editor))

  // removeOrphans simulation: drop definitions with no ref.
  const referenced = new Set(refs.map((r) => r.targetKey))
  state.definitions = state.definitions.filter((d) => referenced.has(d.targetKey))

  const preSignature = footnoteSyncSignature(refs, state.definitions)
  if (preSignature === state.lastSignature) {
    return false
  }

  // Project the post-renumber signature (the controller stores this so the
  // renumber's own update-listener fire short-circuits).
  const indexMap = buildFootnoteIndexMap(refs, state.definitions)
  const projectedRefs = refs.map((r) => ({ ...r, index: indexMap.get(r.targetKey) ?? r.index }))
  const projectedDefs = state.definitions.map((d) => ({
    ...d,
    index: indexMap.get(d.targetKey) ?? d.index,
  }))
  state.lastSignature = footnoteSyncSignature(projectedRefs, projectedDefs)

  applyFootnoteRenumberWithHistoryMerge(editor, refs, state.definitions)
  // Also mirror the provider renumber so definitions stay in sync.
  state.definitions = projectedDefs
  state.renumberCount += 1
  return true
}

describe('FootnoteController update-listener loop prevention', () => {
  it('renumbers stale ref indices on the first pass', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [refText('b', 3, 'B first '), refText('a', 1, 'A second ')],
        },
      } as unknown as SerializedEditorState),
    )
    const state: ListenerSimulatorState = {
      definitions: [
        { targetKey: 'b', index: 3, children: [] },
        { targetKey: 'a', index: 1, children: [] },
      ],
      lastSignature: '',
      renumberCount: 0,
    }

    const dispatched = runListenerPass(editor, state)
    expect(dispatched).toBe(true)
    // b is referenced first → index 1; a second → index 2.
    expect(readRefIndices(editor)).toEqual([
      { targetKey: 'b', index: 1 },
      { targetKey: 'a', index: 2 },
    ])
    expect(state.definitions.map((d) => ({ key: d.targetKey, index: d.index }))).toEqual([
      { key: 'b', index: 1 },
      { key: 'a', index: 2 },
    ])
  })

  it('does NOT renumber on the second pass (signature gate short-circuits)', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [refText('a', 5, 'stale ')],
        },
      } as unknown as SerializedEditorState),
    )
    const state: ListenerSimulatorState = {
      definitions: [{ targetKey: 'a', index: 5, children: [] }],
      lastSignature: '',
      renumberCount: 0,
    }

    expect(runListenerPass(editor, state)).toBe(true)
    expect(state.renumberCount).toBe(1)
    // Second pass: indices are now correct (a=1), signature matches → no dispatch.
    expect(runListenerPass(editor, state)).toBe(false)
    expect(state.renumberCount).toBe(1)
  })

  it('inserting a second ref triggers exactly one renumber, then stabilises', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [refText('a', 1, 'first ')],
        },
      } as unknown as SerializedEditorState),
    )
    const state: ListenerSimulatorState = {
      definitions: [{ targetKey: 'a', index: 1, children: [] }],
      lastSignature: '',
      renumberCount: 0,
    }

    // Pass 1: stabilise.
    runListenerPass(editor, state)
    expect(state.renumberCount).toBe(1)

    // Insert a second ref to 'b' at the end (index 0 = stale).
    editor.update(
      () => {
        const root = $getRoot()
        root.append($createRefParagraph('b', 0, 'second '))
      },
      { discrete: true },
    )
    state.definitions.push({ targetKey: 'b', index: 0, children: [] })

    // Pass 2: should renumber (b promoted to 2). Wait — a is still referenced
    // first so a=1, b=2. Signature changed → dispatch.
    expect(runListenerPass(editor, state)).toBe(true)
    expect(state.renumberCount).toBe(2)
    expect(readRefIndices(editor)).toEqual([
      { targetKey: 'a', index: 1 },
      { targetKey: 'b', index: 2 },
    ])

    // Pass 3: stable, no dispatch.
    expect(runListenerPass(editor, state)).toBe(false)
    expect(state.renumberCount).toBe(2)
  })

  it('deleting the only ref to a definition drops it (orphan cleanup)', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [refText('a', 1, 'only ')],
        },
      } as unknown as SerializedEditorState),
    )
    const state: ListenerSimulatorState = {
      definitions: [{ targetKey: 'a', index: 1, children: [] }],
      lastSignature: '',
      renumberCount: 0,
    }

    runListenerPass(editor, state)

    // Delete the ref node — replace with a plain paragraph.
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        const p = $createParagraphNode()
        p.append($createTextNode('No more refs'))
        root.append(p)
      },
      { discrete: true },
    )

    runListenerPass(editor, state)
    // 'a' had no remaining ref → dropped as orphan.
    expect(state.definitions).toHaveLength(0)
    expect(readRefIndices(editor)).toEqual([])
  })

  it('swapping ref order renumbers (1,2 → 2,1 becomes 1,2 again by first-ref)', () => {
    const editor = buildHeadlessArticleEditor()
    editor.setEditorState(
      editor.parseEditorState({
        root: {
          type: 'root',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [refText('a', 1, 'a '), refText('b', 2, 'b ')],
        },
      } as unknown as SerializedEditorState),
    )
    const state: ListenerSimulatorState = {
      definitions: [
        { targetKey: 'a', index: 1, children: [] },
        { targetKey: 'b', index: 2, children: [] },
      ],
      lastSignature: '',
      renumberCount: 0,
    }
    runListenerPass(editor, state)
    expect(state.renumberCount).toBe(1)

    // Move 'b' before 'a' (simulate cut/paste reordering).
    editor.update(
      () => {
        const root = $getRoot()
        root.clear()
        root.append($createRefParagraph('b', 2, 'b now first '), $createRefParagraph('a', 1, 'a second '))
      },
      { discrete: true },
    )

    expect(runListenerPass(editor, state)).toBe(true)
    // b is now referenced first → b=1, a=2.
    expect(readRefIndices(editor)).toEqual([
      { targetKey: 'b', index: 1 },
      { targetKey: 'a', index: 2 },
    ])
  })

  it('generateFootnoteKey produces 12-char base-36 strings', () => {
    const key = generateFootnoteKey()
    expect(key).toHaveLength(12)
    expect(key).toMatch(/^[0-9a-z]+$/)
    // Two calls produce different keys (entropy check).
    const key2 = generateFootnoteKey()
    expect(key2).not.toBe(key)
  })
})
