import type { SaveBodyOutput } from '@kobato/shared/contracts/revision'
import type { EditorAdapterConfig } from '@kobato/ui/admin/editor-shell/make-editor-adapter'

import { lexicalBodySchema, EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { makeEditorAdapter } from '@kobato/ui/admin/editor-shell/make-editor-adapter'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

// The factory owns the wire wrappers both entity shells used to spell out
// twice: call the namespaced procedure, invalidate the admin list cache,
// unwrap the `{ entity: … }` envelope. These tests pin that contract with a
// minimal fake entity so a future drift in the shared wrappers (or a lost
// invalidation) fails here instead of in the editor.

interface TestMeta {
  title: string
  slug: string
  published: boolean
  publishedAt: string
}

interface TestEntity {
  id: string
  slug: string
  title: string
  deletedAt: string | null
  updatedAt: string
  publishedAt: string | null
}

interface TestDetail {
  entity: TestEntity
  latestRevision: null
  publishedRevision: null
}

interface TestUpsertInput {
  title: string
}

const ENTITY: TestEntity = {
  id: '1',
  slug: 'hello',
  title: 'Hello',
  deletedAt: null,
  updatedAt: '2024-01-02T00:00:00.000Z',
  publishedAt: '2024-01-01T00:00:00.000Z',
}

const LIST_KEY = ['admin', 'tests', 'list'] as const

function makeConfig(
  api: EditorAdapterConfig<TestMeta, TestEntity, TestDetail, TestUpsertInput, { entity: TestEntity }>['api'],
) {
  const config: EditorAdapterConfig<TestMeta, TestEntity, TestDetail, TestUpsertInput, { entity: TestEntity }> = {
    entityKind: 'post',
    entityLabel: '文章',
    listPath: '/admin/tests',
    bannerBasePath: '/tests',
    publicPath: (slug) => `/tests/${slug}`,
    editPath: (id) => `/editor/test/${id}`,

    getEntity: (d) => d.entity,

    emptyMeta: { title: '', slug: '', published: false, publishedAt: '' },
    metaDraftFromEntity: (entity) => ({
      title: entity.title,
      slug: entity.slug,
      published: false,
      publishedAt: '',
    }),
    metaDraftsEqual: (a, b) => a.title === b.title && a.slug === b.slug,
    localDraftConfig: {
      keyPrefix: 'test-draft:',
      broadcastName: 'test-draft',
      editType: 'post-edit',
      bodySchema: lexicalBodySchema,
    },
    createDraftConfig: {
      keyPrefix: 'test-draft:new:',
      sessionKey: 'test-draft:new:session',
      broadcastName: 'test-draft',
      createType: 'post-create',
      editType: 'post-edit',
      editKeyPrefix: 'test-draft:',
      bodySchema: lexicalBodySchema,
    },
    buildUpsertMetaPayload: ({ meta }) => ({ title: meta.title }),

    api,
    unwrapEntity: (output) => output.entity,
    listQueryKey: () => [...LIST_KEY],
  }
  return config
}

function makeRuntime() {
  const queryClient = new QueryClient()
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const runtime = {
    queryClient,
    renderMetaSidebar: () => null,
  }
  return { invalidateSpy, runtime }
}

function makeApi() {
  return {
    upsertMeta: vi.fn(async (_input: TestUpsertInput) => ({ entity: ENTITY })),
    saveDraft: vi.fn(async () => ({ status: 'saved' }) as unknown as SaveBodyOutput),
    publishLatest: vi.fn(async () => ({ status: 'saved' }) as unknown as SaveBodyOutput),
    unpublish: vi.fn(async (_input: { id: string }) => ({ entity: ENTITY })),
    delete: vi.fn(async (_input: { id: string }) => ({ success: true })),
    restore: vi.fn(async (_input: { id: string }) => ({ success: true })),
  }
}

describe('ui/admin/editor-shell/makeEditorAdapter', () => {
  it('upsertMetaFn calls the namespace procedure, invalidates the list, and unwraps the entity', async () => {
    const api = makeApi()
    const { invalidateSpy, runtime } = makeRuntime()
    const adapter = makeEditorAdapter(makeConfig(api), runtime)

    const result = await adapter.upsertMetaFn({ title: 'Hello' })

    expect(api.upsertMeta).toHaveBeenCalledWith({ title: 'Hello' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...LIST_KEY] })
    expect(result).toBe(ENTITY)
  })

  it('publishFn invalidates the list and returns the procedure result untouched', async () => {
    const api = makeApi()
    const { invalidateSpy, runtime } = makeRuntime()
    const adapter = makeEditorAdapter(makeConfig(api), runtime)
    const input = { id: '1', body: EMPTY_LEXICAL_BODY }

    const result = await adapter.publishFn(input)

    expect(api.publishLatest).toHaveBeenCalledWith(input)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...LIST_KEY] })
    expect(result).toEqual({ status: 'saved' })
  })

  it('unpublishFn calls the namespace procedure, invalidates the list, and unwraps the entity', async () => {
    const api = makeApi()
    const { invalidateSpy, runtime } = makeRuntime()
    const adapter = makeEditorAdapter(makeConfig(api), runtime)

    const result = await adapter.unpublishFn({ id: '1' })

    expect(api.unpublish).toHaveBeenCalledWith({ id: '1' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...LIST_KEY] })
    expect(result).toBe(ENTITY)
  })

  it('saveDraftFn and directSaveDraft pass through to the namespace without invalidating', async () => {
    const api = makeApi()
    const { invalidateSpy, runtime } = makeRuntime()
    const adapter = makeEditorAdapter(makeConfig(api), runtime)
    const input = { id: '1', body: EMPTY_LEXICAL_BODY }

    await adapter.saveDraftFn(input)
    await adapter.directSaveDraft(input)

    expect(api.saveDraft).toHaveBeenCalledTimes(2)
    expect(api.saveDraft).toHaveBeenCalledWith(input)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('deleteEntityFn / restoreEntityFn wrap the id and invalidateList hits the list key', async () => {
    const api = makeApi()
    const { invalidateSpy, runtime } = makeRuntime()
    const adapter = makeEditorAdapter(makeConfig(api), runtime)

    await adapter.deleteEntityFn('1')
    await adapter.restoreEntityFn('2')
    adapter.invalidateList()

    expect(api.delete).toHaveBeenCalledWith({ id: '1' })
    expect(api.restore).toHaveBeenCalledWith({ id: '2' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...LIST_KEY] })
  })

  it('threads the static config through and derives the revision accessors from the detail DTO', () => {
    const api = makeApi()
    const { runtime } = makeRuntime()
    const config = makeConfig(api)
    const adapter = makeEditorAdapter(config, runtime)
    const detail: TestDetail = { entity: ENTITY, latestRevision: null, publishedRevision: null }

    expect(adapter.entityKind).toBe('post')
    expect(adapter.entityLabel).toBe('文章')
    expect(adapter.listPath).toBe('/admin/tests')
    expect(adapter.publicPath('hello')).toBe('/tests/hello')
    expect(adapter.getEntity(detail)).toBe(ENTITY)
    expect(adapter.getLatestRevision(detail)).toBeNull()
    expect(adapter.getPublishedRevision(detail)).toBeNull()
    expect(adapter.metaDraftFromEntity(ENTITY).slug).toBe('hello')
    expect(adapter.buildUpsertMetaPayload({ meta: config.emptyMeta, publishedAt: null })).toEqual({ title: '' })
  })
})
