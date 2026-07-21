import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

// useEditorShellPersist depends on @tanstack/react-query's useMutation and
// on useAutosave. The SSR renderHook harness renders a single synchronous
// pass, so effects (including the autosave subscription) do not fire. What
// IS observable in one pass:
//   - the derived pending flags (isPending / isSavingDraft / isPublishing /
//     isUnpublishing / isCreating) reflect the mocked mutation states
//   - the four persist handlers are returned as functions
//   - persistSave / persistPublish / persistUnpublish short-circuit
//     (setStatus aside) when `!isEditing || !detail`
//   - persistCreate short-circuits when isEditing or isCreating is true
//   - persistSave / persistPublish arm the action banner via
//     `actionBanner.begin(kind, legs)` — the leg count (draft: 1 or 2 by
//     body divergence, publish: 1) is persist's own knowledge
//
// `localInputValueToIso` lives in editor-datetime.ts and is covered
// directly by editor-datetime.test.ts; the persist paths below only
// assert its ISO output flows into the mutation payloads.

const mutate = vi.fn()
const mutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(() => ({
    mutate,
    mutateAsync,
    isPending: false,
    isError: false,
    isSuccess: false,
  })),
}))

vi.mock('@/client/hooks/use-autosave', () => ({
  useAutosave: vi.fn(),
}))

import type { UseEditorShellPersistArgs } from '@/ui/admin/editor-shell/use-editor-shell-persist'

import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

type Meta = { title: string; slug: string; published: boolean; publishedAt: string }

const baseMeta: Meta = { title: 't', slug: 's', published: false, publishedAt: '' }

// Minimal valid PortableText block shape (matches what the autosave /
// canonicalize helpers expect). `arePortableTextBodiesEquivalent` runs
// the body through the PT↔PM bridge, which iterates `block.children`, so
// every block must carry a `children` array of spans.
function block(key: string, text: string) {
  return { _type: 'block' as const, _key: key, children: [{ _type: 'span' as const, _key: `${key}-s`, text }] }
}

type Args = UseEditorShellPersistArgs<Meta, { id: string; slug: string; updatedAt: string; publishedAt: null }>

