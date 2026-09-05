import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  createEditor,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BookmarkEmbedResponse } from '@/context/InklingHostIntegrationContext'

import { useBookmarkMetadata } from '@/hooks/useBookmarkMetadata'
import { BookmarkNode, $createBookmarkNode, $isBookmarkNode } from '@/nodes/BookmarkNode'

const embedResponse: BookmarkEmbedResponse = {
  url: 'https://example.com/canonical',
  metadata: {
    author: 'Author',
    icon: 'https://example.com/icon.ico',
    title: 'Fetched title',
    description: 'Fetched description',
    publisher: 'Publisher',
    thumbnail: 'https://example.com/thumb.png',
  },
}

function createTestEditor(): LexicalEditor {
  const editor = createEditor({ namespace: 'test', nodes: [BookmarkNode], onError: () => {} })
  editor.setRootElement(document.createElement('div'))
  return editor
}

function addBookmarkNode(editor: LexicalEditor, url: string, { withTrailingParagraph = false } = {}) {
  return new Promise<NodeKey>((resolve) => {
    editor.update(
      () => {
        const bookmarkNode = $createBookmarkNode({ url })
        if (withTrailingParagraph) {
          $getRoot().append(bookmarkNode, $createParagraphNode())
        } else {
          $getRoot().append(bookmarkNode)
        }
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

function readBookmark(editor: LexicalEditor, nodeKey: NodeKey) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey)
    return $isBookmarkNode(node) ? { title: node.title, url: node.url } : null
  })
}

describe('useBookmarkMetadata', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  it('applies the submitted href and fetched metadata on submitUrl', async () => {
    const fetchEmbed = vi.fn().mockResolvedValue(embedResponse)
    const nodeKey = await addBookmarkNode(editor, '')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await result.current.submitUrl('https://example.com/page')
    })

    expect(fetchEmbed).toHaveBeenCalledTimes(1)
    expect(fetchEmbed).toHaveBeenCalledWith('https://example.com/page', { type: 'bookmark' })
    // the submit path keeps the submitted href, not the response's canonical url
    expect(readBookmark(editor, nodeKey)).toEqual({ title: 'Fetched title', url: 'https://example.com/page' })
    expect(result.current.loading).toBe(false)
    expect(result.current.urlError).toBe(false)
  })

  it('folds a failed submitUrl fetch into the urlError state without rejecting', async () => {
    const fetchEmbed = vi.fn().mockRejectedValue(new Error('Network error'))
    const nodeKey = await addBookmarkNode(editor, 'https://example.com')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await result.current.submitUrl('https://example.com')
    })

    expect(result.current.urlError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('folds an invalid submitUrl response into the urlError state', async () => {
    const fetchEmbed = vi.fn().mockResolvedValue({ not: 'an embed response' })
    const nodeKey = await addBookmarkNode(editor, 'https://example.com')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await result.current.submitUrl('https://example.com')
    })

    expect(result.current.urlError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('resets the urlError state on clearUrlError', async () => {
    const fetchEmbed = vi.fn().mockRejectedValue(new Error('Network error'))
    const nodeKey = await addBookmarkNode(editor, 'https://example.com')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await result.current.submitUrl('https://example.com')
    })
    expect(result.current.urlError).toBe(true)

    act(() => {
      result.current.clearUrlError()
    })
    expect(result.current.urlError).toBe(false)
  })

  it('applies the canonical response url on fetchInitialMetadata and selects the next node', async () => {
    const fetchEmbed = vi.fn().mockResolvedValue(embedResponse)
    const nodeKey = await addBookmarkNode(editor, 'https://example.com', { withTrailingParagraph: true })
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await result.current.fetchInitialMetadata('https://example.com')
    })

    // the init path adopts the response's canonical url
    expect(readBookmark(editor, nodeKey)).toEqual({ title: 'Fetched title', url: 'https://example.com/canonical' })
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('')
      // the caret landed past the card (in the trailing paragraph)
      expect($isRangeSelection(selection) && !$isBookmarkNode(selection.anchor.getNode())).toBe(true)
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.urlError).toBe(false)
  })

  it('rejects fetchInitialMetadata on fetch failure so the caller can paste-as-link', async () => {
    const fetchEmbed = vi.fn().mockRejectedValue(new Error('Network error'))
    const nodeKey = await addBookmarkNode(editor, 'https://example.com')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    await act(async () => {
      await expect(result.current.fetchInitialMetadata('https://example.com')).rejects.toThrow('Network error')
    })

    expect(result.current.urlError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('tracks loading through the fetch lifecycle', async () => {
    let resolveFetch: (response: BookmarkEmbedResponse) => void = () => {}
    const fetchEmbed = vi.fn(
      () =>
        new Promise<BookmarkEmbedResponse>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const nodeKey = await addBookmarkNode(editor, '')
    const { result } = renderHook(() => useBookmarkMetadata({ editor, nodeKey, fetchEmbed }))

    expect(result.current.loading).toBe(false)

    let submission: Promise<void> = Promise.resolve()
    act(() => {
      submission = result.current.submitUrl('https://example.com/page')
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveFetch(embedResponse)
      await submission
    })
    expect(result.current.loading).toBe(false)
  })
})
