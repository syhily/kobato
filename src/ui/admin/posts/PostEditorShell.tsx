import type { LexicalEditor } from 'lexical'
import type { NavigateFunction } from 'react-router'

import { useCallback, useRef } from 'react'

import type { AdminPostDetailDto, AdminPostDto, UpsertPostMetaInput } from '@/shared/types/posts'
import type { RevisionLike, SaveBodyOutput } from '@/ui/admin/editor-shell/editor-shell-types'
import type { InklingFlushHandle } from '@/ui/inkling/editor/article/article-editor-types'

import { orpc } from '@/client/api/client'
import { inklingDocumentSchema } from '@/shared/inkling/schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { CreateModeBanner } from '@/ui/admin/editor-shared/CreateModeBanner'
import { TitleSlugStrip } from '@/ui/admin/editor-shared/TitleSlugStrip'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { FloatingPublishButton } from '@/ui/admin/editor-shell/FloatingPublishButton'
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

  const editorRef = useRef<LexicalEditor | null>(null)

  // Flush handle populated by the article editor's change plugin. Wrapped in
  // a stable callback and passed into the shell so persist handlers can
  // synchronously flush the latest edits (incl. footnote-definition merge)
  // before the save/publish mutation fires — closing the 120ms debounce
  // window that could otherwise drop the last edits.
  const flushHandleRef = useRef<InklingFlushHandle | null>(null)
  const flushEditor = useCallback(() => flushHandleRef.current?.() ?? null, [])

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
          latestRevision: unsafeCast<RevisionLike>(detail.latestRevision),
          publishedRevision: unsafeCast<RevisionLike>(detail.publishedRevision),
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
    saveDraftFn: (input) => unsafeCast<Promise<SaveBodyOutput>>(orpc.admin.posts.saveDraft(unsafeCast(input))),
    publishFn: (input) => unsafeCast<Promise<SaveBodyOutput>>(orpc.admin.posts.publishLatest(unsafeCast(input))),
    unpublishFn: async (input) => {
      const result = await orpc.admin.posts.unpublish(input)
      return result.post
    },
    buildUpsertMetaPayload: buildPostUpsertPayload,
    directSaveDraft: (input) => unsafeCast<Promise<SaveBodyOutput>>(orpc.admin.posts.saveDraft(unsafeCast(input))),
    editPath: (id) => `/editor/post/${id}`,
    navigate,
    flushEditor,
  })

  const pickerActions = useEditorPickerActions(editorRef)

  return (
    <div className="flex min-h-admin-content-min flex-col gap-0 p-2 md:gap-4 md:p-4">
      <PostEditorToolbar mode={mode} detail={detail} state={state} />

      {isEditing && state.previewBanner !== null ? (
        <ActionBanner
          kind={state.previewBanner.kind}
          slug={state.previewBanner.slug}
          basePath="/posts"
          onClose={state.dismissPreviewBanner}
        />
      ) : null}

      {/* Layout grid. Two states drive the column template:
       *    - meta open  → [editor | meta]   (2 col)
       *    - meta hidden → [editor]           (1 col)
       *    Below lg, meta moves into a `Sheet` overlay. */}
      <div
        className={cn(
          'mt-4 grid min-h-0 grow gap-4 md:mt-0',
          state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)_360px]',
          !state.metaOpen && 'lg:grid-cols-[minmax(0,1fr)]',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {mode === 'create' ? <CreateModeBanner entityLabel="文章" draftSavedAt={state.createDraftSavedAt} /> : null}
          <TitleSlugStrip
            entityLabel="文章"
            title={state.meta.title}
            slug={state.meta.slug}
            onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
            onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
            disabled={state.isPending}
          />
          <InklingArticleEditor
            initialDocument={state.initialBody}
            documentKey={state.bodyKey}
            onDocumentChange={state.setBody}
            disabled={state.isPending}
            actions={pickerActions.actions}
            editorRef={editorRef}
            flushHandleRef={flushHandleRef}
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
        {state.metaOpen ? <PostEditorMetaAside mode={mode} detail={detail} state={state} /> : null}
      </div>
      {!state.isLg ? <PostEditorMetaSheet mode={mode} detail={detail} state={state} /> : null}
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
