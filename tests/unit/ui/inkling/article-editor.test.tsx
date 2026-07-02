// @vitest-environment happy-dom

// Mounts the real `InklingArticleEditor` (vendored Koenig-derived composer +
// yufan.me integration layer) in happy-dom and exercises the shell contract:
// hydration renders the document, the flush handle round-trips it losslessly
// (including the parallel-state footnote-definition merge), and programmatic
// edits reach both the flush handle and `onDocumentChange`.

import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { act, render } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingInlineNode,
  InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'
import type { InklingFlushHandle } from '@/ui/inkling/editor/article/article-editor-types'

import { INKLING_LEXICAL_VERSION } from '@/shared/inkling/schema'
import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'

// Fixtures use the full Lexical-emitted field set (text nodes carry
// `detail/format/mode/style`, elements carry `direction/format/indent`)
// because that is the shape real editor output persists — hand-written
// minimal fixtures would gain those fields on the way out by design and the
// deep-equality assertions below would fail spuriously.
function text(value: string, format = 0): InklingInlineNode {
  return { type: 'text', version: 1, text: value, detail: 0, format, mode: 'normal', style: '' }
}

function paragraph(children: InklingInlineNode[]): InklingNonRecursiveBlockNode {
  return { type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children }
}

function fixtureDocument(): InklingDocument {
  const children: InklingBlockNode[] = [
    paragraph([
      text('这是一段正文内容'),
      { type: 'footnote-ref', version: 1, targetKey: 'fn-a', refKey: 'ref-a', index: 1 },
    ]),
    { type: 'code-block', version: 1, code: "console.log('hi')", language: 'ts', highlightedHtml: undefined },
    // Trailing paragraph so the document already matches the canonical
    // "cards are never the last child" shape the editor maintains.
    paragraph([text('结尾段落')]),
    {
      type: 'footnote-definition',
      version: 1,
      targetKey: 'fn-a',
      index: 1,
      children: [paragraph([text('脚注内容')])],
    },
  ]
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children },
  }
}

interface Mounted {
  container: HTMLElement
  editorRef: RefObject<LexicalEditor | null>
  flushHandleRef: RefObject<InklingFlushHandle | null>
  onDocumentChange: ReturnType<typeof vi.fn<(document: InklingDocument) => void>>
}

function mountArticleEditor(document: InklingDocument): Mounted {
  const editorRef: RefObject<LexicalEditor | null> = { current: null }
  const flushHandleRef: RefObject<InklingFlushHandle | null> = { current: null }
  const onDocumentChange = vi.fn<(document: InklingDocument) => void>()
  // `LexicalCollaboration` provides the collaboration context the vendored
  // composable editor reads via `useCollaborationContext` — Lexical 0.46's
  // dev build throws without a provider (the legacy global fallback is not
  // reliable across module-resolution pipelines).
  const { container } = render(
    <LexicalCollaboration>
      <InklingArticleEditor
        initialDocument={document}
        documentKey="test-document"
        onDocumentChange={onDocumentChange}
        editorRef={editorRef}
        flushHandleRef={flushHandleRef}
      />
    </LexicalCollaboration>,
  )
  return { container, editorRef, flushHandleRef, onDocumentChange }
}

describe('ui/inkling/editor/article/InklingArticleEditor', () => {
  it('renders the hydrated document content', async () => {
    const { container, editorRef, flushHandleRef } = mountArticleEditor(fixtureDocument())

    // Let mount effects (setRootElement, decorator portals) settle.
    await act(async () => {})

    expect(editorRef.current).not.toBeNull()
    expect(flushHandleRef.current).not.toBeNull()
    expect(container.textContent).toContain('这是一段正文内容')
    expect(container.textContent).toContain('结尾段落')
    // The code card decorator renders the code preview.
    expect(container.textContent).toContain("console.log('hi')")
  })

  it('flush handle round-trips the document losslessly when nothing changed', async () => {
    const fixture = fixtureDocument()
    const { editorRef, flushHandleRef } = mountArticleEditor(fixture)
    await act(async () => {})

    // The flush handle only serializes when an editor update is pending, so
    // dirty the root without touching content — a content-preserving update
    // is exactly what e.g. a selection-restoring plugin commit looks like.
    await act(async () => {
      editorRef.current?.update(
        () => {
          $getRoot().markDirty()
        },
        { discrete: true },
      )
    })

    const flushed = flushHandleRef.current?.()
    // Deep equality including the footnote-definition block: the definition
    // was stripped into `InklingFootnoteProvider` parallel state on hydrate
    // and must be merged back at the root tail on flush.
    expect(flushed).toEqual(fixture)
  })

  it('propagates programmatic edits through the flush handle and onDocumentChange', async () => {
    const fixture = fixtureDocument()
    const { editorRef, flushHandleRef, onDocumentChange } = mountArticleEditor(fixture)
    await act(async () => {})

    await act(async () => {
      editorRef.current?.update(
        () => {
          const newParagraph = $createParagraphNode()
          newParagraph.append($createTextNode('程序化插入的新段落'))
          $getRoot().append(newParagraph)
        },
        { discrete: true },
      )
    })

    // The change plugin debounces its merge by 120ms; the flush handle must
    // bypass the debounce and return the merged document synchronously.
    const flushed = flushHandleRef.current?.()
    expect(flushed).not.toBeNull()
    expect(JSON.stringify(flushed)).toContain('程序化插入的新段落')
    // Footnote definitions still merged after the edit.
    expect(JSON.stringify(flushed)).toContain('脚注内容')

    // The flush also fires onDocumentChange with the same document so React
    // state (autosave input) stays consistent with what the caller persists.
    expect(onDocumentChange).toHaveBeenCalled()
    expect(onDocumentChange.mock.calls.at(-1)?.[0]).toEqual(flushed)
  })

  it('honours the debounced change path without an explicit flush', async () => {
    vi.useFakeTimers()
    try {
      const fixture = fixtureDocument()
      const { editorRef, onDocumentChange } = mountArticleEditor(fixture)
      await act(async () => {})

      await act(async () => {
        editorRef.current?.update(
          () => {
            const newParagraph = $createParagraphNode()
            newParagraph.append($createTextNode('防抖路径的文本'))
            $getRoot().append(newParagraph)
          },
          { discrete: true },
        )
      })

      onDocumentChange.mockClear()
      await act(async () => {
        vi.advanceTimersByTime(150)
      })

      expect(onDocumentChange).toHaveBeenCalledTimes(1)
      const document = onDocumentChange.mock.calls.at(-1)?.[0]
      expect(JSON.stringify(document)).toContain('防抖路径的文本')
    } finally {
      vi.useRealTimers()
    }
  })
})
