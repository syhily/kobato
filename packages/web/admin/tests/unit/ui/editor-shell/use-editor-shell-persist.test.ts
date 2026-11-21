// @vitest-environment happy-dom

import { renderHookWithI18n } from '@kobato/ui/tests/utils/i18n-render.tsx'
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MutationConfig {
  onSuccess?: (data: never) => void
  onError?: (error: Error) => void
}

interface MutationSlot {
  config: MutationConfig
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
}

const slotsByMutationFn = new Map<unknown, MutationSlot>()

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: MutationConfig & { mutationFn: unknown }) => {
    let slot = slotsByMutationFn.get(config.mutationFn)
    if (!slot) {
      slot = { config: {}, mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined) }
      slotsByMutationFn.set(config.mutationFn, slot)
    }
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

const autosaveMockReturns = vi.hoisted(() => ({ forceFlush: vi.fn(), setBaseline: vi.fn() }))

vi.mock('@kobato/web-admin/ui/editor-shell/drafts/use-autosave.ts', () => ({
  useAutosave: vi.fn(() => autosaveMockReturns),
}))

const localDraftState = vi.hoisted(() => ({
  loadedDraft: null as { body: unknown; savedAt: number } | null,
}))

vi.mock('@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts', () => ({
  useLocalDraft: vi.fn(() => ({ loadedDraft: localDraftState.loadedDraft, clearDraft: vi.fn() })),
}))

