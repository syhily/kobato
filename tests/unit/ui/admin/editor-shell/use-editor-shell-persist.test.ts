// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// This suite drives useEditorShellPersist's four mutation slots directly.
// Slot order matches the useMutation call order in use-editor-shell-persist:
//   0 = upsertMeta, 1 = saveDraft, 2 = publish, 3 = unpublish

interface MutationSlot {
  onSuccess?: (data: never) => void
  onError?: (error: Error) => void
}

const slots: Array<{
  config: MutationSlot | undefined
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
}> = Array.from({ length: 4 }, () => ({ config: undefined, mutate: vi.fn(), mutateAsync: vi.fn() }))
let useMutationCalls = 0

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: MutationSlot) => {
    const slot = slots[useMutationCalls % 4]
    useMutationCalls += 1
    slot.config = config
    return {
      mutate: slot.mutate,
      mutateAsync: slot.mutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
    }
  }),
}))

const autosaveMockReturns = vi.hoisted(() => ({ forceFlush: vi.fn(), markPersisted: vi.fn() }))

vi.mock('@/client/hooks/use-autosave', () => ({
  useAutosave: vi.fn(() => autosaveMockReturns),
}))

import type { AdminRevisionDto, SaveBodyOutput } from '@/shared/contracts/revision'
import type { EditorShellDetail, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'
import type { UseEditorShellPersistArgs } from '@/ui/admin/editor-shell/use-editor-shell-persist'

import { useAutosave } from '@/client/hooks/use-autosave'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

const useAutosaveMock = vi.mocked(useAutosave)

const WARNING = '图片库同步失败，部分图片可能无法正常显示。'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

type Entity = EntityLike

const baseMeta: Meta = { title: 't', slug: 's', published: false, publishedAt: '' }

// Minimal valid PortableText block — every block must carry a `children` array of spans.
function block(key: string, text: string) {
  return { _type: 'block' as const, _key: key, children: [{ _type: 'span' as const, _key: `${key}-s`, text }] }
}

function makeRevision(overrides: Partial<AdminRevisionDto> = {}): AdminRevisionDto {
  return {
    id: 'rev-1',
    revisionNo: 1,
    status: 'draft',
    body: [],
    imageSources: [],
    headings: [],
    authorId: null,
    clientRevisionToken: 'tok-1',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function savedPayload(overrides: Partial<AdminRevisionDto> = {}, warning?: string): SaveBodyOutput {
  return { status: 'saved', revision: makeRevision(overrides), ...(warning !== undefined ? { warning } : {}) }
}

function savedEntity(overrides: Partial<Entity> = {}): Entity {
  return { id: 'e1', slug: 's', updatedAt: '2026-07-10T00:00:00.000Z', publishedAt: null, ...overrides }
}

/** Edit-mode detail; `baselineBody` seeds persist's owned lastSavedBody. */
function makeDetail(baselineBody?: ReturnType<typeof block>[]): EditorShellDetail<Entity> {
  return {
    entity: { id: 'e1', slug: 's', updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: null },
    latestRevision: baselineBody !== undefined ? makeRevision({ body: baselineBody }) : null,
    publishedRevision: null,
  }
}

type Args = UseEditorShellPersistArgs<Meta, Entity>

function makeArgs(
  overrides: {
    detail?: Args['detail']
    draft?: Partial<Args['draft']>
    mutations?: Partial<Args['mutations']>
    notifications?: Partial<Args['notifications']>
  } = {},
): Args {
  return {
    detail: overrides.detail,
    draft: {
      meta: baseMeta,
      body: [],
      expectedToken: null,
      freeze: null,
      ...overrides.draft,
    },
    mutations: {
      upsertMetaFn: vi.fn(),
      saveDraftFn: vi.fn(),
      publishFn: vi.fn(),
      unpublishFn: vi.fn(),
      buildUpsertMetaPayload: vi.fn(),
      directSaveDraft: vi.fn(),
      ...overrides.mutations,
    },
    metaDraftFromEntity: vi.fn((e: Entity) => ({ ...baseMeta, slug: e.slug })),
    notifications: {
      applyServerMeta: vi.fn(),
      markMetaPublished: vi.fn(),
      noteRevisionSaved: vi.fn(),
      noteRevisionConflict: vi.fn(),
      ...overrides.notifications,
    },
    routing: { editPath: (id: string) => `/edit/${id}`, navigate: vi.fn() },
    createDraft: { migrateToEditKey: vi.fn() },
  }
}

beforeEach(() => {
  useMutationCalls = 0
  autosaveMockReturns.markPersisted.mockClear()
  autosaveMockReturns.forceFlush.mockClear()
  for (const slot of slots) {
    slot.config = undefined
    slot.mutate.mockClear()
    slot.mutateAsync.mockClear()
    slot.mutateAsync.mockResolvedValue(undefined)
  }
})

describe('ui/admin/editor-shell/useEditorShellPersist — initial-return surface', () => {
  it('returns the persist handlers, derived flags, and owned save-flow state in create mode', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs()))

    expect(result.current.persistCreate).toBeInstanceOf(Function)
    expect(result.current.persistSave).toBeInstanceOf(Function)
    expect(result.current.persistPublish).toBeInstanceOf(Function)
    expect(result.current.persistUnpublish).toBeInstanceOf(Function)
    expect(result.current.isPending).toBe(false)
    expect(result.current.isSavingDraft).toBe(false)
    expect(result.current.isPublishing).toBe(false)
    expect(result.current.isUnpublishing).toBe(false)
    expect(result.current.isCreating).toBe(false)
    expect(result.current.status).toEqual({ kind: 'idle' })
    expect(result.current.previewBanner).toBeNull()
    expect(result.current.displaySaveAtMs).toBeNull()
    expect(result.current.lastSavedBody).toEqual([])
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — handler gating', () => {
  it('persistSave is a no-op (status untouched, no mutation) without detail', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs()))
    act(() => result.current.persistSave())
    expect(result.current.status).toEqual({ kind: 'idle' })
    expect(slots[0].mutate).not.toHaveBeenCalled()
    expect(slots[1].mutate).not.toHaveBeenCalled()
  })

  it('persistPublish sets an error status without detail', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs()))
    act(() => result.current.persistPublish())
    expect(result.current.status).toEqual({ kind: 'error', message: '请先保存基本信息再发布。' })
    expect(slots[2].mutate).not.toHaveBeenCalled()
  })

  it('persistUnpublish is a no-op without detail', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs()))
    act(() => result.current.persistUnpublish())
    expect(result.current.status).toEqual({ kind: 'idle' })
    expect(slots[3].mutate).not.toHaveBeenCalled()
  })

  it('persistCreate is a no-op in edit mode (detail present)', async () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    await act(async () => {
      await result.current.persistCreate()
    })
    expect(slots[0].mutateAsync).not.toHaveBeenCalled()
    expect(args.routing.navigate).not.toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — edit-mode save dispatch', () => {
  it('persistSave fires only the meta leg when the body matches the last save', () => {
    const args = makeArgs({
      detail: makeDetail([block('b1', 'same')]),
      draft: {
        meta: { ...baseMeta, publishedAt: '2025-01-01T00:00' },
        body: [block('b1', 'same')],
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    expect(result.current.status).toEqual({ kind: 'saving' })
    expect(slots[0].mutate).toHaveBeenCalledTimes(1)
    expect(slots[1].mutate).not.toHaveBeenCalled()
    expect(args.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: args.draft.meta,
      id: 'e1',
      publishedAt: expect.any(String),
    })
  })

  it('shows the draft banner after the single meta leg lands (body clean)', () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toEqual({ kind: 'draft', slug: 's' })
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    expect(result.current.displaySaveAtMs).toBe(Date.parse('2026-07-10T00:00:00.000Z'))
    expect(args.notifications.applyServerMeta).toHaveBeenCalledWith({ ...baseMeta, slug: 's' })
  })

  it('arms two legs when the body diverged and shows the banner only after both land', () => {
    const revision = makeRevision({ body: [block('new', 'new text')] })
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: {
        meta: { ...baseMeta, publishedAt: '' },
        body: [block('new', 'new text')],
        expectedToken: 'tok-0',
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    expect(slots[0].mutate).toHaveBeenCalledTimes(1)
    expect(slots[1].mutate).toHaveBeenCalledTimes(1)

    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toBeNull()

    act(() => slots[1].config?.onSuccess?.({ status: 'saved', revision } as never))
    expect(result.current.previewBanner).toEqual({ kind: 'draft', slug: 's' })
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    // Revision race → orchestrator; saved-body bookkeeping stays in persist.
    expect(args.notifications.noteRevisionSaved).toHaveBeenCalledWith(revision)
    expect(result.current.lastSavedBody).toEqual([block('new', 'new text')])
  })

  it('surfaces a save-result warning and does not let the meta leg clobber it', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slots[1].config?.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })
  })

  it('clears the warning on the next clean save', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slots[1].config?.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slots[1].config?.onSuccess?.(savedPayload() as never))
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
  })

  it('drops the armed banner when the body leg conflicts', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() =>
      slots[1].config?.onSuccess?.({
        status: 'conflict',
        latest: makeRevision(),
        expectedToken: 'tok-server',
      } as never),
    )
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toBeNull()
  })

  it('surfaces a mutation error in the owned status', () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slots[0].config?.onError?.(new Error('boom')))
    expect(result.current.status).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — manual save advances the autosave baseline', () => {
  it('marks the submitted body snapshot persisted after a clean manual body save', () => {
    const divergedBody = [block('new', 'new text')]
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: divergedBody },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    // Discount the mount-time opening-body seed (covered by its own suite).
    autosaveMockReturns.markPersisted.mockClear()
    act(() => result.current.persistSave())

    act(() => slots[1].config?.onSuccess?.(savedPayload({ body: divergedBody }) as never))
    // Baseline moves to the submitted reference so the next debounce tick is a no-op.
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledTimes(1)
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledWith(divergedBody)
  })

  it('does not touch the baseline on a meta-only save (body clean)', () => {
    const args = makeArgs({
      detail: makeDetail([block('b1', 'same')]),
      draft: { body: [block('b1', 'same')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    autosaveMockReturns.markPersisted.mockClear() // mount-time seed; see the seed suite
    act(() => result.current.persistSave())
    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(autosaveMockReturns.markPersisted).not.toHaveBeenCalled()
  })

  it('does not mark the baseline when the manual body save conflicts', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    autosaveMockReturns.markPersisted.mockClear() // mount-time seed; see the seed suite
    act(() => result.current.persistSave())

    act(() =>
      slots[1].config?.onSuccess?.({
        status: 'conflict',
        latest: makeRevision(),
        expectedToken: 'tok-server',
      } as never),
    )
    expect(autosaveMockReturns.markPersisted).not.toHaveBeenCalled()

    // The conflict dropped the pending snapshot; a later clean save must not mark a stale body.
    act(() => slots[1].config?.onSuccess?.(savedPayload() as never))
    expect(autosaveMockReturns.markPersisted).not.toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — opening body seeds the autosave baseline', () => {
  // Audit P1-1: seeding the baseline makes the first debounce tick hit the reference check.
  it('marks the opening body persisted on mount so the first autosave tick is a no-op', () => {
    const openingBody = [block('b1', 'server state')]
    const args = makeArgs({
      detail: makeDetail(openingBody),
      draft: { body: openingBody },
    })
    renderHook(() => useEditorShellPersist(args))
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledTimes(1)
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledWith(openingBody)
  })

  it('does not seed the baseline in create mode (no server state to compare against)', () => {
    renderHook(() => useEditorShellPersist(makeArgs()))
    expect(autosaveMockReturns.markPersisted).not.toHaveBeenCalled()
  })

  it('seeds only once — a later body change must not re-seed the baseline', () => {
    const openingBody = [block('b1', 'server state')]
    const args = makeArgs({
      detail: makeDetail(openingBody),
      draft: { body: openingBody },
    })
    const { rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledTimes(1)

    rerender({ args: { ...args, draft: { ...args.draft, body: [block('b2', 'user edit')] } } })
    expect(autosaveMockReturns.markPersisted).toHaveBeenCalledTimes(1)
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — autosave conflict freeze', () => {
  /** Options of the most recent useAutosave call (one per render). */
  function lastAutosaveOptions() {
    const call = useAutosaveMock.mock.calls.at(-1)
    expect(call).toBeDefined()
    return call![0] as {
      enabled: boolean
      flush: (body: never) => Promise<'saved' | 'conflict'>
      onStatusChange: (status: { kind: string; at?: number }) => void
    }
  }

  function conflictSaveDraft() {
    return vi.fn().mockResolvedValue({
      status: 'conflict',
      latest: makeRevision(),
      expectedToken: 'tok-server',
    })
  }

  it('reports the server conflict as the freeze notification and never lets a saved tick clobber it', async () => {
    const args = makeArgs({ detail: makeDetail(), mutations: { directSaveDraft: conflictSaveDraft() } })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })

    expect(lastAutosaveOptions().enabled).toBe(true)

    let outcome: 'saved' | 'conflict' | undefined
    await act(async () => {
      outcome = await lastAutosaveOptions().flush([] as never)
    })
    // The conflict outcome stops the engine from emitting its generic 'saved' tick.
    expect(outcome).toBe('conflict')
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
    // Freeze is orchestrator-owned; persist only reports the server leg.
    expect(args.notifications.noteRevisionConflict).toHaveBeenCalledTimes(1)

    rerender({ args: { ...args, draft: { ...args.draft, freeze: 'server' } } })
    expect(lastAutosaveOptions().enabled).toBe(false)

    act(() => lastAutosaveOptions().onStatusChange({ kind: 'saved', at: Date.now() }))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('gates autosave on the merged freeze flag alone — either source freezes, none unfreezes', async () => {
    const args = makeArgs({ detail: makeDetail(), draft: { freeze: 'local' } })
    const { rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    expect(lastAutosaveOptions().enabled).toBe(false)

    rerender({ args: { ...args, draft: { ...args.draft, freeze: 'server' } } })
    expect(lastAutosaveOptions().enabled).toBe(false)

    rerender({ args: { ...args, draft: { ...args.draft, freeze: null } } })
    expect(lastAutosaveOptions().enabled).toBe(true)
  })

  it('hands the clean save to the orchestrator (its unfreeze cue) after a conflict', async () => {
    const args = makeArgs({ detail: makeDetail(), mutations: { directSaveDraft: conflictSaveDraft() } })
    renderHook(() => useEditorShellPersist(args))

    await act(async () => {
      await lastAutosaveOptions().flush([] as never)
    })
    expect(args.notifications.noteRevisionConflict).toHaveBeenCalledTimes(1)

    act(() => slots[1].config?.onSuccess?.(savedPayload() as never))
    expect(args.notifications.noteRevisionSaved).toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — cancel schedule on picker clear', () => {
  it('sends publishedAt: null when the picker is cleared on a server-scheduled entity', () => {
    const detail = makeDetail()
    detail.entity = { ...detail.entity, publishedAt: '2099-06-01T12:00:00.000Z' }
    const args = makeArgs({ detail, draft: { meta: { ...baseMeta, publishedAt: '' } } })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    // 取消排期: the explicit null must reach the wire.
    expect(args.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: args.draft.meta,
      id: 'e1',
      publishedAt: null,
    })
  })

  it('omits publishedAt when the picker is cleared and the server holds no schedule', () => {
    const args = makeArgs({ detail: makeDetail(), draft: { meta: { ...baseMeta, publishedAt: '' } } })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    // Nothing scheduled: undefined leaves the column untouched — a live post is never unpublished.
    expect(args.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: args.draft.meta,
      id: 'e1',
      publishedAt: undefined,
    })
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — success legs never downgrade conflict / warning', () => {
  it('keeps the conflict status when the meta leg resolves after a body-leg conflict', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() =>
      slots[1].config?.onSuccess?.({
        status: 'conflict',
        latest: makeRevision(),
        expectedToken: 'tok-server',
      } as never),
    )
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('keeps the conflict status when the unpublish leg resolves after a body-leg conflict', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => result.current.persistUnpublish())

    act(() =>
      slots[1].config?.onSuccess?.({
        status: 'conflict',
        latest: makeRevision(),
        expectedToken: 'tok-server',
      } as never),
    )
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slots[3].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('keeps the warning status when the unpublish leg resolves after a body-leg warning', () => {
    const args = makeArgs({
      detail: makeDetail([block('old', 'old text')]),
      draft: { body: [block('new', 'new text')] },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => result.current.persistUnpublish())

    act(() => slots[1].config?.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slots[3].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — publish / unpublish', () => {
  it('persistPublish fires the publish leg, marks meta published, and retains the server publishedAt', () => {
    const args = makeArgs({
      detail: makeDetail([block('b1', 'x')]),
      draft: {
        meta: { ...baseMeta, publishedAt: '2099-06-01T12:00' },
        body: [block('b1', 'x')],
        expectedToken: 'tok-1',
      },
    })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    act(() => result.current.persistPublish())

    expect(result.current.status).toEqual({ kind: 'saving' })
    expect(slots[2].mutate).toHaveBeenCalledTimes(1)

    act(() => slots[2].config?.onSuccess?.(savedPayload({ status: 'published' }) as never))
    expect(args.notifications.markMetaPublished).toHaveBeenCalledTimes(1)
    expect(args.notifications.noteRevisionSaved).toHaveBeenCalled()
    expect(result.current.previewBanner).toEqual({ kind: 'published', slug: 's' })

    // After a successful publish the optimistic publishedAt is the truth: an
    // empty picker cancels it with an explicit null — never a "publish now".
    const nextArgs: Args = { ...args, draft: { ...args.draft, meta: { ...baseMeta, publishedAt: '' } } }
    rerender({ args: nextArgs })
    act(() => result.current.persistSave())
    expect(nextArgs.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: nextArgs.draft.meta,
      id: 'e1',
      publishedAt: null,
    })
  })

  it('reverts the optimistic server publishedAt when the publish leg fails (V3-07)', () => {
    // A live entity: its publishedAt is a past fact, not a schedule.
    const detail = makeDetail([block('b1', 'x')])
    detail.entity = { ...detail.entity, publishedAt: '2026-01-01T00:00:00.000Z' }
    const args = makeArgs({
      detail,
      draft: {
        meta: { ...baseMeta, published: true, publishedAt: '2099-06-01T12:00' },
        body: [block('b1', 'x')],
        expectedToken: 'tok-1',
      },
    })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    act(() => result.current.persistPublish())
    act(() => slots[2].config?.onError?.(new Error('boom')))
    expect(result.current.status).toEqual({ kind: 'error', message: 'boom' })

    // After a failed publish the optimistic schedule is reverted: omit the
    // field (undefined), never null — null cancels and would unpublish the live entity.
    const nextArgs: Args = {
      ...args,
      draft: { ...args.draft, meta: { ...baseMeta, published: true, publishedAt: '' } },
    }
    rerender({ args: nextArgs })
    act(() => result.current.persistSave())
    expect(nextArgs.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: nextArgs.draft.meta,
      id: 'e1',
      publishedAt: undefined,
    })
  })

  it('persistUnpublish fires the unpublish leg and reports the saved entity', () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistUnpublish())

    expect(result.current.status).toEqual({ kind: 'saving' })
    expect(slots[3].mutate).toHaveBeenCalledTimes(1)

    act(() => slots[3].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    expect(args.notifications.applyServerMeta).toHaveBeenCalledWith({ ...baseMeta, slug: 's' })
  })
})
