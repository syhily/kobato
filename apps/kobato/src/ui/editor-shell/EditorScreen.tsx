import type { SaveBodyInput, SaveBodyOutput } from '@kobato/api/contracts/admin/revision'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { NavigateFunction } from 'react-router'

import { cn } from '@kobato/ui/lib/cn'
import { type ReactNode, useMemo } from 'react'

import type { CreateDraftConfig } from '@/ui/editor-shell/drafts/use-create-draft'
import type { LocalDraftConfig } from '@/ui/editor-shell/drafts/use-local-draft'
import type { EntityLike, RevisionLike, UseEditorShellStateOutput } from '@/ui/editor-shell/editor-shell-types'
import type { MetaSidebarSlotProps } from '@/ui/editor-shell/EditorMetaPanel'

import { CreateModeBanner } from '@/ui/editor-meta/CreateModeBanner'
import { TitleSlugStrip } from '@/ui/editor-meta/TitleSlugStrip'
import { ActionBanner } from '@/ui/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/editor-shell/DraftConflictDialog'
import { EditorMetaPanel } from '@/ui/editor-shell/EditorMetaPanel'
import { EditorToolbar } from '@/ui/editor-shell/EditorToolbar'
import { useEditorShellState } from '@/ui/editor-shell/use-editor-shell-state'
import { PageBodyEditor } from '@/ui/editor/PageBodyEditor'
export interface EditorScreenEntity extends EntityLike {
  title: string
  deletedAt: string | null
}

export interface EditorScreenAdapter<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput,
> {
  entityKind: 'post' | 'page'
  entityLabelId: UiMessageId
  listPath: string
  bannerBasePath: string
  publicPath: (slug: string) => string
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
  invalidateList: () => void

  renderMetaSidebar: (props: MetaSidebarSlotProps<TMeta>) => ReactNode
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

export function EditorScreen<
  TMeta extends { title: string; slug: string; published: boolean; publishedAt: string },
  TEntity extends EditorScreenEntity,
  TDetail,
  TUpsertMetaInput = Record<string, unknown>,
>({ mode, detail, navigate, adapter }: EditorScreenProps<TMeta, TEntity, TDetail, TUpsertMetaInput>) {
  const isEditing = mode === 'edit' && detail !== undefined
  const { getEntity, getLatestRevision, getPublishedRevision } = adapter
  const entity = isEditing ? getEntity(detail) : undefined

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
        entityLabelId={adapter.entityLabelId}
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

      <div
        className={cn(
          'mt-4 grid grow gap-4 md:mt-0',
          state.metaOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : 'lg:grid-cols-[minmax(0,1fr)]',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {mode === 'create' ? (
            <CreateModeBanner entityLabelId={adapter.entityLabelId} draftSavedAt={state.createDraftSavedAt} />
          ) : null}
          <PageBodyEditor
            initialBody={state.initialBody}
            bodyKey={state.bodyKey}
            onBodyChange={state.setBody}
            disabled={state.toolbar.isPending}
            header={
              <div className="mx-auto w-full max-w-editor-article px-4 pt-8">
                <TitleSlugStrip
                  entityLabelId={adapter.entityLabelId}
                  title={state.meta.title}
                  slug={state.meta.slug}
                  onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
                  onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
                  disabled={state.toolbar.isPending}
                />
              </div>
            }
          />
        </div>
        <EditorMetaPanel
          entityKind={adapter.entityKind}
          entityLabelId={adapter.entityLabelId}
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
