// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// useEditorShellPersist owns the save-flow state (status, save timestamp,
// saved-body bookkeeping, server publishedAt, preview banner), so this
// suite drives the four mutation slots and asserts that owned state
// directly — no orchestrator reducers are rebuilt here. The only mocks on
// the seam are the three notifications (orchestrator-owned meta draft +
// revision race) and the wire calls. Slot order matches the useMutation
// call order in use-editor-shell-persist:
//   0 = upsertMeta, 1 = saveDraft, 2 = publish, 3 = unpublish
//
// `localInputValueToIso` lives in editor-datetime.ts and is covered
// directly by editor-datetime.test.ts; the persist paths below only
// assert its ISO output flows into the mutation payloads.

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

vi.mock('@/client/hooks/use-autosave', () => ({
  useAutosave: vi.fn(),
}))

import type { AdminRevisionDto, SaveBodyOutput } from '@/shared/contracts/revision'
import type { EditorShellDetail, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'
import type { UseEditorShellPersistArgs } from '@/ui/admin/editor-shell/use-editor-shell-persist'

import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

const WARNING = '图片库同步失败，部分图片可能无法正常显示。'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

type Entity = EntityLike

const baseMeta: Meta = { title: 't', slug: 's', published: false, publishedAt: '' }

// Minimal valid PortableText block shape (matches what the autosave /
// canonicalize helpers expect). `arePortableTextBodiesEquivalent` runs
// the body through the PT↔PM bridge, which iterates `block.children`, so
// every block must carry a `children` array of spans.
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
      conflict: null,
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
      ...overrides.notifications,
    },
    routing: { editPath: (id: string) => `/edit/${id}`, navigate: vi.fn() },
    createDraft: { migrateToEditKey: vi.fn() },
  }
}

beforeEach(() => {
  useMutationCalls = 0
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

    // Handlers present.
    expect(result.current.persistCreate).toBeInstanceOf(Function)
    expect(result.current.persistSave).toBeInstanceOf(Function)
    expect(result.current.persistPublish).toBeInstanceOf(Function)
    expect(result.current.persistUnpublish).toBeInstanceOf(Function)
    // Flags: nothing pending with mocked idle mutations.
    expect(result.current.isPending).toBe(false)
    expect(result.current.isSavingDraft).toBe(false)
    expect(result.current.isPublishing).toBe(false)
    expect(result.current.isUnpublishing).toBe(false)
    expect(result.current.isCreating).toBe(false)
    // Owned state: idle status, no banner, no save timestamp, empty saved body.
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
        body: [block('b1', 'same')], // semantically equal to the baseline -> not diverged
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    expect(result.current.status).toEqual({ kind: 'saving' })
    // upsertMeta fired exactly once with the built payload; saveDraft skipped.
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

    // One armed leg, one success — the banner surfaces with the entity slug.
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
        body: [block('new', 'new text')], // diverged from the baseline
        expectedToken: 'tok-0',
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    // Both legs fire (upsertMeta + saveDraft).
    expect(slots[0].mutate).toHaveBeenCalledTimes(1)
    expect(slots[1].mutate).toHaveBeenCalledTimes(1)

    // The first leg alone must not surface the banner.
    act(() => slots[0].config?.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toBeNull()

    act(() => slots[1].config?.onSuccess?.({ status: 'saved', revision } as never))
    expect(result.current.previewBanner).toEqual({ kind: 'draft', slug: 's' })
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    // The revision race is reported to the orchestrator; the saved-body
    // bookkeeping stays inside persist.
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

    // The concurrent meta leg's success must keep the body leg's warning.
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

    // A late meta-leg success cannot flash a stale link.
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

    // The optimistic server publishedAt is retained inside persist: a later
    // save with an empty picker republishes "now" instead of writing null.
    const nextArgs: Args = { ...args, draft: { ...args.draft, meta: { ...baseMeta, publishedAt: '' } } }
    rerender({ args: nextArgs })
    act(() => result.current.persistSave())
    expect(nextArgs.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: nextArgs.draft.meta,
      id: 'e1',
      publishedAt: expect.any(String),
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
