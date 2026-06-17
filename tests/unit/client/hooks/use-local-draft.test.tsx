import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

// Mock the IndexedDB-backed draft store so tests don't need a real DB.
// The mock captures every call into getDraft/setDraft/removeDraft and
// lets each test program the return value.
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

// BroadcastChannel is only available in DOM contexts; stub it for the
// node test environment.
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
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer !== this && peer.name === this.name && peer.onmessage) {
        peer.onmessage(new MessageEvent('message', { data }))
      }
    }
  }
  close() {
    this.onmessage = null
  }
}

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)

import { renderHook } from '#/_helpers/hook'
import { useLocalDraft } from '@/client/hooks/use-local-draft'

const config = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
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
    // Nothing should hit storage in the disabled state.
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

  it('clearDraft removes the draft from storage and broadcasts the clear once a key is derived', () => {
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: '1', clientRevisionToken: 'rev1', body: emptyBody }),
    )
    result.clearDraft()
    expect(draftStore.remove).toHaveBeenCalledWith('cms-post-draft:1:rev1')
    // A BroadcastChannel was opened to fan out the clear event.
    expect(FakeBroadcastChannel.instances.length).toBeGreaterThan(0)
  })
})
