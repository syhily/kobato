import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { createBookmarkEmbedFlow, isEmbedResponse, type BookmarkEmbedFlow } from '@/hooks/bookmark-embed-flow'
import { $createBookmarkNode, $isBookmarkNode, BookmarkNode } from '@/nodes/BookmarkNode'

const EMBED = {
  url: 'https://canonical.example.com',
  metadata: {
    author: 'Author',
    icon: 'https://cdn.example.com/icon.png',
    title: 'Title',
    description: 'Description',
    publisher: 'Publisher',
    thumbnail: 'https://cdn.example.com/thumb.png',
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('isEmbedResponse', () => {
  it('accepts the closed contract and rejects everything else', () => {
    expect(isEmbedResponse(EMBED)).toBe(true)
    expect(isEmbedResponse(undefined)).toBe(false)
    expect(isEmbedResponse(null)).toBe(false)
    expect(isEmbedResponse('https://example.com')).toBe(false)
    expect(isEmbedResponse({ url: 42, metadata: EMBED.metadata })).toBe(false)
    expect(isEmbedResponse({ url: 'https://example.com' })).toBe(false)
    expect(isEmbedResponse({ url: 'https://example.com', metadata: { ...EMBED.metadata, thumbnail: 7 } })).toBe(false)
  })
})

describe('createBookmarkEmbedFlow', () => {
  let editor: LexicalEditor
  let nodeKey: string
  let flow: BookmarkEmbedFlow

  beforeEach(async () => {
    editor = createTestEditor({ nodes: [BookmarkNode], headless: false })
    editor.setRootElement(document.createElement('div'))
    await updateEditor(editor, () => {
      const node = $createBookmarkNode({ url: '' })
      $getRoot().append(node)
      nodeKey = node.getKey()
    })
  })

  function readNode() {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      return $isBookmarkNode(node)
        ? { url: node.url, title: node.title, author: node.author, thumbnail: node.thumbnail }
        : null
    })
  }

  it('submitUrl applies the typed href with the response metadata and cycles loading', async () => {
    const states: Array<{ loading: boolean; urlError: boolean }> = []
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed: () => Promise.resolve(EMBED) })
    flow.subscribe(() => states.push(flow.getSnapshot()))

    await flow.submitUrl('https://typed.example.com')

    expect(readNode()).toMatchObject({ url: 'https://typed.example.com', title: 'Title', author: 'Author' })
    expect(states).toContainEqual({ loading: true, urlError: false })
    expect(flow.getSnapshot()).toEqual({ loading: false, urlError: false })
  })

  it('fetchInitialMetadata applies the canonical response url', async () => {
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed: () => Promise.resolve(EMBED) })

    await flow.fetchInitialMetadata('https://typed.example.com')

    expect(readNode()?.url).toBe('https://canonical.example.com')
  })

  it('a non-embed response folds into urlError', async () => {
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed: () => Promise.resolve(undefined) })

    await flow.submitUrl('https://typed.example.com')

    expect(flow.getSnapshot()).toEqual({ loading: false, urlError: true })
    flow.clearUrlError()
    expect(flow.getSnapshot().urlError).toBe(false)
  })

  it('an init rejection rethrows (the caller paste-as-links) and sets urlError', async () => {
    flow = createBookmarkEmbedFlow({
      editor,
      nodeKey,
      fetchEmbed: () => Promise.reject(new Error('host down')),
    })

    await expect(flow.fetchInitialMetadata('https://typed.example.com')).rejects.toThrow('host down')
    expect(flow.getSnapshot()).toEqual({ loading: false, urlError: true })
  })

  it('latest issued wins: a slow init fetch never patches over a later submit', async () => {
    const slow = deferred<typeof EMBED>()
    const fetchEmbed = vi
      .fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => Promise.resolve({ ...EMBED, metadata: { ...EMBED.metadata, title: 'New' } }))
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed })

    const initPromise = flow.fetchInitialMetadata('https://first.example.com')
    await flow.submitUrl('https://second.example.com')

    slow.resolve({ ...EMBED, metadata: { ...EMBED.metadata, title: 'Stale' } })
    await initPromise

    expect(readNode()).toMatchObject({ url: 'https://second.example.com', title: 'New' })
    expect(flow.getSnapshot()).toEqual({ loading: false, urlError: false })
  })

  it('a stale init rejection neither throws nor sets urlError', async () => {
    const slow = deferred<typeof EMBED>()
    const fetchEmbed = vi
      .fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => Promise.resolve(EMBED))
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed })

    const initPromise = flow.fetchInitialMetadata('https://first.example.com')
    await flow.submitUrl('https://second.example.com')

    slow.reject(new Error('stale failure'))
    await expect(initPromise).resolves.toBeUndefined()
    expect(flow.getSnapshot()).toEqual({ loading: false, urlError: false })
  })

  it('dispose supersedes an in-flight fetch — a late response never patches the node', async () => {
    const slow = deferred<typeof EMBED>()
    flow = createBookmarkEmbedFlow({ editor, nodeKey, fetchEmbed: () => slow.promise })

    const submitted = flow.submitUrl('https://typed.example.com')
    flow.dispose()
    slow.resolve(EMBED)
    await submitted

    expect(readNode()).toMatchObject({ url: '', title: '' })
  })
})
