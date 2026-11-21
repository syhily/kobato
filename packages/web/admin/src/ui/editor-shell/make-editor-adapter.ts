import type { AdminRevisionDto, SaveBodyInput, SaveBodyOutput } from '@kobato/api/contracts/revision'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { CreateDraftConfig } from '@kobato/web-admin/ui/editor-shell/drafts/use-create-draft'
import type { LocalDraftConfig } from '@kobato/web-admin/ui/editor-shell/drafts/use-local-draft'
import type { RevisionLike } from '@kobato/web-admin/ui/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@kobato/web-admin/ui/editor-shell/EditorMetaPanel'
import type { EditorScreenAdapter, EditorScreenEntity } from '@kobato/web-admin/ui/editor-shell/EditorScreen'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { ReactNode } from 'react'

type EditorMetaShape = { title: string; slug: string; published: boolean; publishedAt: string }

interface DetailRevisions {
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}

export interface EditorEntityApi<TUpsertMetaInput, TWrappedEntity> {
  upsertMeta: (input: TUpsertMetaInput) => Promise<TWrappedEntity>
  saveDraft: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishLatest: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublish: (input: { id: string }) => Promise<TWrappedEntity>
  delete: (input: { id: string }) => Promise<unknown>
  restore: (input: { id: string }) => Promise<unknown>
}

export interface EditorAdapterConfig<
  TMeta extends EditorMetaShape,
  TEntity extends EditorScreenEntity,
  TDetail extends DetailRevisions,
  TUpsertMetaInput,
  TWrappedEntity,
> {
  entityKind: 'post' | 'page'
  entityLabelId: UiMessageId
  listPath: string
  bannerBasePath: string
  publicPath: (slug: string) => string
  analyticsPath?: (id: string) => string
  editPath: (id: string) => string

  getEntity: (detail: TDetail) => TEntity

  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  createDraftConfig: CreateDraftConfig<LexicalEditorState>
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt?: string | null }) => TUpsertMetaInput

  api: EditorEntityApi<TUpsertMetaInput, TWrappedEntity>
  unwrapEntity: (output: TWrappedEntity) => TEntity
  listQueryKey: () => QueryKey
}

export interface EditorAdapterRuntime<TMeta extends EditorMetaShape> {
  queryClient: QueryClient
  renderMetaSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
}

const getLatestRevision = (detail: DetailRevisions): RevisionLike | null => detail.latestRevision
const getPublishedRevision = (detail: DetailRevisions): RevisionLike | null => detail.publishedRevision

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
    void queryClient.invalidateQueries({ queryKey: config.listQueryKey() })
  }

  return {
    entityKind: config.entityKind,
    entityLabelId: config.entityLabelId,
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
