import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

// These four hooks are thin wrappers that pre-bind a config object and
// forward to `useLocalDraft` / `useCreateDraft`. The wrapped hooks are
// tested elsewhere (use-local-draft / use-create-draft); here we only
// need to exercise the wrapper functions themselves so their function
// bodies are covered, and assert that the config they pass through
// produces the expected storage key prefix.

const draftStore = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, record: unknown) => Promise<void>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
}))

vi.mock('@/client/lib/draft-store', () => ({
  getDraft: (key: string) => draftStore.get(key),
  setDraft: (key: string, record: unknown) => draftStore.set(key, record),
  removeDraft: (key: string) => draftStore.remove(key),
}))

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  name: string
  onmessage: ((ev: MessageEvent) => void) | null = null
  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }
  addEventListener(_type: string, cb: (ev: MessageEvent) => void) {
    this.onmessage = cb
  }
  removeEventListener() {
    this.onmessage = null
  }
  postMessage() {
    /* noop */
  }
  close() {
    this.onmessage = null
  }
}

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)

import { renderHook } from '#/_helpers/hook'
import { useCreatePageDraft } from '@/client/hooks/use-create-page-draft'
import { useCreatePostDraft } from '@/client/hooks/use-create-post-draft'
import { usePageLocalDraft } from '@/client/hooks/use-page-local-draft'
import { usePostLocalDraft } from '@/client/hooks/use-post-local-draft'
import { EMPTY_PAGE_META_DRAFT } from '@/shared/types/pages'

const emptyBody: PortableTextBody = []

function makeSessionStorage() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => store.clear()),
  }
}

let savedWindowDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  vi.clearAllMocks()
  FakeBroadcastChannel.instances.length = 0
  draftStore.get.mockResolvedValue(null)
  draftStore.set.mockResolvedValue(undefined)
  draftStore.remove.mockResolvedValue(undefined)
  savedWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  // Install a fake window so the underlying create-draft hook can read
  // sessionStorage for sessionId derivation.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage: makeSessionStorage() },
    writable: true,
  })
})

afterEach(() => {
  if (savedWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', savedWindowDescriptor)
  } else {
    delete (globalThis as { window?: unknown }).window
  }
})

describe('usePostLocalDraft', () => {
  it('returns a null loadedDraft and a clearDraft callback when disabled', () => {
    const result = renderHook(() =>
      usePostLocalDraft({
        postId: '1',
        clientRevisionToken: 'rev1',
        body: emptyBody,
        disabled: true,
      }),
    )
    expect(result.loadedDraft).toBeNull()
    expect(typeof result.clearDraft).toBe('function')
  })

  it('clearDraft removes the post-edit-keyed draft once a key is derived', () => {
    const result = renderHook(() =>
      usePostLocalDraft({
        postId: '42',
        clientRevisionToken: 'rev-7',
        body: emptyBody,
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).toHaveBeenCalledWith('cms-post-draft:42:rev-7')
  })

  it('clearDraft is a no-op when postId is null', () => {
    const result = renderHook(() =>
      usePostLocalDraft({
        postId: null,
        clientRevisionToken: 'rev-7',
        body: emptyBody,
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).not.toHaveBeenCalled()
  })
})

describe('usePageLocalDraft', () => {
  it('clearDraft removes the page-edit-keyed draft once a key is derived', () => {
    const result = renderHook(() =>
      usePageLocalDraft({
        pageId: '9',
        clientRevisionToken: 'rev-x',
        body: emptyBody,
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).toHaveBeenCalledWith('cms-page-draft:9:rev-x')
  })

  it('clearDraft is a no-op when pageId is null', () => {
    const result = renderHook(() =>
      usePageLocalDraft({
        pageId: null,
        clientRevisionToken: 'rev-x',
        body: emptyBody,
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).not.toHaveBeenCalled()
  })
})

describe('useCreatePostDraft', () => {
  it('returns a sessionId, null loadedDraft and stable callbacks', () => {
    const result = renderHook(() =>
      useCreatePostDraft({
        body: emptyBody,
        meta: {
          slug: '',
          title: 'T',
          summary: '',
          cover: '',
          og: '',
          published: false,
          commentsEnabled: true,
          showToc: false,
          showUpdated: false,
          visible: true,
          pinned: false,
          category: '',
          tags: [],
          alias: [],
          publishedAt: '',
        },
      }),
    )
    expect(typeof result.sessionId).toBe('string')
    expect(result.loadedDraft).toBeNull()
    expect(typeof result.migrateToEditKey).toBe('function')
    expect(typeof result.clearDraft).toBe('function')
  })

  it('clearDraft removes the post-create-keyed draft', () => {
    const result = renderHook(() =>
      useCreatePostDraft({
        body: emptyBody,
        meta: {
          slug: '',
          title: 'T',
          summary: '',
          cover: '',
          og: '',
          published: false,
          commentsEnabled: true,
          showToc: false,
          showUpdated: false,
          visible: true,
          pinned: false,
          category: '',
          tags: [],
          alias: [],
          publishedAt: '',
        },
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).toHaveBeenCalledWith(expect.stringContaining('cms-post-draft:new:'))
  })
})

describe('useCreatePageDraft', () => {
  it('clearDraft removes the page-create-keyed draft', () => {
    const result = renderHook(() =>
      useCreatePageDraft({
        body: emptyBody,
        meta: EMPTY_PAGE_META_DRAFT,
      }),
    )
    result.clearDraft()
    expect(draftStore.remove).toHaveBeenCalledWith(expect.stringContaining('cms-page-draft:new:'))
  })
})
