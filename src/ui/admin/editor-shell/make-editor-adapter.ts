import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { AdminRevisionDto, SaveBodyInput, SaveBodyOutput } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { RevisionLike } from '@/ui/admin/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@/ui/admin/editor-shell/EditorMetaPanel'
import type { EditorScreenAdapter, EditorScreenEntity } from '@/ui/admin/editor-shell/EditorScreen'

/** Meta-draft shape the shared screen reads (mirrors EditorScreenAdapter). */
type EditorMetaShape = { title: string; slug: string; published: boolean; publishedAt: string }

/** Both entity detail DTOs carry the same revision pair. */
interface DetailRevisions {
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

/** The oRPC namespace surface the editor adapter consumes — `orpc.admin.posts` / `orpc.admin.pages` both satisfy it structurally. */
export interface EditorEntityApi<TUpsertMetaInput, TWrappedEntity> {
  upsertMeta: (input: TUpsertMetaInput) => Promise<TWrappedEntity>
  saveDraft: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishLatest: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublish: (input: { id: string }) => Promise<TWrappedEntity>
  delete: (input: { id: string }) => Promise<unknown>
  restore: (input: { id: string }) => Promise<unknown>
}

/**
 * Static entity parameterization declared once per entity — stable function
 * identities across renders, which `EditorScreen`'s memoized detail relies on.
 */
export interface EditorAdapterConfig<
  TMeta extends EditorMetaShape,
  TEntity extends EditorScreenEntity,
  TDetail extends DetailRevisions,
  TUpsertMetaInput,
  TWrappedEntity,
> {
  entityKind: 'post' | 'page'
  /** Display noun woven into toolbar / panel / dialog copy (`文章` / `页面`). */
  entityLabel: string
  /** Admin list route (back button, delete navigation). */
  listPath: string
  /** Public URL prefix for the post-save preview banner (`/posts` / ``). */
  bannerBasePath: string
  /** Public detail URL of the entity being edited. */
  publicPath: (slug: string) => string
  /** Analytics dashboard URL; omit when the entity has none (pages). */
  analyticsPath?: (id: string) => string
  editPath: (id: string) => string

  /** Unwrap the entity from the detail DTO (`d.post` / `d.page`). */
  getEntity: (detail: TDetail) => TEntity

  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  createDraftConfig: CreateDraftConfig<LexicalEditorState>
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt?: string | null }) => TUpsertMetaInput

  /** oRPC namespace (`orpc.admin.posts` / `orpc.admin.pages`). */
  api: EditorEntityApi<TUpsertMetaInput, TWrappedEntity>
  /** Unwrap the entity from upsert / unpublish procedure outputs. */
  unwrapEntity: (output: TWrappedEntity) => TEntity
  /** Query key of the entity's admin list namespace (invalidation target). */
  listQueryKey: () => QueryKey
}

/** Per-render inputs the static config cannot know: query client (list invalidation) and the entity meta sidebar. */
export interface EditorAdapterRuntime<TMeta extends EditorMetaShape> {
  queryClient: QueryClient
  renderMetaSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
}

// Module-level revision accessors — stable identities keep the screen's memoized detail object referentially stable.
const getLatestRevision = (detail: DetailRevisions): RevisionLike | null => detail.latestRevision
const getPublishedRevision = (detail: DetailRevisions): RevisionLike | null => detail.publishedRevision

/** Assemble the `EditorScreenAdapter` for one entity; the wire wrappers (call → invalidate list → unwrap envelope) live here exactly once. */
export function makeEditorAdapter<
  TMeta extends EditorMetaShape,
  TEntity extends EditorScreenEntity,
  TDetail extends DetailRevisions,
  TUpsertMetaInput,
  TWrappedEntity,
>(
  config: EditorAdapterConfig<TMeta, TEntity, TDetail, TUpsertMetaInput, TWrappedEntity>,
  runtime: EditorAdapterRuntime<TMeta>,
): EditorScreenAdapter<TMeta, TEntity, TDetail, TUpsertMetaInput> {
  const { queryClient } = runtime

  const invalidateList = () => {
    // The admin list lives in the TanStack cache — invalidate so a meta save shows up on return.
    void queryClient.invalidateQueries({ queryKey: config.listQueryKey() })
  }

  return {
    entityKind: config.entityKind,
    entityLabel: config.entityLabel,
    listPath: config.listPath,
    bannerBasePath: config.bannerBasePath,
    publicPath: config.publicPath,
    analyticsPath: config.analyticsPath,
    editPath: config.editPath,

    getEntity: config.getEntity,
    getLatestRevision,
    getPublishedRevision,

    emptyMeta: config.emptyMeta,
    metaDraftFromEntity: config.metaDraftFromEntity,
    metaDraftsEqual: config.metaDraftsEqual,
    localDraftConfig: config.localDraftConfig,
    createDraftConfig: config.createDraftConfig,

    upsertMetaFn: async (input) => {
      const result = await config.api.upsertMeta(input)
      invalidateList()
      return config.unwrapEntity(result)
    },
    saveDraftFn: (input) => config.api.saveDraft(input),
    publishFn: async (input) => {
      const result = await config.api.publishLatest(input)
      invalidateList()
      return result
    },
    unpublishFn: async (input) => {
      const result = await config.api.unpublish(input)
      invalidateList()
      return config.unwrapEntity(result)
    },
    buildUpsertMetaPayload: config.buildUpsertMetaPayload,
    directSaveDraft: (input) => config.api.saveDraft(input),

    deleteEntityFn: (id) => config.api.delete({ id }),
    restoreEntityFn: (id) => config.api.restore({ id }),
    invalidateList,

    renderMetaSidebar: runtime.renderMetaSidebar,
  }
}
