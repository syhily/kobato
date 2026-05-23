import type { NavigateFunction } from 'react-router'

import type { AdminPostDetailDto, AdminPostDto, UpsertPostMetaInput } from '@/shared/types/posts'

import { orpc } from '@/client/api/client'
import { useCreatePostDraft } from '@/client/hooks/use-create-post-draft'
import { usePostLocalDraft } from '@/client/hooks/use-post-local-draft'
import { ActionBanner } from '@/ui/admin/editor-shell/ActionBanner'
import { DraftConflictDialog } from '@/ui/admin/editor-shell/DraftConflictDialog'
import { FloatingPublishButton } from '@/ui/admin/editor-shell/FloatingPublishButton'
import { PreviewPane } from '@/ui/admin/editor-shell/PreviewPanel'
import { useEditorShellState } from '@/ui/admin/editor-shell/use-editor-shell-state'
import { PageBodyEditor } from '@/ui/admin/editor/PageBodyEditor'
import { CreateModeBanner } from '@/ui/admin/posts/CreateModeBanner'
import { PostEditorMetaAside, PostEditorMetaSheet } from '@/ui/admin/posts/PostEditorMetaPanel'
import { PostEditorToolbar } from '@/ui/admin/posts/PostEditorToolbar'
import {
  EMPTY_POST_META_DRAFT,
  metaDraftFromPost,
  metaDraftsEqual,
  type PostMetaDraft,
} from '@/ui/admin/posts/PostMetaSidebar'
import { TitleSlugStrip } from '@/ui/admin/posts/TitleSlugStrip'
import { cn } from '@/ui/lib/cn'

export interface PostEditorShellProps {
  /**
   * Discriminator: `'create'` opens the editor in "new post" mode
   * (POSTs metadata first, then redirects to the edit URL). `'edit'`
   * loads the existing detail DTO and supports save/publish on the
   * body.
   */
  mode: 'create' | 'edit'
  /** Pre-loaded detail DTO. Only consulted when `mode === 'edit'`. */
  detail?: AdminPostDetailDto
  /** Navigation function injected from the route module. */
  navigate: NavigateFunction
}

// Build the upsertMeta payload from a post meta draft. Post-specific
// fields (`pinnedAt`, `category`, `tags`, `alias`) sit on top of the
// common skeleton. `publishedAt` is omitted when `null` so the server
// preserves the persisted value.
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

// Top-level orchestrator for the post authoring screen. All shared
// state lives in `useEditorShellState`; this Shell wires the
// entity-specific mutations + LS hooks + sidebar component and
// renders the toolbar / layout / dialog markup.
export function PostEditorShell({ mode, detail, navigate }: PostEditorShellProps) {
  // Local narrowing flag so TS knows `detail` is defined in the
  // `isEditing` JSX branches below. `isEditing` is just a
  // `boolean` and can't carry the type guard.
  const isEditing = mode === 'edit' && detail !== undefined

  // --- Shared state hook ---------------------------------------------------
  // The hook owns `useMutation()` internally — Shell only provides
  // entity-specific mutation functions + the LS hook factories.
  const state = useEditorShellState<PostMetaDraft, AdminPostDto, UpsertPostMetaInput>({
    mode,
    entityKind: 'post',
    detail: detail
      ? {
          entity: detail.post,
          latestRevision: detail.latestRevision,
          publishedRevision: detail.publishedRevision,
        }
      : undefined,
    emptyMeta: EMPTY_POST_META_DRAFT,
    metaDraftFromEntity: metaDraftFromPost,
    metaDraftsEqual,
    useLocalDraftHook: ({ entityId, clientRevisionToken, body, disabled }) =>
      usePostLocalDraft({ postId: entityId, clientRevisionToken, body, disabled }),
    useCreateDraftHook: ({ body, meta }) => useCreatePostDraft({ body, meta }),
    upsertMetaFn: async (input) => {
      const result = await orpc.admin.posts.upsertMeta(input)
      return result.post
    },
    saveDraftFn: (input) => orpc.admin.posts.saveDraft(input),
    publishFn: (input) => orpc.admin.posts.publishLatest(input),
    unpublishFn: async (input) => {
      const result = await orpc.admin.posts.unpublish(input)
      return result.post
    },
    buildUpsertMetaPayload: buildPostUpsertPayload,
    directSaveDraft: (input) => orpc.admin.posts.saveDraft(input),
    editPath: (id) => `/editor/post/${id}`,
    navigate,
  })

  return (
    <div
      className={cn(
        'flex flex-col gap-0 p-2 md:gap-4 md:p-4',
        state.previewOpen ? 'min-h-0 flex-1' : 'min-h-[calc(100vh-4rem)]',
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
          {mode === 'create' ? <CreateModeBanner draftSavedAt={state.createDraftSavedAt} /> : null}
          {!state.previewOpen ? (
            <TitleSlugStrip
              title={state.meta.title}
              slug={state.meta.slug}
              onTitleChange={(value) => state.setMeta((m) => ({ ...m, title: value }))}
              onSlugChange={(value) => state.setMeta((m) => ({ ...m, slug: value }))}
              disabled={state.isPending}
            />
          ) : null}
          <PageBodyEditor
            initialBody={state.initialBody}
            bodyKey={state.bodyKey}
            onBodyChange={state.setBody}
            disabled={state.isPending}
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
    </div>
  )
}
