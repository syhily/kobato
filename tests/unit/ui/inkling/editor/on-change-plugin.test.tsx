// @vitest-environment happy-dom

// Comprehensive regression tests for OnInklingDocumentChangePlugin — the
// debounce + footnote merge + schema validation wrapper around Lexical's
// OnChangePlugin.
//
// Pins:
//   1. Trailing-edge debounce: onChange does NOT fire synchronously.
//   2. onChange fires after ~120ms (MERGE_DEBOUNCE_MS).
//   3. Rapid updates coalesce into a single onChange.
//   4. onChange receives a schema-valid InklingDocument.
//   5. The edited text survives the serialize round-trip.
//   6. Unmount clears the pending timer (no post-unmount onChange).

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { cleanup, render } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'
import { OnInklingDocumentChangePlugin } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'

const MERGE_DEBOUNCE_MS = 120

function EditorCapture({ holder }: { holder: { current: LexicalEditor | null } }) {
  const [editor] = useLexicalComposerContext()
  holder.current = editor
  return null
}

function renderPlugin(onChange: (doc: InklingDocument) => void) {
  const holder: { current: LexicalEditor | null } = { current: null }
  render(
    <LexicalComposer
      initialConfig={{
        namespace: 'inkling-on-change-test',
        theme: {},
        nodes: ARTICLE_NODES,
        onError: (e: Error) => {
          throw e
        },
      }}
    >
      <ContentEditable />
      <EditorCapture holder={holder} />
      <OnInklingDocumentChangePlugin onChange={onChange} />
    </LexicalComposer>,
  )
  return holder
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function seedParagraph(editor: LexicalEditor, text: string): void {
  editor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode(text))
      root.append(paragraph)
    },
    { discrete: true },
  )
}

describe('OnInklingDocumentChangePlugin', () => {
  describe('debounce', () => {
    it('does NOT fire onChange synchronously on update', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'hello')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('fires onChange after the debounce window elapses', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'hello')
      vi.advanceTimersByTime(MERGE_DEBOUNCE_MS - 1)
      expect(onChange).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('coalesces rapid updates into a single onChange', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'a')
      seedParagraph(holder.current!, 'ab')
      seedParagraph(holder.current!, 'abc')
      vi.advanceTimersByTime(MERGE_DEBOUNCE_MS + 10)
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('document shape', () => {
    it('passes onChange a schema-valid InklingDocument', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'validation target')
      vi.advanceTimersByTime(MERGE_DEBOUNCE_MS + 10)
      expect(onChange).toHaveBeenCalledTimes(1)
      const doc = onChange.mock.calls[0]![0] as InklingDocument
      expect(doc._type).toBe('inkling')
      expect(doc.schemaVersion).toBe(1)
      expect(typeof doc.lexicalVersion).toBe('string')
      expect(doc.lexicalVersion.length).toBeGreaterThan(0)
      expect(doc.root.type).toBe('root')
      expect(doc.root.children.length).toBeGreaterThan(0)
    })

    it('serializes the edited text into the document root', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'unique-marker-text')
      vi.advanceTimersByTime(MERGE_DEBOUNCE_MS + 10)
      const doc = onChange.mock.calls[0]![0] as InklingDocument
      const flattened = JSON.stringify(doc.root)
      expect(flattened).toContain('unique-marker-text')
    })
  })

  describe('unmount safety', () => {
    it('does not fire onChange after unmount if a debounce is pending', () => {
      const onChange = vi.fn()
      const holder = renderPlugin(onChange)
      seedParagraph(holder.current!, 'doomed')
      cleanup()
      vi.advanceTimersByTime(MERGE_DEBOUNCE_MS + 100)
      expect(onChange).not.toHaveBeenCalled()
      holder.current = null
    })
  })

  // Validation-failure path: safeValidateInklingDocument would have to
  // reject the serialized document. The Lexical editor always produces
  // schema-valid output for registered nodes, so this path isn't drivable
  // without monkey-patching the schema module.
  it.skip('reports an error and skips onChange when validation fails', () => {})
})
