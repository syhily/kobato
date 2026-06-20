// Regression tests for OnInklingDocumentChangePlugin — the debounced
// serialize + footnote-merge + schema-validate bridge between Lexical's
// OnChangePlugin and the editor's onChange callback.
//
// Tests:
//   1. The plugin mounts without throwing inside a LexicalComposer.
//   2. onChange fires after a debounce delay when content changes.
//   3. onChange does NOT fire synchronously (debounce is working).
//
// The footnote-merge logic and schema validation are already covered by
// `editor-serialize-and-validation.test.tsx`; here we focus on the plugin's
// React-level behaviour (mount + debounce + callback invocation).

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { act, render } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'
import { OnInklingDocumentChangePlugin } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'

function EditorCapture({ holder }: { holder: { current: LexicalEditor | null } }) {
  const [editor] = useLexicalComposerContext()
  holder.current = editor
  return null
}

function mountWithPlugin(onChange: (doc: InklingDocument) => void) {
  const holder: { current: LexicalEditor | null } = { current: null }
  render(
    <LexicalComposer
      initialConfig={{
        namespace: 'on-change-test',
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

describe('OnInklingDocumentChangePlugin', () => {
  it('mounts without throwing', () => {
    expect(() => mountWithPlugin(vi.fn())).not.toThrow()
  })

  it('does NOT call onChange synchronously on mount', () => {
    const onChange = vi.fn()
    mountWithPlugin(onChange)
    // Right after mount, before any debounce fires, onChange should not
    // have been called.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange after debounce when content changes', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const holder = mountWithPlugin(onChange)
    const editor = holder.current!

    // Seed content — this triggers the OnChangePlugin which our wrapper debounces.
    act(() => {
      editor.update(
        () => {
          const root = $getRoot()
          root.clear()
          const para = $createParagraphNode()
          para.append($createTextNode('Hello'))
          root.append(para)
        },
        { discrete: true },
      )
    })

    // onChange should NOT fire immediately (debounce)
    expect(onChange).not.toHaveBeenCalled()

    // Advance past the debounce (120ms) — onChange should now fire.
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const doc = onChange.mock.calls[0]![0]
    expect(doc._type).toBe('inkling')

    vi.useRealTimers()
  })
})
