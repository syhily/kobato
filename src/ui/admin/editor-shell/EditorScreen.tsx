import type { NavigateFunction } from 'react-router'

import { useMemo } from 'react'

import type { CreateDraftConfig } from '@/client/hooks/use-create-draft'
import type { LocalDraftConfig } from '@/client/hooks/use-local-draft'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { SaveBodyInput, SaveBodyOutput } from '@/shared/types/revision'
import type { EntityLike, RevisionLike, UseEditorShellStateOutput } from '@/ui/admin/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@/ui/admin/editor-shell/EditorMetaPanel'

import { CreateModeBanner } from '@/ui/admin/editor-shared/CreateModeBanner'
import { TitleSlugStrip } from '@/ui/admin/editor-shared/TitleSlugStrip'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { EditorMetaPanel } from '@/ui/admin/editor-shell/EditorMetaPanel'
import { EditorToolbar } from '@/ui/admin/editor-shell/EditorToolbar'
import { FloatingPublishButton } from '@/ui/admin/editor-shell/FloatingPublishButton'
import { PreviewPane } from '@/ui/admin/editor-shell/PreviewPanel'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'
import { PageBodyEditor } from '@/ui/admin/editor/PageBodyEditor'
import { cn } from '@/ui/lib/cn'

/** Entity shape the screen itself reads (toolbar links, panel extras). */
export interface EditorScreenEntity extends EntityLike {
  title: string
  deletedAt: string | null
}

/**
 * Entity parameterization of the editor screen. Everything the shared
 * screen cannot know — DTO accessors, draft factories, wire calls, route
 * stubs, display noun, and the meta-sidebar component — arrives through
 * this one adapter object.
 */
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
  localDraftConfig: LocalDraftConfig<PortableTextBody>
  createDraftConfig: CreateDraftConfig<PortableTextBody>

  upsertMetaFn: (input: TUpsertMetaInput) => Promise<TEntity>
  saveDraftFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  publishFn: (input: SaveBodyInput) => Promise<SaveBodyOutput>
  unpublishFn: (input: { id: string }) => Promise<TEntity>
  buildUpsertMetaPayload: (input: { meta: TMeta; id?: string; publishedAt: string | null }) => TUpsertMetaInput
  directSaveDraft: (input: {
    id: string
    body: PortableTextBody
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

/**
 * The single editor screen both entities render. Owns the toolbar row, the
 * three-state layout grid, the preview pane, the title/slug strip, the
 * floating publish button, the action banner, the draft-conflict dialog,
 * and the single-mounted meta panel (aside ↔ Sheet). Entity differences
 * arrive through the adapter; shared state lives in `useEditorShellState`.
 */
export function EditorScreen<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput = Record<string, unknown>,
>({ mode, detail, navigate, adapter }: EditorScreenProps<TMeta, TEntity, TDetail, TUpsertMetaInput>) {
  const isEditing = mode === 'edit' && detail !== undefined
  const { getEntity, getLatestRevision, getPublishedRevision } = adapter
  const entity = isEditing ? getEntity(detail) : undefined

  // Loader-stable detail object for the state hook: the query DTO prop is
  // referentially stable, so memoizing on it keeps the hook's memos from
  // recomputing every render (an unstable detail used to feed the conflict
  // check into a "Too many re-renders" loop on revision-less entities).
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
    <div
      className={cn(
        'flex flex-col gap-0 p-2 md:gap-4 md:p-4',
        state.previewOpen ? 'min-h-0 flex-1' : 'min-h-admin-content-min',
      )}
    >
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

      {/* Layout grid. Three states drive the column template:
       *    - preview off + meta open  → [editor | meta]      (2 col)
       *    - preview off + meta hidden → [editor]              (1 col)
       *    - preview on               → [editor | preview]    (2 col)
       *      meta is moved into a `Sheet` overlay. */}
      <div
        className={cn(
          'mt-4 grid min-h-0 gap-4 md:mt-0',
          state.previewOpen ? 'flex-1' : 'grow',
          !state.previewOpen && state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)_360px]',
          !state.previewOpen && !state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)]',
          state.previewOpen && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {mode === 'create' ? (
            <CreateModeBanner entityLabel={adapter.entityLabel} draftSavedAt={state.createDraftSavedAt} />
          ) : null}
          {!state.previewOpen ? (
            <TitleSlugStrip
              entityLabel={adapter.entityLabel}
              title={state.meta.title}
              slug={state.meta.slug}
              onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
              onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
              disabled={state.toolbar.isPending}
            />
          ) : null}
          <PageBodyEditor
            initialBody={state.initialBody}
            bodyKey={state.bodyKey}
            onBodyChange={state.setBody}
            disabled={state.toolbar.isPending}
            livePreviewOpen={state.previewOpen}
            scrollContainerRef={state.editorScrollRef}
            floatingActions={
              isEditing ? (
                <FloatingPublishButton
                  onPublish={state.toolbar.persistPublish}
                  disabled={state.toolbar.isPending || !state.toolbar.canPublish}
                  pending={state.toolbar.isPublishing}
                  title={
                    state.toolbar.canPublish
                      ? state.toolbar.publishStatus === 'scheduled'
                        ? '将最新草稿按计划时间上线 (Cmd/Ctrl+Shift+P)'
                        : '将最新草稿发布到线上 (Cmd/Ctrl+Shift+P)'
                      : '当前没有待发布的草稿'
                  }
                />
              ) : null
            }
          />
        </div>
        {state.previewOpen ? (
          <section aria-label="实时预览" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewPane
              body={state.body}
              title={state.meta.title}
              slug={state.meta.slug}
              scrollContainerRef={state.previewScrollRef}
            />
          </section>
        ) : null}
        <EditorMetaPanel
          entityKind={adapter.entityKind}
          entityLabel={adapter.entityLabel}
          entity={entity}
          previewOpen={state.previewOpen}
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
