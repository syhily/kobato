// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

// Mock the IndexedDB-backed draft store; each test programs the return values.
const draftStore = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, record: unknown) => Promise<void>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
  removeByPrefix: vi.fn<(prefix: string) => Promise<void>>(),
}))

vi.mock('@/client/lib/draft-store', () => ({
  getDraft: (key: string) => draftStore.get(key),
  setDraft: (key: string, record: unknown) => draftStore.set(key, record),
  removeDraft: (key: string) => draftStore.remove(key),
  removeDraftsByPrefix: (prefix: string) => draftStore.removeByPrefix(prefix),
}))

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)

import type { DraftRecord } from '@/client/lib/draft-store'

import { FakeBroadcastChannel } from '#/_helpers/fake-broadcast-channel'
import {
  DRAFT_STORAGE_VERSION,
  draftEditKey,
  useDraftSession,
  type UseDraftSessionArgs,
} from '@/client/lib/draft-session'
import { portableTextBodySchema } from '@/shared/pt/schema'

// Shared draft-session invariants exercised once at the seam; the hook
// adapters' suites only cover keying and migration on top of this.

const KEY = 'cms-post-draft:1:rev1'

type Loaded = { body: PortableTextBody; savedAt: number }

function mapLoaded(record: DraftRecord, parsedBody: PortableTextBody): Loaded {
  return { body: parsedBody, savedAt: record.savedAt }
}

function makeArgs(
  overrides: Partial<UseDraftSessionArgs<PortableTextBody, Loaded>> = {},
): UseDraftSessionArgs<PortableTextBody, Loaded> {
  return {
    key: KEY,
    broadcastName: 'test-bc',
    draftType: 'post-edit',
    bodySchema: portableTextBodySchema,
    body: [],
    mapLoaded,
    ...overrides,
  }
}

function storedRecord(overrides: Record<string, unknown> = {}) {
  return { key: KEY, type: 'post-edit', body: [], savedAt: 9, version: DRAFT_STORAGE_VERSION, ...overrides }
}

// Flush the microtask queue inside act so state updates commit before asserting.
async function flushDraftEffects() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeBroadcastChannel.instances.length = 0
  draftStore.get.mockResolvedValue(null)
  draftStore.set.mockResolvedValue(undefined)
  draftStore.remove.mockResolvedValue(undefined)
  draftStore.removeByPrefix.mockResolvedValue(undefined)
})

describe('draft-session — key derivation', () => {
  it('draftEditKey formats the edit-mode draft key', () => {
    expect(draftEditKey('cms-post-draft:', 'post-42', 'rev-7')).toBe('cms-post-draft:post-42:rev-7')
  })
})

describe('useDraftSession — load and validate-or-purge', () => {
  it('hydrates a valid stored draft through mapLoaded', async () => {
    draftStore.get.mockResolvedValue(storedRecord({ savedAt: 123 }))
    const { result } = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(draftStore.get).toHaveBeenCalledWith(KEY)
    expect(result.current.loadedDraft).toEqual({ body: [], savedAt: 123 })
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('treats a missing record as an empty (but complete) load', async () => {
    const { result } = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(result.current.loadedDraft).toBeNull()
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('purges a record whose version mismatches DRAFT_STORAGE_VERSION', async () => {
    draftStore.get.mockResolvedValue(storedRecord({ version: DRAFT_STORAGE_VERSION + 1 }))
    const { result } = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(draftStore.remove).toHaveBeenCalledWith(KEY)
    expect(result.current.loadedDraft).toBeNull()
  })

  it('purges a record whose body fails the schema', async () => {
    draftStore.get.mockResolvedValue(storedRecord({ body: 'not-portable-text' }))
    const { result } = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(draftStore.remove).toHaveBeenCalledWith(KEY)
    expect(result.current.loadedDraft).toBeNull()
  })

  it('purges a record mapLoaded rejects (adapter-specific validity)', async () => {
    draftStore.get.mockResolvedValue(storedRecord())
    const { result } = renderHook(() => useDraftSession(makeArgs({ mapLoaded: () => null })))
    await flushDraftEffects()
    expect(draftStore.remove).toHaveBeenCalledWith(KEY)
    expect(result.current.loadedDraft).toBeNull()
  })

  it('re-reads when the key changes, at most once per key', async () => {
    draftStore.get.mockImplementation((key) => Promise.resolve(storedRecord({ key, savedAt: key === 'a' ? 1 : 2 })))
    const { result, rerender } = renderHook(({ key }) => useDraftSession(makeArgs({ key })), {
      initialProps: { key: 'a' as string | null },
    })
    await flushDraftEffects()
    expect(result.current.loadedDraft).toEqual({ body: [], savedAt: 1 })

    rerender({ key: 'b' })
    await flushDraftEffects()
    expect(draftStore.get).toHaveBeenCalledWith('b')
    expect(result.current.loadedDraft).toEqual({ body: [], savedAt: 2 })

    // Re-rendering with the same key must not read again.
    const reads = draftStore.get.mock.calls.length
    rerender({ key: 'b' })
    await flushDraftEffects()
    expect(draftStore.get.mock.calls.length).toBe(reads)
  })
})

describe('useDraftSession — persist gating', () => {
  it('never writes before the initial load completes', async () => {
    const pendingBody = ['pending'] as unknown as PortableTextBody
    const settledBody = ['settled'] as unknown as PortableTextBody
    let resolveGet: ((value: unknown) => void) | undefined
    draftStore.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve
        }),
    )
    const { rerender } = renderHook(({ body }) => useDraftSession(makeArgs({ body })), {
      initialProps: { body: [] as PortableTextBody },
    })

    // A body change while the load is still pending must not persist.
    rerender({ body: pendingBody })
    await flushDraftEffects()
    expect(draftStore.set).not.toHaveBeenCalled()

    resolveGet?.(null)
    await flushDraftEffects()

    rerender({ body: settledBody })
    await flushDraftEffects()
    expect(draftStore.set).toHaveBeenCalledTimes(1)
    expect(draftStore.set).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({
        key: KEY,
        type: 'post-edit',
        body: settledBody,
        version: DRAFT_STORAGE_VERSION,
      }),
    )
    // No meta was provided — the payload must not carry the key at all.
    const payload = draftStore.set.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('meta')
    expect(typeof payload.savedAt).toBe('number')
  })

  it('persists meta alongside the body when provided', async () => {
    const meta = { title: 'Hello' }
    const changedBody = ['changed'] as unknown as PortableTextBody
    const { rerender } = renderHook(({ body }) => useDraftSession(makeArgs({ body, meta })), {
      initialProps: { body: [] as PortableTextBody },
    })
    await flushDraftEffects()

    rerender({ body: changedBody })
    await flushDraftEffects()
    expect(draftStore.set).toHaveBeenCalledWith(KEY, expect.objectContaining({ body: changedBody, meta }))
  })
})

