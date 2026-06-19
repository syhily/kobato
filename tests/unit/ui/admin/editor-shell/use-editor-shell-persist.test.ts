import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

// useEditorShellPersist depends on @tanstack/react-query's useMutation and
// on useAutosave. The SSR renderHook harness renders a single synchronous
// pass, so effects (including the autosave subscription) do not fire. What
// IS observable in one pass:
//   - the four mutations are instantiated with the supplied fns
//   - the derived pending flags (isPending / isSavingDraft / isPublishing /
//     isUnpublishing / isCreating) reflect the mocked mutation states
//   - the four persist handlers are returned as functions
//   - persistSave / persistPublish / persistUnpublish short-circuit
//     (setStatus aside) when `!isEditing || !detail`
//   - persistCreate short-circuits when isEditing or isCreating is true
//
// `localInputValueToIso` is a private module helper, not exported. Its
// branches are exercised indirectly by persistSave / persistPublish /
// persistCreate (which call it on `meta.publishedAt`), but those paths
// also branch on the mutation results which we cannot drive through the
// SSR harness. The pure helper is therefore also covered directly in
// editor-shell-derived.test coverage (parseLocalDateTime mirrors it).

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

import type { InklingDocument } from '@/shared/inkling/schema'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { useEditorShellPersist } from '@/ui/admin/editor-shell/use-editor-shell-persist'

type Meta = { title: string; slug: string; published: boolean; publishedAt: string }

const baseMeta: Meta = { title: 't', slug: 's', published: false, publishedAt: '' }

// Minimal Inkling document helper for persist tests. Node keys are included
// so we can prove that semantic equality ignores generated keys.
function inklingDocWithText(text: string, keyPrefix = 'k'): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          key: `${keyPrefix}-p`,
          direction: null,
          format: '',
          indent: 0,
          children: [{ type: 'text', version: 1, key: `${keyPrefix}-t`, text }],
        },
      ],
    },
  }
}

function inklingDocWithImage(src: string): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'image-card',
          version: 1,
          src,
        },
      ],
    },
  }
}

