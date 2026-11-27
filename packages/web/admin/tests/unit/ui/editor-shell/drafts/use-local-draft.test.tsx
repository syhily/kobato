import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const draftStore = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, record: unknown) => Promise<void>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
  removeByPrefix: vi.fn<(prefix: string) => Promise<void>>(),
}))

const draftStoreMod = await import('@kobato/web-admin/ui/editor-shell/drafts/draft-store')
vi.spyOn(draftStoreMod, 'getDraft').mockImplementation(((key: string) => draftStore.get(key)) as never)
vi.spyOn(draftStoreMod, 'setDraft').mockImplementation(((key: string, record: unknown) =>
  draftStore.set(key, record)) as never)
vi.spyOn(draftStoreMod, 'removeDraft').mockImplementation(((key: string) => draftStore.remove(key)) as never)
vi.spyOn(draftStoreMod, 'removeDraftsByPrefix').mockImplementation(((prefix: string) =>
  draftStore.removeByPrefix(prefix)) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { emptyLexicalBody } from '@kobato/inkling/tests/utils/lexical'
import { FakeBroadcastChannel } from '@kobato/test/fake-broadcast-channel'
import { renderHook } from '@kobato/ui/tests/utils/hook'
import { useLocalDraft } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft'

const config = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
  bodySchema: lexicalEditorStateSchema,
}

const emptyBody: LexicalEditorState = emptyLexicalBody()

describe('useLocalDraft — synchronous render branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeBroadcastChannel.instances.length = 0
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
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
    const result = renderHook(() =>
      useLocalDraft(config, { entityId: '1', clientRevisionToken: 'rev1', body: emptyBody }),
    )
    result.clearDraft()
    expect(draftStore.removeByPrefix).toHaveBeenCalledWith('cms-post-draft:1:')
    expect(draftStore.remove).not.toHaveBeenCalled()
    expect(FakeBroadcastChannel.instances.length).toBeGreaterThan(0)
  })
})
