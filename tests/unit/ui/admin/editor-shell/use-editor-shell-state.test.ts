import { describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

// useEditorShellState is the orchestrator that owns body / meta / revision
// state and wires layout + persist together. The SSR renderHook harness
// renders a single synchronous pass, so the leaf deps are mocked below.

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
  useAutosave: vi.fn(() => ({ forceFlush: vi.fn(), markPersisted: vi.fn() })),
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
  it('returns the screen-level fields with sensible create-mode defaults', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))

    expect(result.meta).toEqual(emptyMeta)
    expect(result.body).toEqual([])
    expect(result.bodyKey).toBe('create:initial')
    expect(result.initialBody).toEqual([])
    expect(result.isEditing).toBe(false)

    expect(result.previewOpen).toBe(false)
    expect(typeof result.setPreviewOpen).toBe('function')
    expect(result.metaOpen).toBe(true) // isLg defaults to true in SSR
    expect(result.isLg).toBe(true)

    expect(result.previewBanner).toBeNull()
    expect(result.createDraftSavedAt).toBeNull()
    expect(result.dismissPreviewBanner).toBeInstanceOf(Function)
  })

  it('projects the toolbar view (pending flags, gating, persist handlers)', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const { toolbar } = result

    expect(toolbar.isPending).toBe(false)
    expect(toolbar.isSavingDraft).toBe(false)
    expect(toolbar.isPublishing).toBe(false)
    expect(toolbar.isUnpublishing).toBe(false)
    expect(toolbar.isCreating).toBe(false)

    // Create-mode gating: canPublish requires isEditing, canPersistMeta a non-empty title.
    expect(toolbar.canPublish).toBe(false)
    expect(toolbar.canPersistMeta).toBe(false)
    expect(toolbar.published).toBe(false)
    expect(toolbar.publishStatus).toBe('never-saved') // not editing

    expect(toolbar.persistCreate).toBeInstanceOf(Function)
    expect(toolbar.persistSave).toBeInstanceOf(Function)
    expect(toolbar.persistPublish).toBeInstanceOf(Function)
    expect(toolbar.persistUnpublish).toBeInstanceOf(Function)
  })

  it('projects the sidebar view (draft bindings, status, revision extras)', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const { sidebar } = result

    expect(sidebar.draft).toEqual(emptyMeta)
    expect(sidebar.disabled).toBe(false)
    expect(sidebar.publishStatus).toBe('never-saved') // not editing
    expect(sidebar.revisionSummary).toBeNull() // not editing
    expect(sidebar.saveStatus).toEqual({ kind: 'unsaved' })
    expect(sidebar.expectedToken).toBeNull()
    expect(sidebar.body).toEqual([])
    expect(sidebar.adoptRevisionFromHistory).toBeInstanceOf(Function)
  })

  it('projects the dialog view (conflict state + adoption handlers)', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const { dialog } = result

    expect(dialog.conflict).toBeNull()
    expect(dialog.serverBody).toEqual([])
    expect(dialog.baselineUpdatedAtMs).toBeNull()
    expect(dialog.adoptLocalDraft).toBeInstanceOf(Function)
    expect(dialog.adoptServerVersion).toBeInstanceOf(Function)
  })

  it('canPersistMeta becomes true when the title is non-empty', () => {
    const args = makeCreateArgs()
    args.emptyMeta = { ...emptyMeta, title: 'Draft Title' }
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args))
    expect(result.toolbar.canPersistMeta).toBe(true)
  })

  it('baselineUpdatedAtMs falls back to the entity updatedAt in edit mode with no revisions', () => {
    const args = {
      ...makeCreateArgs(),
      mode: 'edit' as const,
      detail: {
        entity: { id: 'e1', slug: 's', updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: null },
        latestRevision: null,
        publishedRevision: null,
      },
    }
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args))
    expect(result.dialog.baselineUpdatedAtMs).toBe(Date.parse('2026-07-01T00:00:00.000Z'))
  })

  it('adoptLocalDraft / adoptServerVersion / adoptRevisionFromHistory short-circuit in create mode', async () => {
    const args = makeCreateArgs()
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args))
    // In create mode the adoption helpers no-op, leaving body/meta untouched.
    await expect(result.dialog.adoptLocalDraft()).resolves.toBeUndefined()
    expect(() => result.dialog.adoptServerVersion()).not.toThrow()
    expect(() => result.sidebar.adoptRevisionFromHistory({ body: [], revisionNo: 1 })).not.toThrow()
    expect(args.directSaveDraft).not.toHaveBeenCalled()
  })
})