import type { AdminRevisionDto, SaveBodyOutput } from '@kobato/contracts/revision.ts'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema.ts'
import type { EditorShellDetail, EntityLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'
import type { UseEditorShellPersistArgs } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist.ts'

import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '@kobato/inkling/tests/utils/lexical.ts'
import { useAutosave } from '@kobato/web-admin/ui/editor-shell/drafts/use-autosave.ts'
import { useLocalDraft } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts'
import { useEditorShellPersist } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-persist.ts'

const renderHook = renderHookWithI18n

const useAutosaveMock = vi.mocked(useAutosave)
const useLocalDraftMock = vi.mocked(useLocalDraft)

const WARNING = '图片库同步失败，部分图片可能无法正常显示。'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

type Entity = EntityLike

const baseMeta: Meta = { title: 't', slug: 's', published: false, publishedAt: '' }

function body(text: string): LexicalEditorState {
  return lexicalBodyWith([lexicalParagraph(text)])
}

function makeRevision(overrides: Partial<AdminRevisionDto> = {}): AdminRevisionDto {
  return {
    id: 'rev-1',
    revisionNo: 1,
    status: 'draft',
    body: emptyLexicalBody(),
    imageSources: [],
    headings: [],
    authorId: null,
    clientRevisionToken: 'tok-1',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function savedPayload(overrides: Parameters<typeof makeRevision>[0] = {}, warning?: string): SaveBodyOutput {
  return { status: 'saved', revision: makeRevision(overrides), ...(warning !== undefined ? { warning } : {}) }
}

function conflictPayload(expectedToken = 'tok-server'): SaveBodyOutput {
  return { status: 'conflict', latest: makeRevision(), expectedToken }
}

function savedEntity(overrides: Partial<Entity> = {}): Entity {
  return { id: 'e1', slug: 's', updatedAt: '2026-07-10T00:00:00.000Z', publishedAt: null, ...overrides }
}

function makeDetail(baselineBody?: LexicalEditorState, token = 'tok-1'): EditorShellDetail<Entity> {
  return {
    entity: { id: 'e1', slug: 's', updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: null },
    latestRevision:
      baselineBody !== undefined ? makeRevision({ body: baselineBody, clientRevisionToken: token }) : null,
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
      body: emptyLexicalBody(),
      initialBody: emptyLexicalBody(),
      ...overrides.draft,
    },
    localDraftConfig: {} as never,
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
      replaceBody: vi.fn(),
      ...overrides.notifications,
    },
    routing: { editPath: (id: string) => `/edit/${id}`, navigate: vi.fn() },
    createDraft: { migrateToEditKey: vi.fn() },
  }
}

function slotFor(fn: unknown): MutationSlot {
  const slot = slotsByMutationFn.get(fn)
  expect(slot, 'mutation slot registered for the wire fn').toBeDefined()
  return slot!
}

function lastAutosaveOptions() {
  const call = useAutosaveMock.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call![0] as {
    enabled: boolean
    initialBaseline: LexicalEditorState | null
    flush: (body: never) => Promise<'saved' | 'conflict'>
    onStatusChange: (status: { kind: string; at?: number }) => void
  }
}

function lastLocalDraftOptions() {
  const call = useLocalDraftMock.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call![1] as { entityId: string | null; clientRevisionToken: string | null }
}

beforeEach(() => {
  slotsByMutationFn.clear()
  localDraftState.loadedDraft = null
  autosaveMockReturns.setBaseline.mockClear()
  autosaveMockReturns.forceFlush.mockClear()
})

describe('ui/admin/editor-shell/useEditorShellPersist — initial-return surface', () => {
  it('returns the persist handlers, derived flags, and owned state in create mode', () => {
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
    expect(result.current.isBodyDirty).toBe(false)

    expect(result.current.expectedToken).toBeNull()
    expect(result.current.latestRevision).toBeNull()
    expect(result.current.publishedRevision).toBeNull()
    expect(result.current.conflict).toBeNull()
    expect(result.current.adoptLocalDraft).toBeInstanceOf(Function)
    expect(result.current.adoptServerVersion).toBeInstanceOf(Function)
    expect(result.current.adoptRevisionFromHistory).toBeInstanceOf(Function)
  })

  it('starts with a null token when no baseline revision exists', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs({ detail: makeDetail() })))
    expect(result.current.expectedToken).toBeNull()
  })

  it('derives the owned token from the baseline revision when one exists', () => {
    const { result } = renderHook(() => useEditorShellPersist(makeArgs({ detail: makeDetail(body('x'), 'tok-0') })))
    expect(result.current.expectedToken).toBe('tok-0')
    expect(lastLocalDraftOptions().clientRevisionToken).toBe('tok-0')
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — handler gating', () => {
  it('persistSave is a no-op (status untouched, no mutation) without detail', () => {
    const args = makeArgs()
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    expect(result.current.status).toEqual({ kind: 'idle' })
    expect(slotFor(args.mutations.upsertMetaFn).mutate).not.toHaveBeenCalled()
    expect(slotFor(args.mutations.saveDraftFn).mutate).not.toHaveBeenCalled()
  })

  it('persistPublish sets an error status without detail', () => {
    const args = makeArgs()
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistPublish())
    expect(result.current.status).toEqual({ kind: 'error', message: '请先保存基本信息再发布。' })
    expect(slotFor(args.mutations.publishFn).mutate).not.toHaveBeenCalled()
  })

  it('renders the owned status copy in the active locale', () => {
    const args = makeArgs()
    const { result } = renderHook(() => useEditorShellPersist(args), { locale: 'en-US' })
    act(() => result.current.persistPublish())
    expect(result.current.status).toEqual({ kind: 'error', message: 'Save the basic info before publishing.' })
  })

  it('persistUnpublish is a no-op without detail', () => {
    const args = makeArgs()
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistUnpublish())
    expect(result.current.status).toEqual({ kind: 'idle' })
    expect(slotFor(args.mutations.unpublishFn).mutate).not.toHaveBeenCalled()
  })

  it('persistCreate is a no-op in edit mode (detail present)', async () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    await act(async () => {
      await result.current.persistCreate()
    })
    expect(slotFor(args.mutations.upsertMetaFn).mutateAsync).not.toHaveBeenCalled()
    expect(args.routing.navigate).not.toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — edit-mode save dispatch', () => {
  it('persistSave fires only the meta leg when the body matches the last save', () => {
    const args = makeArgs({
      detail: makeDetail(body('same')),
      draft: {
        meta: { ...baseMeta, publishedAt: '2025-01-01T00:00' },
        body: body('same'),
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    expect(result.current.status).toEqual({ kind: 'saving' })
    expect(slotFor(args.mutations.upsertMetaFn).mutate).toHaveBeenCalledTimes(1)
    expect(slotFor(args.mutations.saveDraftFn).mutate).not.toHaveBeenCalled()
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
    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toEqual({ kind: 'draft', slug: 's' })
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    expect(result.current.displaySaveAtMs).toBe(Date.parse('2026-07-10T00:00:00.000Z'))
    expect(args.notifications.applyServerMeta).toHaveBeenCalledWith({ ...baseMeta, slug: 's' })
  })

  it('arms two legs when the body diverged and shows the banner only after both land', () => {
    const revision = makeRevision({ body: body('new text'), clientRevisionToken: 'tok-2' })
    const args = makeArgs({
      detail: makeDetail(body('old text'), 'tok-0'),
      draft: {
        meta: { ...baseMeta, publishedAt: '' },
        body: body('new text'),
        initialBody: body('old text'),
      },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    expect(slotFor(args.mutations.upsertMetaFn).mutate).toHaveBeenCalledTimes(1)
    expect(slotFor(args.mutations.saveDraftFn).mutate).toHaveBeenCalledWith({
      id: 'e1',
      body: body('new text'),
      expectedClientRevisionToken: 'tok-0',
    })

    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toBeNull()

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.({ status: 'saved', revision } as never))
    expect(result.current.previewBanner).toEqual({ kind: 'draft', slug: 's' })
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    expect(result.current.expectedToken).toBe('tok-2')
    expect(result.current.isBodyDirty).toBe(false)
    expect(lastLocalDraftOptions().clientRevisionToken).toBe('tok-2')
  })

  it('surfaces a save-result warning and does not let the meta leg clobber it', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })
  })

  it('clears the warning on the next clean save', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload() as never))
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
  })

  it('drops the armed banner when the body leg conflicts', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(conflictPayload() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.previewBanner).toBeNull()
  })

  it('surfaces a mutation error in the owned status', () => {
    const args = makeArgs({ detail: makeDetail() })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slotFor(args.mutations.upsertMetaFn).config.onError?.(new Error('boom')))
    expect(result.current.status).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — manual save advances the autosave baseline', () => {
  it('marks the submitted body snapshot persisted after a clean manual body save', () => {
    const divergedBody = body('new text')
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: divergedBody },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload({ body: divergedBody }) as never))
    expect(autosaveMockReturns.setBaseline).toHaveBeenCalledTimes(1)
    expect(autosaveMockReturns.setBaseline).toHaveBeenCalledWith(divergedBody)
  })

  it('does not touch the baseline on a meta-only save (body clean)', () => {
    const args = makeArgs({
      detail: makeDetail(body('same')),
      draft: { body: body('same') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(autosaveMockReturns.setBaseline).not.toHaveBeenCalled()
  })

  it('does not mark the baseline when the manual body save conflicts', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(conflictPayload() as never))
    expect(autosaveMockReturns.setBaseline).not.toHaveBeenCalled()

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload() as never))
    expect(autosaveMockReturns.setBaseline).not.toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — opening body seeds the autosave baseline', () => {
  it('seeds the engine baseline with the opening body on mount', () => {
    const openingBody = body('server state')
    const args = makeArgs({
      detail: makeDetail(openingBody),
      draft: { body: openingBody, initialBody: openingBody },
    })
    renderHook(() => useEditorShellPersist(args))
    expect(lastAutosaveOptions().initialBaseline).toBe(openingBody)
  })

  it('passes no baseline seed in create mode (no server state to compare against)', () => {
    renderHook(() => useEditorShellPersist(makeArgs()))
    expect(lastAutosaveOptions().initialBaseline).toBeNull()
  })

  it('seeds only once — a later body change keeps the mount-time baseline reference', () => {
    const openingBody = body('server state')
    const args = makeArgs({
      detail: makeDetail(openingBody),
      draft: { body: openingBody, initialBody: openingBody },
    })
    const { rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    expect(lastAutosaveOptions().initialBaseline).toBe(openingBody)

    rerender({ args: { ...args, draft: { ...args.draft, body: body('user edit') } } })
    expect(lastAutosaveOptions().initialBaseline).toBe(openingBody)
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — owned conflict freeze', () => {
  function conflictSaveDraft() {
    return vi.fn().mockResolvedValue(conflictPayload())
  }

  it('a flush conflict freezes autosave and no saved tick clobbers the status', async () => {
    const args = makeArgs({ detail: makeDetail(), mutations: { directSaveDraft: conflictSaveDraft() } })
    const { result } = renderHook(() => useEditorShellPersist(args))

    expect(lastAutosaveOptions().enabled).toBe(true)

    let outcome: 'saved' | 'conflict' | undefined
    await act(async () => {
      outcome = await lastAutosaveOptions().flush([] as never)
    })
    expect(outcome).toBe('conflict')
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
    expect(lastAutosaveOptions().enabled).toBe(false)

    act(() => lastAutosaveOptions().onStatusChange({ kind: 'saved', at: Date.now() }))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('the next clean save unfreezes autosave and advances the owned token', async () => {
    const args = makeArgs({ detail: makeDetail(), mutations: { directSaveDraft: conflictSaveDraft() } })
    const { result } = renderHook(() => useEditorShellPersist(args))

    await act(async () => {
      await lastAutosaveOptions().flush([] as never)
    })
    expect(lastAutosaveOptions().enabled).toBe(false)

    act(() =>
      slotFor(args.mutations.saveDraftFn).config.onSuccess?.(
        savedPayload({ id: 'rev-2', revisionNo: 2, clientRevisionToken: 'tok-2' }) as never,
      ),
    )
    expect(lastAutosaveOptions().enabled).toBe(true)
    expect(result.current.expectedToken).toBe('tok-2')
  })

  it('a diverging stored local draft freezes autosave until the dialog resolves', () => {
    const serverBody = body('server state')
    const localBody = body('local draft')
    const args = makeArgs({
      detail: makeDetail(serverBody),
      draft: { body: serverBody, initialBody: serverBody },
    })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    expect(lastAutosaveOptions().enabled).toBe(true)
    expect(result.current.conflict).toBeNull()

    localDraftState.loadedDraft = { body: localBody, savedAt: 123 }
    rerender({ args })
    expect(result.current.conflict).toEqual({ localBody, localSavedAt: 123 })
    expect(lastAutosaveOptions().enabled).toBe(false)

    act(() => result.current.adoptServerVersion())
    expect(result.current.conflict).toBeNull()
    expect(lastAutosaveOptions().enabled).toBe(true)
    expect(args.notifications.replaceBody).toHaveBeenCalledWith(serverBody, expect.stringContaining('adopt-server'))
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — cancel schedule on picker clear', () => {
  it('sends publishedAt: null when the picker is cleared on a server-scheduled entity', () => {
    const detail = makeDetail()
    detail.entity = { ...detail.entity, publishedAt: '2099-06-01T12:00:00.000Z' }
    const args = makeArgs({ detail, draft: { meta: { ...baseMeta, publishedAt: '' } } })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

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
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(conflictPayload() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slotFor(args.mutations.upsertMetaFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('keeps the conflict status when the unpublish leg resolves after a body-leg conflict', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => result.current.persistUnpublish())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(conflictPayload() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })

    act(() => slotFor(args.mutations.unpublishFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'conflict', expectedToken: 'tok-server' })
  })

  it('keeps the warning status when the unpublish leg resolves after a body-leg warning', () => {
    const args = makeArgs({
      detail: makeDetail(body('old text')),
      draft: { body: body('new text') },
    })
    const { result } = renderHook(() => useEditorShellPersist(args))
    act(() => result.current.persistSave())
    act(() => result.current.persistUnpublish())

    act(() => slotFor(args.mutations.saveDraftFn).config.onSuccess?.(savedPayload({}, WARNING) as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })

    act(() => slotFor(args.mutations.unpublishFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'warning', message: WARNING })
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — publish / unpublish', () => {
  it('persistPublish fires the publish leg, marks meta published, and retains the server publishedAt', () => {
    const args = makeArgs({
      detail: makeDetail(body('x')),
      draft: {
        meta: { ...baseMeta, publishedAt: '2099-06-01T12:00' },
        body: body('x'),
      },
    })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    act(() => result.current.persistPublish())

    expect(result.current.status).toEqual({ kind: 'saving' })
    expect(slotFor(args.mutations.publishFn).mutate).toHaveBeenCalledWith({
      id: 'e1',
      body: body('x'),
      expectedClientRevisionToken: 'tok-1',
      publishedAt: new Date('2099-06-01T12:00').toISOString(),
    })

    act(() => slotFor(args.mutations.publishFn).config.onSuccess?.(savedPayload({ status: 'published' }) as never))
    expect(args.notifications.markMetaPublished).toHaveBeenCalledTimes(1)
    expect(result.current.previewBanner).toEqual({ kind: 'published', slug: 's' })
    expect(result.current.publishedRevision).not.toBeNull()

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
    const detail = makeDetail(body('x'))
    detail.entity = { ...detail.entity, publishedAt: '2026-01-01T00:00:00.000Z' }
    const args = makeArgs({
      detail,
      draft: {
        meta: { ...baseMeta, published: true, publishedAt: '2099-06-01T12:00' },
        body: body('x'),
      },
    })
    const { result, rerender } = renderHook((props: { args: Args }) => useEditorShellPersist(props.args), {
      initialProps: { args },
    })
    act(() => result.current.persistPublish())
    act(() => slotFor(args.mutations.publishFn).config.onError?.(new Error('boom')))
    expect(result.current.status).toEqual({ kind: 'error', message: 'boom' })

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
    expect(slotFor(args.mutations.unpublishFn).mutate).toHaveBeenCalledTimes(1)

    act(() => slotFor(args.mutations.unpublishFn).config.onSuccess?.(savedEntity() as never))
    expect(result.current.status).toEqual({ kind: 'saved', at: expect.any(Date) })
    expect(args.notifications.applyServerMeta).toHaveBeenCalledWith({ ...baseMeta, slug: 's' })
  })
})
