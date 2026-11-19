// @vitest-environment happy-dom

import { renderHookWithI18n } from '@kobato/web-admin/tests/utils/i18n-render.tsx'
import { act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

interface MutationSlot {
  onSuccess?: (data: never) => void
  onError?: (error: Error) => void
}

const slots: MutationSlot[] = []
let useMutationCalls = 0

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: MutationSlot) => {
    slots[useMutationCalls % 4] = config
    useMutationCalls += 1
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      isError: false,
      isSuccess: false,
    }
  }),
}))

vi.mock('@kobato/web-admin/ui/editor-shell/drafts/use-autosave.ts', () => ({
  useAutosave: vi.fn(() => ({ forceFlush: vi.fn(), setBaseline: vi.fn() })),
}))

vi.mock('@kobato/web-admin/ui/editor-shell/drafts/use-local-draft.ts', () => ({
  useLocalDraft: vi.fn(() => ({ loadedDraft: null, clearDraft: vi.fn() })),
}))

vi.mock('@kobato/web-admin/ui/editor-shell/drafts/use-create-draft.ts', () => ({
  useCreateDraft: vi.fn(() => ({
    sessionId: 'sess-1',
    loadedDraft: null,
    migrateToEditKey: vi.fn(),
    clearDraft: vi.fn(),
  })),
}))

vi.mock('@kobato/web-admin/ui/editor-shell/use-editor-shell-layout.ts', () => ({
  useEditorShellLayout: vi.fn(() => ({
    metaOpen: true,
    setMetaOpen: vi.fn(),
    isLg: true,
  })),
}))

vi.mock('@kobato/web-admin/ui/editor-shell/use-editor-keyboard-shortcuts.ts', () => ({
  useEditorKeyboardShortcuts: vi.fn(),
}))

import type { AdminRevisionDto, SaveBodyOutput } from '@kobato/contracts/revision.ts'
import type { EditorShellDetail, EntityLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'

import { emptyLexicalBody } from '@kobato/web-admin/tests/utils/lexical.ts'
import { useEditorShellState } from '@kobato/web-admin/ui/editor-shell/use-editor-shell-state.ts'

const renderHook = renderHookWithI18n

const WARNING = '图片库同步失败，部分图片可能无法正常显示。'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

const emptyMeta: Meta = { title: '', slug: '', published: false, publishedAt: '' }

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
    mode: 'edit' as const,
    detail,
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

describe('ui/admin/editor-shell/useEditorShellState — save-result warnings', () => {
  it('surfaces a saved-with-warning payload in the shell and sidebar status', () => {
    const { result } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    const payload: SaveBodyOutput = { status: 'saved', revision: makeRevision(), warning: WARNING }

    act(() => slots[1]?.onSuccess?.(payload as never))

    expect(result.current.sidebar.saveStatus).toEqual({ kind: 'warning', message: WARNING })
    expect(result.current.sidebar.expectedToken).toBe('tok-1')
  })

  it('does not let the concurrent meta leg clobber a body-leg warning', () => {
    const { result } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    const payload: SaveBodyOutput = { status: 'saved', revision: makeRevision(), warning: WARNING }

    act(() => slots[1]?.onSuccess?.(payload as never))
    act(() =>
      slots[0]?.onSuccess?.({
        id: 'post-1',
        slug: 'hello-world',
        updatedAt: '2026-07-10T00:00:00.000Z',
        publishedAt: null,
      } as never),
    )

    expect(result.current.sidebar.saveStatus).toEqual({ kind: 'warning', message: WARNING })
  })

  it('clears the warning on the next clean save', () => {
    const { result } = renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    const warned: SaveBodyOutput = { status: 'saved', revision: makeRevision(), warning: WARNING }
    const clean: SaveBodyOutput = {
      status: 'saved',
      revision: makeRevision({ id: 'rev-2', revisionNo: 2, clientRevisionToken: 'tok-2' }),
    }

    act(() => slots[1]?.onSuccess?.(warned as never))
    expect(result.current.sidebar.saveStatus).toEqual({ kind: 'warning', message: WARNING })

    act(() => slots[1]?.onSuccess?.(clean as never))
    expect(result.current.sidebar.saveStatus).toEqual({
      kind: 'saved',
      atMs: Date.parse('2026-07-10T00:00:00.000Z'),
    })
  })
})
