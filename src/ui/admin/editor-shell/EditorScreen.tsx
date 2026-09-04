import type { NavigateFunction } from 'react-router'

import { useMemo } from 'react'

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { SaveBodyInput, SaveBodyOutput } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { EntityLike, RevisionLike, UseEditorShellStateOutput } from '@/ui/admin/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@/ui/admin/editor-shell/EditorMetaPanel'

import { CreateModeBanner } from '@/ui/admin/editor-shared/CreateModeBanner'
import { TitleSlugStrip } from '@/ui/admin/editor-shared/TitleSlugStrip'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { EditorMetaPanel } from '@/ui/admin/editor-shell/EditorMetaPanel'
import { EditorToolbar } from '@/ui/admin/editor-shell/EditorToolbar'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'
import { PageBodyEditor } from '@/ui/admin/editor/PageBodyEditor'
import { cn } from '@/ui/lib/cn'

/** Entity shape the screen itself reads (toolbar links, panel extras). */
export interface EditorScreenEntity extends EntityLike {
  title: string
  deletedAt: string | null
}

/** Entity parameterization of the editor screen — all entity differences. */
export interface EditorScreenAdapter<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput,
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

  getEntity: (detail: TDetail) => TEntity
  getLatestRevision: (detail: TDetail) => RevisionLike | null
  getPublishedRevision: (detail: TDetail) => RevisionLike | null

  emptyMeta: TMeta
  metaDraftFromEntity: (entity: TEntity) => TMeta
  metaDraftsEqual: (a: TMeta, b: TMeta) => boolean
  localDraftConfig: LocalDraftConfig<LexicalEditorState>
  createDraftConfig: CreateDraftConfig<LexicalEditorState>

  upsertMetaFn: (input: TUpsertMetaInput) => Promise<TEntity>
  saveDraftFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublishFn: (input: { id: string }) => Promise<TEntity>
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt?: string | null }) => TUpsertMetaInput
  directSaveDraft: (input: {
    id: string
    body: LexicalEditorState
    expectedClientRevisionToken?: string | null
    force?: boolean
  }) => Promise<SaveBodyOutput>

  deleteEntityFn: (id: string) => Promise<unknown>
  restoreEntityFn: (id: string) => Promise<unknown>
  /** Invalidate the entity's admin list cache namespace. */
  invalidateList: () => void

  /** Entity meta sidebar (post adds category / tags / alias + feature gate). */
  renderMetaSidebar: (props: MetaSidebarSlotProps<TMeta>) => React.ReactNode
}

export interface EditorScreenProps<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput = Record<string, unknown>,
> {
  mode: 'create' | 'edit'
  detail?: TDetail
  navigate: NavigateFunction
  adapter: EditorScreenAdapter<TMeta, TEntity, TDetail, TUpsertMetaInput>
}

/** The shared editor screen for both entities — differences arrive through
 *  the adapter; shared state lives in `useEditorShellState`. */
export function EditorScreen<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput = Record<string, unknown>,
>({ mode, detail, navigate, adapter }: EditorScreenProps<TMeta, TEntity, TDetail, TUpsertMetaInput>) {
  const isEditing = mode === 'edit' && detail !== undefined
  const { getEntity, getLatestRevision, getPublishedRevision } = adapter
  const entity = isEditing ? getEntity(detail) : undefined

  // Loader-stable detail object: memoizing on it keeps the state hook's memos from recomputing every render.
  const editorDetail = useMemo(
    () =>
      detail !== undefined
        ? {
            entity: getEntity(detail),
            latestRevision: getLatestRevision(detail),
            publishedRevision: getPublishedRevision(detail),
          }
        : undefined,
    [detail, getEntity, getLatestRevision, getPublishedRevision],
  )

  const state: UseEditorShellStateOutput<TMeta> = useEditorShellState<TMeta, TEntity, TUpsertMetaInput>({
    mode,
    detail: editorDetail,
    emptyMeta: adapter.emptyMeta,
    metaDraftFromEntity: adapter.metaDraftFromEntity,
    metaDraftsEqual: adapter.metaDraftsEqual,
    localDraftConfig: adapter.localDraftConfig,
    createDraftConfig: adapter.createDraftConfig,
    upsertMetaFn: adapter.upsertMetaFn,
    saveDraftFn: adapter.saveDraftFn,
    publishFn: adapter.publishFn,
    unpublishFn: adapter.unpublishFn,
    buildUpsertMetaPayload: adapter.buildUpsertMetaPayload,
    directSaveDraft: adapter.directSaveDraft,
    editPath: adapter.editPath,
    navigate,
  })

  return (
    <div className="flex min-h-admin-content-min flex-col gap-0 p-2 md:gap-4 md:p-4">
      <EditorToolbar
        mode={mode}
        entityLabel={adapter.entityLabel}
        listPath={adapter.listPath}
        publicPath={entity !== undefined ? adapter.publicPath(entity.slug) : null}
        analyticsPath={
          entity !== undefined && adapter.analyticsPath !== undefined ? adapter.analyticsPath(entity.id) : null
        }
        state={state.toolbar}
      />

      {isEditing && state.previewBanner !== null ? (
        <ActionBanner
          kind={state.previewBanner.kind}
          slug={state.previewBanner.slug}
          basePath={adapter.bannerBasePath}
          onClose={state.dismissPreviewBanner}
        />
      ) : null}

      {/* Layout grid: [editor | meta] when the meta panel is open, [editor] otherwise. */}
      <div
        className={cn(
          'mt-4 grid grow gap-4 md:mt-0',
          state.metaOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : 'lg:grid-cols-[minmax(0,1fr)]',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {mode === 'create' ? (
            <CreateModeBanner entityLabel={adapter.entityLabel} draftSavedAt={state.createDraftSavedAt} />
          ) : null}
          <TitleSlugStrip
            entityLabel={adapter.entityLabel}
            title={state.meta.title}
            slug={state.meta.slug}
            onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
            onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
            disabled={state.toolbar.isPending}
          />
          <PageBodyEditor
            initialBody={state.initialBody}
            bodyKey={state.bodyKey}
            onBodyChange={state.setBody}
            disabled={state.toolbar.isPending}
          />
        </div>
        <EditorMetaPanel
          entityKind={adapter.entityKind}
          entityLabel={adapter.entityLabel}
          entity={entity}
          metaOpen={state.metaOpen}
          setMetaOpen={state.setMetaOpen}
          isLg={state.isLg}
          sidebar={state.sidebar}
          renderSidebar={adapter.renderMetaSidebar}
          deleteRestore={{
            listPath: adapter.listPath,
            deleteFn: adapter.deleteEntityFn,
            restoreFn: adapter.restoreEntityFn,
            invalidateList: adapter.invalidateList,
            navigate,
          }}
        />
      </div>
      {state.dialog.conflict !== null && isEditing ? (
        <DraftConflictDialog
          open={true}
          localBody={state.dialog.conflict.localBody}
          serverBody={state.dialog.serverBody}
          localSavedAt={state.dialog.conflict.localSavedAt}
          serverUpdatedAt={state.dialog.baselineUpdatedAtMs}
          onChooseLocal={() => {
            void state.dialog.adoptLocalDraft()
          }}
          onChooseServer={state.dialog.adoptServerVersion}
        />
      ) : null}
    </div>
  )
}
