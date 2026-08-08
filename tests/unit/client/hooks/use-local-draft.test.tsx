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

import { FakeBroadcastChannel } from '#/_helpers/fake-broadcast-channel'
import { renderHook } from '#/_helpers/hook'
import { useLocalDraft } from '@/client/hooks/use-local-draft'
import { portableTextBodySchema } from '@/shared/pt/schema'

const config = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
  bodySchema: portableTextBodySchema,
}

const emptyBody: PortableTextBody = []

describe('useLocalDraft — synchronous render branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeBroadcastChannel.instances.length = 0
    draftStore.get.mockResolvedValue(null)
    draftStore.set.mockResolvedValue(undefined)
    draftStore.remove.mockResolvedValue(undefined)
  })

  it('produces no storage key while disabled and returns no loaded draft', () => {
    const result = renderHook(() =>
      useLocalDraft(config, {
        entityId: '1',
        clientRevisionToken: 'rev1',
        body: emptyBody,
        disabled: true,
      }),
    )
    expect(result.loadedDraft).toBeNull()
    expect(draftStore.get).not.toHaveBeenCalled()
  })

  it('produces no storage key when entityId is null', () => {
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: null, clientRevisionToken: 'rev1', body: emptyBody }),
    )
    expect(result.loadedDraft).toBeNull()
    expect(draftStore.get).not.toHaveBeenCalled()
  })

  it('produces no storage key when clientRevisionToken is null', () => {
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: '1', clientRevisionToken: null, body: emptyBody }),
    )
    expect(result.loadedDraft).toBeNull()
    expect(draftStore.get).not.toHaveBeenCalled()
  })

  it('clearDraft is a no-op when no storage key is derived (disabled)', () => {
    const result = renderHook(() =>
      useLocalDraft(config, {
        entityId: '1',
        clientRevisionToken: 'rev1',
        body: emptyBody,
        disabled: true,
      }),
    )
    result.clearDraft()
    // With key === null the early-return guards the removeDraft call.
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('clearDraft is a no-op when entityId is null', () => {
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: null, clientRevisionToken: 'rev1', body: emptyBody }),
    )
    result.clearDraft()
    expect(draftStore.remove).not.toHaveBeenCalled()
  })

  it('clearDraft sweeps every rotated-token draft for the entity and broadcasts the clear once a key is derived', () => {
    // Audit P1-15: the key embeds the clientRevisionToken, so clearing only
    // the current-token key orphans every rotated predecessor. The edit
    // adapter clears by entity prefix instead.
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: '1', clientRevisionToken: 'rev1', body: emptyBody }),
    )
    result.clearDraft()
    expect(draftStore.removeByPrefix).toHaveBeenCalledWith('cms-post-draft:1:')
    expect(draftStore.remove).not.toHaveBeenCalled()
    // A BroadcastChannel was opened to fan out the clear event.
    expect(FakeBroadcastChannel.instances.length).toBeGreaterThan(0)
  })
})
