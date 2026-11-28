import { renderHookWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { act } from '@testing-library/react'
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const autosaveMockReturns = vi.hoisted(() => ({ forceFlush: vi.fn(), setBaseline: vi.fn() }))

vi.mock('@/ui/editor-shell/drafts/use-autosave', () => ({
  useAutosave: vi.fn(() => autosaveMockReturns),
}))

const localDraftState = vi.hoisted(() => ({
  loadedDraft: null as { body: unknown; savedAt: number } | null,
}))

vi.mock('@/ui/editor-shell/drafts/use-local-draft', () => ({
  useLocalDraft: vi.fn(() => ({ loadedDraft: localDraftState.loadedDraft, clearDraft: vi.fn() })),
}))

vi.mock('@/ui/editor-shell/drafts/use-create-draft', () => ({
  useCreateDraft: vi.fn(() => ({
    sessionId: 'sess-1',
    loadedDraft: null,
    migrateToEditKey: vi.fn(),
    clearDraft: vi.fn(),
  })),
}))

vi.mock('@/ui/editor-shell/use-editor-shell-layout', () => ({
  useEditorShellLayout: vi.fn(() => ({
    metaOpen: true,
    setMetaOpen: vi.fn(),
    isLg: true,
  })),
}))

vi.mock('@/ui/editor-shell/use-editor-keyboard-shortcuts', () => ({
  useEditorKeyboardShortcuts: vi.fn(),
}))

import { lexicalBodyWith, lexicalParagraph } from '@kobato/inkling/tests/utils/lexical'

import type { EditorShellDetail, EntityLike } from '@/ui/editor-shell/editor-shell-types'

import { useEditorShellState } from '@/ui/editor-shell/use-editor-shell-state'

const renderHook = renderHookWithI18n

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

function makeEditArgs() {
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
    const { result, rerender } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeCreateArgs()))
    const firstBody = result.current.initialBody
    rerender()
    rerender()
    expect(result.current.initialBody).toBe(firstBody)
    expect(result.current.dialog.conflict).toBeNull()
  })

  it('edit mode with zero revisions survives re-renders with a referentially stable initialBody', () => {
    const { result, rerender } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    const firstBody = result.current.initialBody
    rerender()
    rerender()
    expect(result.current.initialBody).toBe(firstBody)
    expect(result.current.dialog.conflict).toBeNull()
  })
})

describe('ui/admin/editor-shell/useEditorShellState — adoptLocalDraft (V3-04)', () => {
  beforeEach(() => {
    localDraftState.loadedDraft = null
    autosaveMockReturns.setBaseline.mockClear()
    autosaveMockReturns.forceFlush.mockClear()
  })

  it('advances the autosave baseline after adopting a local draft so the next tick does not re-send it', async () => {
    const localBody = lexicalBodyWith([lexicalParagraph('local draft')])
    const directSaveDraft = vi.fn().mockResolvedValue({
      status: 'saved',
      revision: {
        id: 'rev-2',
        revisionNo: 1,
        status: 'draft',
        body: localBody,
        imageSources: [],
        headings: [],
        authorId: null,
        clientRevisionToken: 'tok-2',
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    })
    const args = { ...makeEditArgs(), directSaveDraft }
    const { result, rerender } = renderHook(() => useEditorShellState<Meta, EntityLike>(args))

    localDraftState.loadedDraft = { body: localBody, savedAt: 123 }
    rerender()

    expect(result.current.dialog.conflict).toEqual({ localBody, localSavedAt: 123 })

    await act(async () => {
      await result.current.dialog.adoptLocalDraft()
    })

    expect(directSaveDraft).toHaveBeenCalledWith({
      id: 'post-1',
      body: localBody,
      expectedClientRevisionToken: null,
      force: true,
    })
    expect(autosaveMockReturns.setBaseline).toHaveBeenCalledTimes(1)
    expect(autosaveMockReturns.setBaseline).toHaveBeenCalledWith(localBody)
    expect(result.current.body).toBe(localBody)
  })
})
