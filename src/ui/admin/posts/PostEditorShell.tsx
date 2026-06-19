import type { NavigateFunction } from 'react-router'

import type { AdminPostDetailDto, AdminPostDto, SavePostBodyInput, UpsertPostMetaInput } from '@/shared/types/posts'
import type { RevisionLike, SaveBodyOutput } from '@/ui/admin/editor-shell/editor-shell-types'

import { orpc } from '@/client/api/client'
import { inklingDocumentSchema } from '@/shared/inkling/schema'
import { CreateModeBanner } from '@/ui/admin/editor-shared/CreateModeBanner'
import { TitleSlugStrip } from '@/ui/admin/editor-shared/TitleSlugStrip'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { FloatingPublishButton } from '@/ui/admin/editor-shell/FloatingPublishButton'
import { PreviewPane } from '@/ui/admin/editor-shell/PreviewPanel'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'
import { useEditorPickerActions } from '@/ui/admin/editor/use-inkling-picker-actions'
import { PostEditorMetaAside, PostEditorMetaSheet } from '@/ui/admin/posts/PostEditorMetaPanel'
import { PostEditorToolbar } from '@/ui/admin/posts/PostEditorToolbar'
import {
  EMPTY_POST_META_DRAFT,
  metaDraftFromPost,
  metaDraftsEqual,
  type PostMetaDraft,
} from '@/ui/admin/posts/PostMetaSidebar'
import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'
import { cn } from '@/ui/lib/cn'

export interface PostEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  navigate: NavigateFunction
}

const POST_LOCAL_DRAFT_CONFIG = {
  keyPrefix: 'cms-post-draft-v2:',
  broadcastName: 'cms-post-draft-v2',
  editType: 'post-edit' as const,
  bodySchema: inklingDocumentSchema,
}

const POST_CREATE_DRAFT_CONFIG = {
  keyPrefix: 'cms-post-draft:new:v2:',
  sessionKey: 'cms-post-draft:new:v2:session',
  broadcastName: 'cms-post-draft-v2',
  createType: 'post-create' as const,
  editType: 'post-edit' as const,
  editKeyPrefix: 'cms-post-draft-v2:',
  bodySchema: inklingDocumentSchema,
}

function buildPostUpsertPayload({
  meta,
  id,
  publishedAt,
}: {
  meta: PostMetaDraft
  id?: string
  publishedAt: string | null
}): UpsertPostMetaInput {
  return {
    ...(id !== undefined ? { id } : {}),
    ...(meta.slug.trim() !== '' ? { slug: meta.slug.trim() } : {}),
    title: meta.title.trim(),
    summary: meta.summary.trim(),
    cover: meta.cover.trim(),
    og: meta.og.trim() === '' ? null : meta.og.trim(),
    commentsEnabled: meta.commentsEnabled,
    showToc: meta.showToc,
    showUpdated: meta.showUpdated,
    visible: meta.visible,
    pinnedAt: meta.pinned ? new Date().toISOString() : null,
    category: meta.category,
    tags: meta.tags,
    alias: meta.alias,
    ...(publishedAt !== null ? { publishedAt } : {}),
  }
}

export function PostEditorShell({ mode, detail, navigate }: PostEditorShellProps) {
  const isEditing = mode === 'edit' && detail !== undefined

  // --- Shared state hook ---------------------------------------------------
  // The hook owns `useMutation()` internally — Shell only provides
  // entity-specific mutation functions + the LS hook factories.
  //
  // During Plan 008 the server DTOs still carry PortableText bodies, so the
  // shell casts the detail and save payloads to its Inkling-facing types.
  // These casts are temporary scaffolding until the server cutover lands.
  const state = useEditorShellState<PostMetaDraft, AdminPostDto, UpsertPostMetaInput>({
    mode,
    entityKind: 'post',
    detail: detail
      ? {
          entity: detail.post,
          latestRevision: detail.latestRevision as unknown as RevisionLike,
          publishedRevision: detail.publishedRevision as unknown as RevisionLike,
        }
      : undefined,
    emptyMeta: EMPTY_POST_META_DRAFT,
    metaDraftFromEntity: metaDraftFromPost,
    metaDraftsEqual,
    localDraftConfig: POST_LOCAL_DRAFT_CONFIG,
    createDraftConfig: POST_CREATE_DRAFT_CONFIG,
    upsertMetaFn: async (input) => {
      const result = await orpc.admin.posts.upsertMeta(input)
      return result.post
    },
    saveDraftFn: (input) =>
      orpc.admin.posts.saveDraft(input as unknown as SavePostBodyInput) as unknown as Promise<SaveBodyOutput>,
    publishFn: (input) =>
      orpc.admin.posts.publishLatest(input as unknown as SavePostBodyInput) as unknown as Promise<SaveBodyOutput>,
    unpublishFn: async (input) => {
      const result = await orpc.admin.posts.unpublish(input)
      return result.post
    },
    buildUpsertMetaPayload: buildPostUpsertPayload,
    directSaveDraft: (input) =>
      orpc.admin.posts.saveDraft(input as unknown as SavePostBodyInput) as unknown as Promise<SaveBodyOutput>,
    editPath: (id) => `/editor/post/${id}`,
    navigate,
  })

  const pickerActions = useEditorPickerActions()

  return (
    <div
      className={cn(
        'flex flex-col gap-0 p-2 md:gap-4 md:p-4',
        state.previewOpen ? 'min-h-0 flex-1' : 'min-h-admin-content-min',
      )}
    >
      <PostEditorToolbar mode={mode} detail={detail} state={state} />

      {isEditing && state.previewBanner !== null ? (
        <ActionBanner
          kind={state.previewBanner.kind}
          slug={state.previewBanner.slug}
          basePath="/posts"
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
          {mode === 'create' ? <CreateModeBanner entityLabel="文章" draftSavedAt={state.createDraftSavedAt} /> : null}
          {!state.previewOpen ? (
            <TitleSlugStrip
              entityLabel="文章"
              title={state.meta.title}
              slug={state.meta.slug}
              onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
              onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
              disabled={state.isPending}
            />
          ) : null}
          <InklingArticleEditor
            initialDocument={state.initialBody}
            documentKey={state.bodyKey}
            onDocumentChange={state.setBody}
            disabled={state.isPending}
            actions={pickerActions.actions}
            livePreviewOpen={state.previewOpen}
            scrollContainerRef={state.editorScrollRef}
            floatingActions={
              isEditing ? (
                <FloatingPublishButton
                  onPublish={state.persistPublish}
                  disabled={state.isPending || !state.canPublish}
                  pending={state.isPublishing}
                  title={
                    state.canPublish
                      ? state.sidebarPublishStatus === 'scheduled'
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
        {!state.previewOpen && state.metaOpen ? (
          <PostEditorMetaAside mode={mode} detail={detail} state={state} />
        ) : null}
      </div>
      {state.previewOpen || !state.isLg ? <PostEditorMetaSheet mode={mode} detail={detail} state={state} /> : null}
      {state.conflict !== null && isEditing ? (
        <DraftConflictDialog
          open={true}
          localBody={state.conflict.localBody}
          serverBody={state.initialBody}
          localSavedAt={state.conflict.localSavedAt}
          serverUpdatedAt={
            (detail.latestRevision ?? detail.publishedRevision)?.updatedAt
              ? Date.parse((detail.latestRevision ?? detail.publishedRevision)!.updatedAt)
              : null
          }
          onChooseLocal={() => {
            void state.adoptLocalDraft()
          }}
          onChooseServer={state.adoptServerVersion}
        />
      ) : null}
      {pickerActions.renderPickers()}
    </div>
  )
}
