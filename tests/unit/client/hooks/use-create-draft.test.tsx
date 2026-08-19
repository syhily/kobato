import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

// Mock the draft store: program return values per test, capture every call.
const draftStore = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, record: unknown) => Promise<void>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
}))

vi.mock('@/client/lib/draft-store', () => ({
  DRAFT_STORAGE_VERSION: 1,
  getDraft: (key: string) => draftStore.get(key),
  setDraft: (key: string, record: unknown) => draftStore.set(key, record),
  removeDraft: (key: string) => draftStore.remove(key),
}))

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)

import { FakeBroadcastChannel } from '#/_helpers/fake-broadcast-channel'
import { renderHook } from '#/_helpers/hook'
import { useCreateDraft, type CreateDraftConfig } from '@/client/hooks/use-create-draft'
import { portableTextBodySchema } from '@/shared/pt/schema'

const config: CreateDraftConfig<PortableTextBody> = {
  keyPrefix: 'cms-post-draft:new:',
  sessionKey: 'cms-post-draft:new:session',
  broadcastName: 'cms-post-draft',
  createType: 'post-create',
  editType: 'post-edit',
  editKeyPrefix: 'cms-post-draft:',
  bodySchema: portableTextBodySchema,
}

const emptyBody: PortableTextBody = []
const meta = { title: 'Hello', summary: '' }

// The hook guards storage with `typeof window === 'undefined'`; the SSR
// harness never fires `useEffect`, so only synchronous branches are
// reachable — we install a fake `window` with a `sessionStorage` slot.
function makeSessionStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => store.clear()),
    _store: store,
  }
}

type SessionStorageLike = ReturnType<typeof makeSessionStorage>

interface FakeWindow {
  sessionStorage: SessionStorageLike
}

let savedWindowDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  vi.clearAllMocks()
  FakeBroadcastChannel.instances.length = 0
  draftStore.get.mockResolvedValue(null)
  draftStore.set.mockResolvedValue(undefined)
  draftStore.remove.mockResolvedValue(undefined)
  savedWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  installWindow()
})

afterEach(() => {
  if (savedWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', savedWindowDescriptor)
  } else {
    delete (globalThis as { window?: unknown }).window
  }
})

function installWindow(initial: Record<string, string> = {}): FakeWindow {
  const fake: FakeWindow = { sessionStorage: makeSessionStorage(initial) }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fake,
    writable: true,
  })
  return fake
}

describe('useCreateDraft — sessionId derivation (readOrCreateSessionId)', () => {
  it('reuses an existing sessionStorage session id when present', () => {
    const fake = installWindow({ [config.sessionKey]: 'existing-session' })
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.sessionId).toBe('existing-session')
    // Should not overwrite an existing value.
    expect(fake.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('mints and persists a fresh session id when storage is empty', () => {
    const fake = installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.sessionId).not.toBe('')
    expect(typeof result.sessionId).toBe('string')
    expect(fake.sessionStorage.getItem(config.sessionKey)).toBe(result.sessionId)
    expect(fake.sessionStorage.setItem).toHaveBeenCalledWith(config.sessionKey, result.sessionId)
  })

  it('returns an empty string under SSR (no window at all)', () => {
    delete (globalThis as { window?: unknown }).window
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.sessionId).toBe('')
  })

  it('falls back to a Date.now-based id when sessionStorage throws on read', () => {
    // Throwing sessionStorage getter exercises the catch fallback.
    const fake = installWindow()
    Object.defineProperty(fake, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('security')
      },
    })
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.sessionId).toMatch(/^[0-9a-z]+$/)
    expect(Number.parseInt(result.sessionId, 36)).toBeGreaterThan(0)
  })

  it('treats an empty string in sessionStorage as missing and writes a new id', () => {
    const fake = installWindow({ [config.sessionKey]: '' })
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.sessionId).not.toBe('')
    expect(fake.sessionStorage.getItem(config.sessionKey)).toBe(result.sessionId)
  })
})

describe('useCreateDraft — synchronous return shape', () => {
  it('exposes loadedDraft / migrateToEditKey / clearDraft in the result', () => {
    installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(result.loadedDraft).toBeNull()
    expect(typeof result.migrateToEditKey).toBe('function')
    expect(typeof result.clearDraft).toBe('function')
  })

  it('clearDraft is callable and removes the draft from storage', () => {
    installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    result.clearDraft()
    // The callback body runs synchronously in the harness, so the call is observable.
    expect(draftStore.remove).toHaveBeenCalledWith(expect.stringContaining(config.keyPrefix))
  })

  it('migrateToEditKey schedules an edit-keyed write, a create-keyed remove and a session clear', async () => {
    const fake = installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    result.migrateToEditKey('post-42', 'rev-7', emptyBody)
    // The body is an async IIFE — flush the microtask queue before asserting.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve()
    }
    const setCalls = draftStore.set.mock.calls as Array<[string, Record<string, unknown>]>
    const editCall = setCalls.find(([k]) => k.startsWith(config.editKeyPrefix))
    expect(editCall).toBeDefined()
    expect(editCall![0]).toBe('cms-post-draft:post-42:rev-7')
    expect(editCall![1].type).toBe('post-edit')
    expect(editCall![1].version).toBe(1)
    const removeCalls = draftStore.remove.mock.calls.map((c) => c[0])
    expect(removeCalls.some((k) => k.includes(config.keyPrefix))).toBe(true)
    expect(fake.sessionStorage.removeItem).toHaveBeenCalledWith(config.sessionKey)
  })
})

describe('useCreateDraft — BroadcastChannel unavailable', () => {
  let savedBc: unknown
  beforeEach(() => {
    savedBc = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
  })
  afterEach(() => {
    ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = savedBc as never
  })

  it('does not throw when BroadcastChannel is unavailable on mount', () => {
    installWindow()
    expect(() => renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))).not.toThrow()
  })

  it('clearDraft still removes the draft when BroadcastChannel is unavailable', () => {
    installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(() => result.clearDraft()).not.toThrow()
    expect(draftStore.remove).toHaveBeenCalled()
  })

  it('migrateToEditKey still runs when BroadcastChannel is unavailable', () => {
    installWindow()
    const result = renderHook(() => useCreateDraft(config, { body: emptyBody, meta }))
    expect(() => result.migrateToEditKey('p1', 'r1', emptyBody)).not.toThrow()
  })
})

describe('useCreateDraft — stability', () => {
  it('migrateToEditKey / clearDraft keep referential identity across renders', () => {
    installWindow()
    const results: ReturnType<typeof useCreateDraft<PortableTextBody, typeof meta>>[] = []
    renderHook(
      () => {
        const r = useCreateDraft(config, { body: emptyBody, meta })
        results.push(r)
        return r
      },
      {
        // The actions queue triggers a second render pass.
        actions: [
          (r) => {
            r.clearDraft()
          },
        ],
      },
    )
    if (results.length >= 2) {
      expect(results[0].migrateToEditKey).toBe(results[1].migrateToEditKey)
      expect(results[0].clearDraft).toBe(results[1].clearDraft)
    }
  })
})