function makeArgs(
  overrides: {
    isEditing?: Args['isEditing']
    detail?: Args['detail']
    draft?: Partial<Args['draft']>
    mutations?: Partial<Args['mutations']>
    reducers?: Partial<Args['reducers']>
  } = {},
): Args {
  return {
    isEditing: overrides.isEditing ?? false,
    detail: overrides.detail,
    draft: {
      meta: baseMeta,
      body: [] as never,
      expectedToken: null,
      lastSavedBody: [],
      serverPublishedAtIso: null,
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
    reducers: {
      metaDraftFromEntity: vi.fn(() => baseMeta),
      onMetaSaved: vi.fn(),
      onBodySaved: vi.fn(),
      onUnpublishSaved: vi.fn(),
      noteError: vi.fn(),
      setStatus: vi.fn(),
      setMeta: vi.fn(),
      setServerPublishedAtIso: vi.fn(),
      markBodySaved: vi.fn(),
      ...overrides.reducers,
    },
    routing: { editPath: (id: string) => `/edit/${id}`, navigate: vi.fn() },
    actionBanner: { begin: vi.fn() },
    createDraft: { migrateToEditKey: vi.fn() },
  }
}

describe('ui/admin/editor-shell/useEditorShellPersist — initial-return surface', () => {
  beforeEach(() => {
    mutate.mockClear()
    mutateAsync.mockClear()
    mutateAsync.mockResolvedValue(undefined)
  })

  it('returns the four persist handlers and derived flags in create mode', () => {
    const result = renderHook(() => useEditorShellPersist(makeArgs()))
    // Handlers present.
    expect(result.persistCreate).toBeInstanceOf(Function)
    expect(result.persistSave).toBeInstanceOf(Function)
    expect(result.persistPublish).toBeInstanceOf(Function)
    expect(result.persistUnpublish).toBeInstanceOf(Function)
    // Flags: nothing pending in create mode with mocked idle mutations.
    expect(result.isPending).toBe(false)
    expect(result.isSavingDraft).toBe(false)
    expect(result.isPublishing).toBe(false)
    expect(result.isUnpublishing).toBe(false)
    expect(result.isCreating).toBe(false)
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — handler gating', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  it('persistSave is a no-op (no mutation) when not editing', () => {
    const args = makeArgs({ isEditing: false })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()
    expect(args.reducers.setStatus).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('persistPublish sets an error status when not editing', () => {
    const args = makeArgs({ isEditing: false })
    const { persistPublish } = renderHook(() => useEditorShellPersist(args))
    persistPublish()
    expect(args.reducers.setStatus).toHaveBeenCalledWith({ kind: 'error', message: '请先保存基本信息再发布。' })
    expect(mutate).not.toHaveBeenCalled()
  })

  it('persistUnpublish is a no-op when not editing', () => {
    const args = makeArgs({ isEditing: false })
    const { persistUnpublish } = renderHook(() => useEditorShellPersist(args))
    persistUnpublish()
    expect(args.reducers.setStatus).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('persistCreate is a no-op when isEditing is true', async () => {
    const args = makeArgs({
      isEditing: true,
      detail: {
        entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
        latestRevision: null,
        publishedRevision: null,
      },
    })
    const { persistCreate } = renderHook(() => useEditorShellPersist(args))
    await persistCreate()
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(args.routing.navigate).not.toHaveBeenCalled()
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — edit-mode save dispatch', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  it('persistSave sets saving status and fires upsertMeta in edit mode', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const payload = { meta: baseMeta, id: 'e1', publishedAt: null }
    const args = makeArgs({
      isEditing: true,
      detail,
      draft: {
        meta: { ...baseMeta, publishedAt: '2025-01-01T00:00' },
        lastSavedBody: [block('b1', 'same')],
        body: [block('b1', 'same')], // semantically equal -> not diverged
      },
      mutations: { buildUpsertMetaPayload: vi.fn().mockReturnValue(payload) },
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    // setStatus({ kind: 'saving' }) is the first call.
    expect(args.reducers.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    // upsertMeta mutation fired exactly once with the built payload.
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(args.mutations.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: args.draft.meta,
      id: 'e1',
      publishedAt: expect.any(String),
    })
    // The banner countdown is armed for a single draft leg.
    expect(args.actionBanner.begin).toHaveBeenCalledWith('draft', 1)
  })

  it('persistSave also fires saveDraft when the body diverged from lastSavedBody', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({
      isEditing: true,
      detail,
      draft: {
        meta: { ...baseMeta, publishedAt: '' },
        lastSavedBody: [block('old', 'old text')],
        body: [block('new', 'new text')], // diverged
        expectedToken: 'tok-1',
      },
      mutations: { buildUpsertMetaPayload: vi.fn().mockReturnValue({ meta: baseMeta }) },
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    // Both mutations fire (upsertMeta + saveDraft).
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(args.actionBanner.begin).toHaveBeenCalledWith('draft', 2)
  })

  it('persistPublish fires the publish mutation with the parsed publishedAt', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({
      isEditing: true,
      detail,
      draft: {
        meta: { ...baseMeta, publishedAt: '2025-06-01T12:00' },
        body: [block('b1', 'x')],
        expectedToken: 'tok-1',
      },
    })
    const { persistPublish } = renderHook(() => useEditorShellPersist(args))
    persistPublish()

    expect(args.reducers.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    expect(mutate).toHaveBeenCalledTimes(1)
    // setServerPublishedAtIso is updated to the parsed ISO.
    expect(args.reducers.setServerPublishedAtIso).toHaveBeenCalledWith(expect.any(String))
    expect(args.actionBanner.begin).toHaveBeenCalledWith('published', 1)
  })

  it('persistUnpublish fires the unpublish mutation in edit mode', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({ isEditing: true, detail })
    const { persistUnpublish } = renderHook(() => useEditorShellPersist(args))
    persistUnpublish()

    expect(args.reducers.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
