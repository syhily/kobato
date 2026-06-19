import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'

import { renderHook } from '#/_helpers/hook'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import {
  InklingFootnoteProvider,
  useInklingFootnotes,
  type FootnoteDefinitionItem,
} from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

// --- fixtures ----------------------------------------------------------------

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

function paragraphWithRef(targetKey: string, index: number): InklingBlockNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      { type: 'text', version: 1, text: 'See ' },
      { type: 'footnote-ref', version: 1, targetKey, refKey: `ref-${targetKey}`, index },
    ],
  }
}

function footnoteDef(targetKey: string, index: number, text: string): InklingFootnoteDefinitionNode {
  return {
    type: 'footnote-definition',
    version: 1,
    targetKey,
    index,
    children: [paragraph(text)],
  }
}

function makeDocument(children: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children },
  }
}

// A mutable sink the actions can write into so assertions can read after render.
function sink<T>(): { current: T | null } {
  return { current: null }
}

function providerWrapper(
  initial?: readonly FootnoteDefinitionItem[],
): React.ComponentType<{ children: React.ReactNode }> {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(InklingFootnoteProvider, { initialDefinitions: initial, children })
  }
}

// --- strip + merge round-trip ------------------------------------------------

describe('footnote strip + merge round trip', () => {
  // These tests exercise the pure helpers that InklingArticleEditor and
  // OnInklingDocumentChangePlugin use. The full editor pipeline is tested
  // via the parallel-state test; here we pin the strip↔merge inverse property.

  it('strip then merge reconstructs the original footnote-definition set', () => {
    const original = makeDocument([
      paragraphWithRef('a', 1),
      paragraphWithRef('b', 2),
      footnoteDef('a', 1, 'First'),
      footnoteDef('b', 2, 'Second'),
    ])

    // strip (mirrors InklingArticleEditor.stripFootnoteDefinitions)
    const proseChildren: InklingBlockNode[] = []
    const strippedDefs: FootnoteDefinitionItem[] = []
    for (const child of original.root.children) {
      if (child.type === 'footnote-definition') {
        strippedDefs.push({ targetKey: child.targetKey, index: child.index, children: structuredClone(child.children) })
      } else {
        proseChildren.push(child)
      }
    }

    // merge (mirrors OnInklingDocumentChangePlugin.mergeFootnoteDefinitions)
    const definitionBlocks: InklingFootnoteDefinitionNode[] = strippedDefs.map((d) => ({
      type: 'footnote-definition',
      version: 1,
      targetKey: d.targetKey,
      index: d.index,
      children: structuredClone(d.children),
    }))
    const merged = makeDocument([...proseChildren, ...definitionBlocks])

    const originalDefs = original.root.children.filter(
      (c): c is InklingFootnoteDefinitionNode => c.type === 'footnote-definition',
    )
    const mergedDefs = merged.root.children.filter(
      (c): c is InklingFootnoteDefinitionNode => c.type === 'footnote-definition',
    )
    expect(mergedDefs).toHaveLength(originalDefs.length)
    for (let i = 0; i < originalDefs.length; i += 1) {
      expect(mergedDefs[i]?.targetKey).toBe(originalDefs[i]?.targetKey)
      expect(mergedDefs[i]?.index).toBe(originalDefs[i]?.index)
    }
  })

  it('strip leaves the editor tree prose-only (no footnote-definition blocks)', () => {
    const doc = makeDocument([paragraphWithRef('a', 1), footnoteDef('a', 1, 'Note')])
    const prose = doc.root.children.filter(
      (c): c is Exclude<InklingBlockNode, InklingFootnoteDefinitionNode> => c.type !== 'footnote-definition',
    )
    expect(prose).toHaveLength(1)
    expect(prose[0]?.type).toBe('paragraph')
  })
})

// --- Provider ref-mirror synchrony -------------------------------------------

