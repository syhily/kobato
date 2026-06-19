import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

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

import { useCreateDraft } from '@/client/hooks/use-create-draft'
import { useLocalDraft } from '@/client/hooks/use-local-draft'

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

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { InklingDocument } from '@/shared/inkling/schema'
import type { EntityLike } from '@/ui/admin/editor-shell/editor-shell-types'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { inklingDocumentSchema } from '@/shared/inkling/schema'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'

interface Meta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

const emptyMeta: Meta = { title: '', slug: '', published: false, publishedAt: '' }

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

const defaultLocalDraftConfig: LocalDraftConfig<InklingDocument> = {
  keyPrefix: 'cms-post-draft-v2:',
  broadcastName: 'cms-post-draft-v2',
  editType: 'post-edit',
  bodySchema: inklingDocumentSchema,
}

const defaultCreateDraftConfig: CreateDraftConfig<InklingDocument> = {
  keyPrefix: 'cms-post-draft:new:v2:',
  sessionKey: 'cms-post-draft:new:v2:session',
  broadcastName: 'cms-post-draft-v2',
  createType: 'post-create',
  editType: 'post-edit',
  editKeyPrefix: 'cms-post-draft-v2:',
  bodySchema: inklingDocumentSchema,
}

function makeEditArgs(
  overrides: {
    localDraftConfig?: LocalDraftConfig<InklingDocument>
    createDraftConfig?: CreateDraftConfig<InklingDocument>
  } = {},
) {
  return {
    mode: 'edit' as const,
    entityKind: 'post' as const,
    detail: {
      entity: { id: 'post-1', slug: 'hello', updatedAt: '2024-01-01T00:00:00.000Z', publishedAt: null },
      latestRevision: {
        id: 'rev-1',
        revisionNo: 1,
        status: 'draft' as const,
        body: inklingDocWithText('hello', 'rev1'),
        clientRevisionToken: 'tok-1',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      publishedRevision: null,
    },
    emptyMeta,
    metaDraftFromEntity: vi.fn((e: { slug: string }) => ({
      title: '',
      slug: e.slug,
      published: false,
      publishedAt: '',
    })),
    metaDraftsEqual: vi.fn((a: Meta, b: Meta) => a.title === b.title && a.slug === b.slug),
    localDraftConfig: overrides.localDraftConfig ?? defaultLocalDraftConfig,
    createDraftConfig: overrides.createDraftConfig ?? defaultCreateDraftConfig,
    upsertMetaFn: vi.fn(),
    saveDraftFn: vi.fn(),
    publishFn: vi.fn(),
    unpublishFn: vi.fn(),
    buildUpsertMetaPayload: vi.fn(),
    directSaveDraft: vi.fn(),
    editPath: (id: string) => `/editor/post/${id}`,
    navigate: vi.fn(),
  }
}

describe('ui/admin/editor-shell — Inkling integration', () => {
  beforeEach(() => {
    vi.mocked(useLocalDraft).mockClear()
    vi.mocked(useCreateDraft).mockClear()
  })

  it('uses v2 local draft keys and never reads old prefixes', () => {
    const localDraftConfig: LocalDraftConfig<InklingDocument> = {
      keyPrefix: 'cms-post-draft-v2:',
      broadcastName: 'cms-post-draft-v2',
      editType: 'post-edit',
      bodySchema: inklingDocumentSchema,
    }
    const createDraftConfig: CreateDraftConfig<InklingDocument> = {
      keyPrefix: 'cms-post-draft:new:v2:',
      sessionKey: 'cms-post-draft:new:v2:session',
      broadcastName: 'cms-post-draft-v2',
      createType: 'post-create',
      editType: 'post-edit',
      editKeyPrefix: 'cms-post-draft-v2:',
      bodySchema: inklingDocumentSchema,
    }

    renderHook(() => useEditorShellState<Meta, EntityLike>(makeEditArgs({ localDraftConfig, createDraftConfig })))

    const localCalls = vi.mocked(useLocalDraft).mock.calls
    expect(localCalls).toHaveLength(1)
    expect(localCalls[0]![0].keyPrefix).toBe('cms-post-draft-v2:')
    expect(localCalls[0]![0].keyPrefix).not.toBe('cms-post-draft:')

    const createCalls = vi.mocked(useCreateDraft).mock.calls
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]![0].keyPrefix).toBe('cms-post-draft:new:v2:')
    expect(createCalls[0]![0].keyPrefix).not.toBe('cms-post-draft:new:')
  })

  it('treats equal Inkling documents with different generated keys as not dirty', () => {
    const args = makeEditArgs()
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args), {
      actions: [
        (r) => {
          // initialBody was loaded from the revision; setting body to the same
          // semantic content with different generated keys should not flag sync.
          r.setBody(inklingDocWithText('hello', 'different'))
        },
      ],
    })

    expect(result.showPreviewPublicSyncHint).toBe(false)
  })

  it('treats changed Inkling text as dirty', () => {
    const args = makeEditArgs()
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args), {
      actions: [(r) => r.setBody(inklingDocWithText('changed', 'different'))],
    })

    expect(result.showPreviewPublicSyncHint).toBe(true)
  })

  it('treats changed Inkling custom block payload as dirty', () => {
    const args = makeEditArgs()
    const result = renderHook(() => useEditorShellState<Meta, EntityLike>(args), {
      actions: [
        (r) =>
          r.setBody({
            ...EMPTY_INKLING_DOCUMENT,
            root: {
              ...EMPTY_INKLING_DOCUMENT.root,
              children: [
                {
                  type: 'image-card',
                  version: 1,
                  src: 'https://example.com/new.png',
                },
              ],
            },
          }),
      ],
    })

    expect(result.showPreviewPublicSyncHint).toBe(true)
  })
})
