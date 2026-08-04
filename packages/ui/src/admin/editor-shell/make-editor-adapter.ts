import type { CreateDraftConfig } from '@kobato/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@kobato/client/hooks/use-local-draft'
import type { SaveBodyInput, SaveBodyOutput } from '@kobato/shared/contracts/revision'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { RevisionLike } from '@kobato/ui/admin/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@kobato/ui/admin/editor-shell/EditorMetaPanel'
import type { EditorScreenAdapter, EditorScreenEntity } from '@kobato/ui/admin/editor-shell/EditorScreen'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/** Meta-draft shape the shared screen reads (mirrors EditorScreenAdapter). */
type EditorMetaShape = { title: string; slug: string; published: boolean; publishedAt: string }

/** Both entity detail DTOs carry the same revision pair. */
interface DetailRevisions {
  latestRevision: RevisionLike | null
  publishedRevision: RevisionLike | null
}

/**
 * The oRPC namespace surface the editor adapter consumes
 * (`orpc.admin.posts` / `orpc.admin.pages` both satisfy it structurally).
 * `TWrappedEntity` is the `{ post | page: TEntity }` envelope the upsert /
 * unpublish procedures return.
 */
export interface EditorEntityApi<TUpsertMetaInput, TWrappedEntity> {
  upsertMeta: (input: TUpsertMetaInput) => Promise<TWrappedEntity>
  saveDraft: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishLatest: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublish: (input: { id: string }) => Promise<TWrappedEntity>
  delete: (input: { id: string }) => Promise<unknown>
  restore: (input: { id: string }) => Promise<unknown>
}

/**
 * Static entity parameterization of the editor adapter. Declared once per
 * entity at module level — every function inside keeps a stable identity
 * across renders, which `EditorScreen`'s memoized detail object relies on.
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
  localDraftConfig: LocalDraftConfig<LexicalBody>
  createDraftConfig: CreateDraftConfig<LexicalBody>
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt?: string | null }) => TUpsertMetaInput

  /** oRPC namespace (`orpc.admin.posts` / `orpc.admin.pages`). */
  api: EditorEntityApi<TUpsertMetaInput, TWrappedEntity>
  /** Unwrap the entity from upsert / unpublish procedure outputs. */
  unwrapEntity: (output: TWrappedEntity) => TEntity
  /** Query key of the entity's admin list namespace (invalidation target). */
  listQueryKey: () => QueryKey
}

/**
 * Per-render inputs the static config cannot know: the TanStack query
 * client (list invalidation) and the entity meta sidebar (posts thread a
 * feature gate from `useContentSettings` through theirs).
 *
 * `preview` carries the headless public-link face (plan 0.5 §5): the
 * frontend origin from `public.frontendUrl` and a short-lived, role-bound
 * preview token minted by the editor route loader. When set, every
 * "view on the public site" link becomes absolute and carries
 * `?preview_token=…` — the credential that authorizes draft reads on the
 * cross-domain frontend. `null` keeps the historical same-origin links
 * (single-origin / in-process deployments).
 */
export interface EditorAdapterRuntime<TMeta extends EditorMetaShape> {
  queryClient: QueryClient
  renderMetaSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
  preview?: { frontendUrl: string; token: string | null } | null
}

// Module-level revision accessors shared by every configured adapter —
// stable identities so the screen's memoized detail object only recomputes
// when the loader DTO itself changes.
const getLatestRevision = <TDetail extends DetailRevisions>(detail: TDetail) => detail.latestRevision
const getPublishedRevision = <TDetail extends DetailRevisions>(detail: TDetail) => detail.publishedRevision

/**
 * Assemble the `EditorScreenAdapter` for one entity. The two call sites
 * (`PostEditorShell` / `PageEditorShell`) differ only in the config object;
 * the wire wrappers (call → invalidate list → unwrap the entity envelope)
 * are the same shape for both and live here exactly once.
 */
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
    // The admin list lives in the TanStack cache (useInfiniteQuery in
    // PostsView / PagesView) — invalidate the namespace so a meta save
    // (including the create flow) is reflected when the user returns to it.
    void queryClient.invalidateQueries({ queryKey: config.listQueryKey() })
  }

  // Headless public-link face: absolute origin + preview-token query when
  // the deployment splits core and the frontend; same-origin relative
  // links otherwise. `previewQuery` is the bare `key=value` pair the
  // banner appends after its own `?draft=true` / `?` separator.
  const publicLinkOrigin = runtime.preview?.frontendUrl ?? ''
  const previewQuery =
    runtime.preview?.frontendUrl && runtime.preview.token !== null
      ? `preview_token=${encodeURIComponent(runtime.preview.token)}`
      : ''
  const publicPath = (slug: string) =>
    `${publicLinkOrigin}${config.publicPath(slug)}${previewQuery === '' ? '' : `?${previewQuery}`}`

  return {
    entityKind: config.entityKind,
    entityLabel: config.entityLabel,
    listPath: config.listPath,
    bannerBasePath: config.bannerBasePath,
    publicPath,
    publicLinkOrigin,
    previewQuery,
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
