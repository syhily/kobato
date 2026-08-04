// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The merged autosave freeze (one gate, two sources) end-to-end through
// the orchestrator: persist reports the server leg via the
// noteRevisionConflict notification, the orchestrator merges it with the
// local-draft leg into the single `draft.freeze` flag persist gates on,
// and the next clean save clears it in noteRevisionSaved. Same mock seam
// as use-editor-shell-warning.test.tsx — slot order matches the
// useMutation call order in use-editor-shell-persist:
//   0 = upsertMeta, 1 = saveDraft, 2 = publish, 3 = unpublish

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

vi.mock('@kobato/ui/admin/editor-shell/use-editor-shell-layout', () => ({
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

vi.mock('@kobato/ui/admin/editor-shell/use-editor-keyboard-shortcuts', () => ({
  useEditorKeyboardShortcuts: vi.fn(),
}))

import type { AdminRevisionDto, SaveBodyOutput } from '@kobato/shared/contracts/revision'
import type { EditorShellDetail, EntityLike } from '@kobato/ui/admin/editor-shell/editor-shell-types'

import { useAutosave } from '@kobato/client/hooks/use-autosave'
import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { useEditorShellState } from '@kobato/ui/admin/editor-shell/use-editor-shell-state'

const useAutosaveMock = vi.mocked(useAutosave)

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
    body: EMPTY_LEXICAL_BODY,
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

/** Options of the most recent useAutosave call (one per render). */
function lastAutosaveOptions() {
  const call = useAutosaveMock.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call![0] as { enabled: boolean }
}

describe('ui/admin/editor-shell/useEditorShellState — merged autosave freeze', () => {
  it('freezes on a server revision conflict and unfreezes on the next clean save', () => {
    renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))
    expect(lastAutosaveOptions().enabled).toBe(true)

    // The body leg lands with a revision conflict: persist reports the
    // server leg, the orchestrator merges it into the single freeze flag.
    const conflicted: SaveBodyOutput = {
      status: 'conflict',
      latest: makeRevision(),
      expectedToken: 'tok-server',
    }
    act(() => slots[1]?.onSuccess?.(conflicted as never))
    expect(lastAutosaveOptions().enabled).toBe(false)

    // The conflict recovery is the next clean save: noteRevisionSaved
    // clears the server leg and the gate reopens.
    const clean: SaveBodyOutput = {
      status: 'saved',
      revision: makeRevision({ id: 'rev-2', revisionNo: 2, clientRevisionToken: 'tok-2' }),
    }
    act(() => slots[1]?.onSuccess?.(clean as never))
    expect(lastAutosaveOptions().enabled).toBe(true)
  })

  it('keeps autosave frozen when a later save conflicts again (no clean save in between)', () => {
    renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs()))

    const conflicted: SaveBodyOutput = {
      status: 'conflict',
      latest: makeRevision(),
      expectedToken: 'tok-server',
    }
    act(() => slots[1]?.onSuccess?.(conflicted as never))
    act(() => slots[1]?.onSuccess?.(conflicted as never))
    expect(lastAutosaveOptions().enabled).toBe(false)
  })
})
