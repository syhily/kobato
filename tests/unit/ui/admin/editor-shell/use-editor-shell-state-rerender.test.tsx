import { renderHook } from '@testing-library/react'
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// Client-side companion to use-editor-shell-state.test.ts (which uses the
// SSR harness and therefore cannot reproduce render-phase loops). The
// mocked leaf deps mirror that suite; layout + keyboard shortcuts are
// mocked too so this test exercises only body/meta/conflict paths.
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

vi.mock('@/ui/admin/editor-shell/use-editor-shell-layout', () => ({
  useEditorShellLayout: vi.fn(() => ({
    previewOpen: false,
    setPreviewOpen: vi.fn(),
    metaOpen: true,
    setMetaOpen: vi.fn(),
    isLg: true,
    editorScrollRef: { current: null },
    previewScrollRef: { current: null },
  })),
}))

vi.mock('@/ui/admin/editor-shell/use-editor-keyboard-shortcuts', () => ({
  useEditorKeyboardShortcuts: vi.fn(),
}))

import type { EditorShellDetail, EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

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

function makeEditArgs() {
  // The shell TSX rebuilds the detail literal every render from the
  // loader-stable DTO, so each call hands out a fresh object on purpose.
  const detail: EditorShellDetail<EntityLike> = {
    entity: {
      id: 'post-1',
      slug: 'hello-world',
      updatedAt: '2026-07-01T00:00:00.000Z',
      publishedAt: null,
    },
    latestRevision: null,
    publishedRevision: null,
  }
  return {
    ...makeCreateArgs(),
    mode: 'edit' as const,
    detail,
  }
}

describe('ui/admin/editor-shell/useEditorShellState — client re-renders', () => {
  it('create mode survives re-renders with a referentially stable initialBody', () => {
    // Regression: the body-state memo once sat on an args bag rebuilt every
    // render, so create-mode `initialBody` was a fresh `[]` per render. The
    // shell's conflict check saw a "changed" initialBody every pass and
    // setState-during-render looped until React threw "Too many re-renders"
    // on /editor/post/new.
    const { result, rerender } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const firstBody = result.current.initialBody
    rerender()
    rerender()
    expect(result.current.initialBody).toBe(firstBody)
    expect(result.current.dialog.conflict).toBeNull()
  })

  it('edit mode with zero revisions survives re-renders with a referentially stable initialBody', () => {
    // Regression: an entity with no revisions (persistCreate whose saveDraft
    // leg failed still navigates to the edit path) made the body-state memo
    // hand out a fresh `[]` every render — `(null ?? null)?.body ?? []`.
    // The conflict check then setState-during-render looped until React threw
    // "Too many re-renders"; one external re-render (typing) ignited it.
    const { result, rerender } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    const firstBody = result.current.initialBody
    rerender()
    rerender()
    expect(result.current.initialBody).toBe(firstBody)
    expect(result.current.dialog.conflict).toBeNull()
  })
})
