import { describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

// useEditorShellState is the orchestrator that wires body / meta /
// revision / layout / persist sub-hooks together. The SSR renderHook
// harness renders a single synchronous pass, so effects (keyboard
// shortcuts, autosave, scroll listeners) do not fire. We mock the four
// leaf dependencies that need a provider or DOM:
//   - @tanstack/react-query (useMutation)
//   - @/client/hooks/use-autosave
//   - @/client/hooks/use-local-draft
//   - @/client/hooks/use-create-draft
// and assert the create-mode initial-return surface: derived flags,
// the projected sidebar/publish state, and the gating of
// canPersistMeta / canPublish.

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

vi.mock('@/client/hooks/use-local-draft', () => ({
  useLocalDraft: vi.fn(() => ({ loadedDraft: null, clearDraft: vi.fn() })),
}))

vi.mock('@/client/hooks/use-create-draft', () => ({
  useCreateDraft: vi.fn(() => ({
    sessionId: 'sess-1',
    loadedDraft: null,
    migrateToEditKey: vi.fn(),
    clearDraft: vi.fn(),
  })),
}))

import type { EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

const emptyMeta: Meta = { title: '', slug: '', published: false, publishedAt: '' }

function makeCreateArgs() {
  return {
    mode: 'create' as const,
    entityKind: 'post' as const,
    emptyMeta,
    metaDraftFromEntity: vi.fn((e: EntityLike) => ({
      title: '',
      slug: e.slug,
      published: false,
      publishedAt: '',
    })),
    metaDraftsEqual: vi.fn((a: Meta, b: Meta) => a.title === b.title && a.slug === b.slug),
    localDraftConfig: {} as never,
    createDraftConfig: {} as never,
    upsertMetaFn: vi.fn(),
    saveDraftFn: vi.fn(),
    publishFn: vi.fn(),
    unpublishFn: vi.fn(),
    buildUpsertMetaPayload: vi.fn(),
    directSaveDraft: vi.fn(),
    editPath: (id: string) => `/admin/posts/${id}/edit`,
    navigate: vi.fn(),
  }
}

describe('ui/admin/editor-shell/useEditorShellState — create-mode initial surface', () => {
  it('returns the full projected output shape with sensible create-mode defaults', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))

    // Meta + body state.
    expect(result.meta).toEqual(emptyMeta)
    expect(result.body).toEqual(EMPTY_INKLING_DOCUMENT)
    expect(result.bodyKey).toBe('create:initial')
    expect(result.initialBody).toEqual(EMPTY_INKLING_DOCUMENT)
    expect(result.isEditing).toBe(false)

    // Status flags.
    expect(result.status).toEqual({ kind: 'idle' })
    expect(result.isPending).toBe(false)
    expect(result.isSavingDraft).toBe(false)
    expect(result.isPublishing).toBe(false)
    expect(result.isUnpublishing).toBe(false)
    expect(result.isCreating).toBe(false)

    // Derived publish state — create mode is always not-published-yet.
    expect(result.publishState).toEqual({ kind: 'not-published-yet' })
    expect(result.canPublish).toBe(false) // requires isEditing
    // canPersistMeta flips on a non-empty title; empty here -> false.
    expect(result.canPersistMeta).toBe(false)

    // Sidebar projections.
    expect(result.sidebarPublishStatus).toBe('never-saved') // not editing
    expect(result.sidebarRevisionSummary).toBeNull() // not editing
    // No conflict in create mode.
    expect(result.conflict).toBeNull()
    expect(result.previewBanner).toBeNull()
    expect(result.createDraftSavedAt).toBeNull()
    // No expected token in create mode.
    expect(result.expectedToken).toBeNull()

    // Layout state.
    expect(result.metaOpen).toBe(true) // isLg defaults to true in SSR
    expect(result.isLg).toBe(true)

    // Handlers present.
    expect(result.persistCreate).toBeInstanceOf(Function)
    expect(result.persistSave).toBeInstanceOf(Function)
    expect(result.persistPublish).toBeInstanceOf(Function)
    expect(result.persistUnpublish).toBeInstanceOf(Function)
    expect(result.dismissPreviewBanner).toBeInstanceOf(Function)
    expect(result.adoptLocalDraft).toBeInstanceOf(Function)
    expect(result.adoptServerVersion).toBeInstanceOf(Function)
    expect(result.adoptRevisionFromHistory).toBeInstanceOf(Function)
  })

  it('canPersistMeta becomes true when the title is non-empty', () => {
    const args = makeCreateArgs()
    args.emptyMeta = { ...emptyMeta, title: 'Draft Title' }
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args))
    expect(result.canPersistMeta).toBe(true)
  })

  it('showPreviewPublicSyncHint is false in create mode', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    // Only meaningful in edit mode.
    expect(result.showPreviewPublicSyncHint).toBe(false)
  })

  it('adoptLocalDraft / adoptServerVersion / adoptRevisionFromHistory short-circuit in create mode', async () => {
    const args = makeCreateArgs()
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args))
    // Each adoption helper guards on isEditing/detail; in create mode
    // they resolve without touching the body/meta state.
    await expect(result.adoptLocalDraft()).resolves.toBeUndefined()
    expect(() => result.adoptServerVersion()).not.toThrow()
    expect(() => result.adoptRevisionFromHistory({ body: EMPTY_INKLING_DOCUMENT, revisionNo: 1 })).not.toThrow()
    // directSaveDraft must not have been called by adoptLocalDraft.
    expect(args.directSaveDraft).not.toHaveBeenCalled()
  })
})