describe('useDraftSession — broadcast clear protocol', () => {
  it('clears the hydrated draft only for a matching clear broadcast', async () => {
    draftStore.get.mockResolvedValue(storedRecord())
    const { result } = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(result.current.loadedDraft).not.toBeNull()

    const peer = new FakeBroadcastChannel('test-bc')
    act(() => {
      peer.postMessage({ kind: 'cleared', key: 'cms-post-draft:someone-else' })
    })
    expect(result.current.loadedDraft).not.toBeNull()

    act(() => {
      peer.postMessage({ kind: 'cleared', key: KEY })
    })
    expect(result.current.loadedDraft).toBeNull()
  })

  it('clearDraft removes the record and clears hydrated drafts in peer tabs', async () => {
    draftStore.get.mockResolvedValue(storedRecord())
    const first = renderHook(() => useDraftSession(makeArgs()))
    const second = renderHook(() => useDraftSession(makeArgs()))
    await flushDraftEffects()
    expect(first.result.current.loadedDraft).not.toBeNull()
    expect(second.result.current.loadedDraft).not.toBeNull()

    act(() => {
      second.result.current.clearDraft()
    })
    expect(draftStore.remove).toHaveBeenCalledWith(KEY)
    expect(first.result.current.loadedDraft).toBeNull()
    expect(second.result.current.loadedDraft).toBeNull()
  })

  it('clearDraft sweeps every key under clearPrefix when one is supplied (audit P1-15)', async () => {
    // Each clientRevisionToken rotation orphans a draft, so clearing sweeps by prefix.
    const { result } = renderHook(() => useDraftSession(makeArgs({ clearPrefix: 'cms-post-draft:1:' })))
    await flushDraftEffects()

    act(() => {
      result.current.clearDraft()
    })

    expect(draftStore.removeByPrefix).toHaveBeenCalledWith('cms-post-draft:1:')
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('does not throw when BroadcastChannel is unavailable', async () => {
    const saved = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
    try {
      const { result } = renderHook(() => useDraftSession(makeArgs()))
      await flushDraftEffects()
      act(() => {
        result.current.clearDraft()
      })
      expect(draftStore.remove).toHaveBeenCalledWith(KEY)
    } finally {
      ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = saved
    }
  })
})

describe('useDraftSession — inactive key', () => {
  it('touches no storage while the key is null and clearDraft is a no-op', async () => {
    const { result } = renderHook(() => useDraftSession(makeArgs({ key: null })))
    await flushDraftEffects()
    expect(draftStore.get).not.toHaveBeenCalled()

    act(() => {
      result.current.clearDraft()
    })
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('clears the hydrated draft synchronously when the key becomes null', async () => {
    draftStore.get.mockResolvedValue(storedRecord())
    const { result, rerender } = renderHook(({ key }) => useDraftSession(makeArgs({ key })), {
      initialProps: { key: KEY as string | null },
    })
    await flushDraftEffects()
    expect(result.current.loadedDraft).not.toBeNull()

    rerender({ key: null })
    expect(result.current.loadedDraft).toBeNull()
  })

  it('starts the session when the key becomes non-null', async () => {
    draftStore.get.mockResolvedValue(storedRecord())
    const { result, rerender } = renderHook(({ key }) => useDraftSession(makeArgs({ key })), {
      initialProps: { key: null as string | null },
    })
    await flushDraftEffects()
    expect(draftStore.get).not.toHaveBeenCalled()

    rerender({ key: KEY })
    await flushDraftEffects()
    expect(draftStore.get).toHaveBeenCalledWith(KEY)
    expect(result.current.loadedDraft).toEqual({ body: [], savedAt: 9 })
  })
})
