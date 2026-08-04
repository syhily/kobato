import { renderHook } from '#/_helpers/hook'

import { describe, expect, it, vi } from 'vitest'

// useEditorShellState is the orchestrator that owns body / meta / revision
// state and wires layout + persist together. The SSR renderHook harness
// renders a single synchronous pass, so effects (keyboard shortcuts,
// autosave, scroll listeners) do not fire. We mock the four leaf
// dependencies that need a provider or DOM:
//   - @tanstack/react-query (useMutation)
//   - @kobato/client/hooks/use-autosave
//   - @kobato/client/hooks/use-local-draft
//   - @kobato/client/hooks/use-create-draft
// and assert the create-mode initial-return surface: the screen-level
// fields plus the three narrow views (toolbar / sidebar / dialog).

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

vi.mock('@kobato/client/hooks/use-autosave', () => ({
  useAutosave: vi.fn(() => ({ forceFlush: vi.fn(), markPersisted: vi.fn() })),
}))

vi.mock('@kobato/client/hooks/use-local-draft', () => ({
  useLocalDraft: vi.fn(() => ({ loadedDraft: null, clearDraft: vi.fn() })),
}))

vi.mock('@kobato/client/hooks/use-create-draft', () => ({
  useCreateDraft: vi.fn(() => ({
    sessionId: 'sess-1',
    loadedDraft: null,
    migrateToEditKey: vi.fn(),
    clearDraft: vi.fn(),
  })),
}))

import type { EntityLike } from '@kobato/ui/admin/editor-shell/editor-shell-types'

import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { useEditorShellState } from '@kobato/ui/admin/editor-shell/use-editor-shell-state'

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

    // Meta + body state.
    expect(result.meta).toEqual(emptyMeta)
    expect(result.body).toEqual(EMPTY_LEXICAL_BODY)
    expect(result.bodyKey).toBe('create:initial')
    expect(result.initialBody).toEqual(EMPTY_LEXICAL_BODY)
    expect(result.isEditing).toBe(false)

    // Layout state.
    expect(result.previewOpen).toBe(false)
    expect(typeof result.setPreviewOpen).toBe('function')
    expect(result.metaOpen).toBe(true) // isLg defaults to true in SSR
    expect(result.isLg).toBe(true)

    // Banners / create-draft projection.
    expect(result.previewBanner).toBeNull()
    expect(result.createDraftSavedAt).toBeNull()
    expect(result.dismissPreviewBanner).toBeInstanceOf(Function)
  })

  it('projects the toolbar view (pending flags, gating, persist handlers)', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const { toolbar } = result

    // Flags: nothing pending with mocked idle mutations.
    expect(toolbar.isPending).toBe(false)
    expect(toolbar.isSavingDraft).toBe(false)
    expect(toolbar.isPublishing).toBe(false)
    expect(toolbar.isUnpublishing).toBe(false)
    expect(toolbar.isCreating).toBe(false)

    // Create-mode gating: canPublish requires isEditing; canPersistMeta
    // flips on a non-empty title (empty here -> false).
    expect(toolbar.canPublish).toBe(false)
    expect(toolbar.canPersistMeta).toBe(false)
    expect(toolbar.published).toBe(false)
    expect(toolbar.publishStatus).toBe('never-saved') // not editing

    // Handlers present.
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
    // No expected token in create mode.
    expect(sidebar.expectedToken).toBeNull()
    expect(sidebar.body).toEqual(EMPTY_LEXICAL_BODY)
    expect(sidebar.adoptRevisionFromHistory).toBeInstanceOf(Function)
  })

  it('projects the dialog view (conflict state + adoption handlers)', () => {
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const { dialog } = result

    // No conflict in create mode.
    expect(dialog.conflict).toBeNull()
    expect(dialog.serverBody).toEqual(EMPTY_LEXICAL_BODY)
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
    // Each adoption helper guards on isEditing/detail; in create mode
    // they resolve without touching the body/meta state.
    await expect(result.dialog.adoptLocalDraft()).resolves.toBeUndefined()
    expect(() => result.dialog.adoptServerVersion()).not.toThrow()
    expect(() => result.sidebar.adoptRevisionFromHistory({ body: EMPTY_LEXICAL_BODY, revisionNo: 1 })).not.toThrow()
    // directSaveDraft must not have been called by adoptLocalDraft.
    expect(args.directSaveDraft).not.toHaveBeenCalled()
  })
})