function makeArgs(overrides: Partial<Parameters<typeof useEditorShellPersist>[0]> = {}) {
  return {
    isEditing: false,
    meta: baseMeta,
    body: EMPTY_INKLING_DOCUMENT,
    expectedToken: null,
    detail: undefined,
    serverPublishedAtIso: null,
    conflict: null,
    upsertMetaFn: vi.fn(),
    saveDraftFn: vi.fn(),
    publishFn: vi.fn(),
    unpublishFn: vi.fn(),
    buildUpsertMetaPayload: vi.fn(),
    directSaveDraft: vi.fn(),
    editPath: (id: string) => `/edit/${id}`,
    navigate: vi.fn(),
    metaDraftFromEntity: vi.fn(() => baseMeta),
    onMetaSaved: vi.fn(),
    onBodySaved: vi.fn(),
    onUnpublishSaved: vi.fn(),
    noteError: vi.fn(),
    setStatus: vi.fn(),
    setMeta: vi.fn(),
    setServerPublishedAtIso: vi.fn(),
    lastSavedBody: EMPTY_INKLING_DOCUMENT,
    markBodySaved: vi.fn(),
    pendingActionRef: { current: null },
    createDraft: { migrateToEditKey: vi.fn() },
    ...overrides,
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
    // The four mutation objects are exposed too.
    expect(result.upsertMetaMutation).toBeDefined()
    expect(result.saveDraftMutation).toBeDefined()
    expect(result.publishMutation).toBeDefined()
    expect(result.unpublishMutation).toBeDefined()
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
    expect(args.setStatus).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('persistPublish sets an error status when not editing', () => {
    const args = makeArgs({ isEditing: false })
    const { persistPublish } = renderHook(() => useEditorShellPersist(args))
    persistPublish()
    expect(args.setStatus).toHaveBeenCalledWith({ kind: 'error', message: '请先保存基本信息再发布。' })
    expect(mutate).not.toHaveBeenCalled()
  })

  it('persistUnpublish is a no-op when not editing', () => {
    const args = makeArgs({ isEditing: false })
    const { persistUnpublish } = renderHook(() => useEditorShellPersist(args))
    persistUnpublish()
    expect(args.setStatus).not.toHaveBeenCalled()
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
    expect(args.navigate).not.toHaveBeenCalled()
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
      meta: { ...baseMeta, publishedAt: '2025-01-01T00:00' },
      buildUpsertMetaPayload: vi.fn().mockReturnValue(payload),
      lastSavedBody: inklingDocWithText('same', 'old'),
      body: inklingDocWithText('same', 'new'), // semantically equal -> not diverged
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    // setStatus({ kind: 'saving' }) is the first call.
    expect(args.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    // upsertMeta mutation fired exactly once with the built payload.
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(args.buildUpsertMetaPayload).toHaveBeenCalledWith({
      meta: args.meta,
      id: 'e1',
      publishedAt: expect.any(String),
    })
    // The pending-action ref is armed for the draft leg.
    expect(args.pendingActionRef.current).toEqual({ kind: 'draft', remaining: 1 })
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
      meta: { ...baseMeta, publishedAt: '' },
      buildUpsertMetaPayload: vi.fn().mockReturnValue({ meta: baseMeta }),
      lastSavedBody: inklingDocWithText('old text'),
      body: inklingDocWithText('new text'), // diverged
      expectedToken: 'tok-1',
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    // Both mutations fire (upsertMeta + saveDraft).
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(args.pendingActionRef.current).toEqual({ kind: 'draft', remaining: 2 })
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
      meta: { ...baseMeta, publishedAt: '2025-06-01T12:00' },
      body: inklingDocWithText('x'),
      expectedToken: 'tok-1',
    })
    const { persistPublish } = renderHook(() => useEditorShellPersist(args))
    persistPublish()

    expect(args.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    expect(mutate).toHaveBeenCalledTimes(1)
    // setServerPublishedAtIso is updated to the parsed ISO.
    expect(args.setServerPublishedAtIso).toHaveBeenCalledWith(expect.any(String))
    expect(args.pendingActionRef.current).toEqual({ kind: 'published', remaining: 1 })
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

    expect(args.setStatus).toHaveBeenCalledWith({ kind: 'saving' })
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})

describe('ui/admin/editor-shell/useEditorShellPersist — Inkling semantic dirty check', () => {
  beforeEach(() => {
    mutate.mockClear()
  })

  it('treats documents with different generated keys but identical text as not dirty', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({
      isEditing: true,
      detail,
      lastSavedBody: inklingDocWithText('hello', 'old'),
      body: inklingDocWithText('hello', 'new'),
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    // Only upsertMeta fires because the body is semantically unchanged.
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(args.pendingActionRef.current).toEqual({ kind: 'draft', remaining: 1 })
  })

  it('treats changed text as dirty and fires saveDraft', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({
      isEditing: true,
      detail,
      lastSavedBody: inklingDocWithText('hello'),
      body: inklingDocWithText('world'),
      expectedToken: 'tok-1',
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(args.pendingActionRef.current).toEqual({ kind: 'draft', remaining: 2 })
  })

  it('treats changed custom block payload as dirty and fires saveDraft', () => {
    const detail = {
      entity: { id: 'e1', slug: 's', updatedAt: '', publishedAt: null },
      latestRevision: null,
      publishedRevision: null,
    }
    const args = makeArgs({
      isEditing: true,
      detail,
      lastSavedBody: inklingDocWithImage('https://example.com/old.png'),
      body: inklingDocWithImage('https://example.com/new.png'),
      expectedToken: 'tok-1',
    })
    const { persistSave } = renderHook(() => useEditorShellPersist(args))
    persistSave()

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(args.pendingActionRef.current).toEqual({ kind: 'draft', remaining: 2 })
  })
})