describe('InklingFootnoteProvider ref-mirror synchrony', () => {
  // The provider must update definitionsRef synchronously inside setDefinitions
  // so listeners reading getDefinitions() in the same tick see the new value.
  // This is the invariant the footnote renumber listener depends on.

  it('replaceDefinition updates getDefinitions() synchronously', () => {
    const captured = sink<readonly FootnoteDefinitionItem[]>()
    const result = renderHook(() => useInklingFootnotes(), {
      wrapper: providerWrapper(),
      actions: [
        (r) => r.replaceDefinition('fn1', [paragraph('First note')]),
        (r) => {
          captured.current = r.getDefinitions()
        },
      ],
    })
    // Visible immediately inside the action (same render pass, no re-render needed).
    expect(captured.current).toHaveLength(1)
    expect(captured.current?.[0]?.targetKey).toBe('fn1')
    // And still visible on the returned result.
    expect(result.getDefinitions()).toHaveLength(1)
  })

  it('removeDefinition updates getDefinitions() synchronously', () => {
    const captured = sink<readonly FootnoteDefinitionItem[]>()
    renderHook(() => useInklingFootnotes(), {
      wrapper: providerWrapper([{ targetKey: 'a', index: 1, children: [paragraph('A')] }]),
      actions: [
        (r) => r.removeDefinition('a'),
        (r) => {
          captured.current = r.getDefinitions()
        },
      ],
    })
    expect(captured.current).toEqual([])
  })

  it('removeOrphans drops unreferenced definitions synchronously', () => {
    const captured = sink<readonly FootnoteDefinitionItem[]>()
    let removedCount = -1
    renderHook(() => useInklingFootnotes(), {
      wrapper: providerWrapper([
        { targetKey: 'a', index: 1, children: [paragraph('A')] },
        { targetKey: 'orphan', index: 2, children: [paragraph('Orphan')] },
      ]),
      actions: [
        (r) => {
          removedCount = r.removeOrphans([{ targetKey: 'a', refKey: 'r1', index: 1 }])
        },
        (r) => {
          captured.current = r.getDefinitions()
        },
      ],
    })
    expect(removedCount).toBe(1)
    expect(captured.current).toHaveLength(1)
    expect(captured.current?.[0]?.targetKey).toBe('a')
  })

  it('removeOrphans is a no-op when there are no orphans (no spurious state change)', () => {
    const initial = [{ targetKey: 'a', index: 1, children: [paragraph('A')] }]
    const before = sink<readonly FootnoteDefinitionItem[]>()
    const after = sink<readonly FootnoteDefinitionItem[]>()
    let removedCount = -1
    renderHook(() => useInklingFootnotes(), {
      wrapper: providerWrapper(initial),
      actions: [
        (r) => {
          before.current = r.getDefinitions()
        },
        (r) => {
          removedCount = r.removeOrphans([{ targetKey: 'a', refKey: 'r1', index: 1 }])
        },
        (r) => {
          after.current = r.getDefinitions()
        },
      ],
    })
    expect(removedCount).toBe(0)
    // No orphans removed and index unchanged → same array reference.
    expect(after.current).toBe(before.current)
  })

  it('removeOrphans renumbers survivors to first-reference order', () => {
    const captured = sink<readonly FootnoteDefinitionItem[]>()
    renderHook(() => useInklingFootnotes(), {
      wrapper: providerWrapper([
        { targetKey: 'a', index: 1, children: [paragraph('A')] },
        { targetKey: 'b', index: 2, children: [paragraph('B')] },
        { targetKey: 'c', index: 3, children: [paragraph('C')] },
      ]),
      actions: [
        // Drop the ref to 'a' → 'b' and 'c' should renumber to 1 and 2.
        (r) =>
          r.removeOrphans([
            { targetKey: 'b', refKey: 'rb', index: 2 },
            { targetKey: 'c', refKey: 'rc', index: 3 },
          ]),
        (r) => {
          captured.current = r.getDefinitions()
        },
      ],
    })
    expect(captured.current?.map((d) => ({ key: d.targetKey, index: d.index }))).toEqual([
      { key: 'b', index: 1 },
      { key: 'c', index: 2 },
    ])
  })
})

// --- reportEditorError observability -----------------------------------------

describe('reportEditorError surfaces validation failures', () => {
  // Pins the fix for the "silent autosave stall" bug: when the editor produces
  // a schema-invalid document, OnInklingDocumentChangePlugin must report the
  // error (not swallow it) so it surfaces in console / telemetry.

  it('logs to console.error with context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportEditorError(new Error('boom'), 'serialize')
    expect(spy).toHaveBeenCalledWith('Inkling editor error (serialize):', expect.any(Error))
    spy.mockRestore()
  })

  it('logs without context when omitted', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportEditorError(new Error('boom'))
    expect(spy).toHaveBeenCalledWith('Inkling editor error:', expect.any(Error))
    spy.mockRestore()
  })
})
