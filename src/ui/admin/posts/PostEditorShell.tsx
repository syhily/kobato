import type { NavigateFunction } from 'react-router'

import { useQueryClient } from '@tanstack/react-query'

import type { AdminPostDetailDto, PostMetaDraft, UpsertPostMetaInput } from '@/shared/types/posts'
import type { EditorScreenAdapter } from '@/ui/admin/editor-shell/EditorScreen'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useContentSettings } from '@/shared/lib/blog-config-context'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { EMPTY_POST_META_DRAFT, postMetaDraftsEqual } from '@/shared/types/posts'
import { EditorScreen } from '@/ui/admin/editor-shell/EditorScreen'
import { buildPostUpsertPayload } from '@/ui/admin/posts/build-post-upsert-payload'
import { metaDraftFromPost, PostMetaSidebar } from '@/ui/admin/posts/PostMetaSidebar'

export interface PostEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  navigate: NavigateFunction
}

const POST_LOCAL_DRAFT_CONFIG = {
  keyPrefix: 'cms-post-draft:',
  broadcastName: 'cms-post-draft',
  editType: 'post-edit' as const,
  bodySchema: portableTextBodySchema,
}

const POST_CREATE_DRAFT_CONFIG = {
  keyPrefix: 'cms-post-draft:new:',
  sessionKey: 'cms-post-draft:new:session',
  broadcastName: 'cms-post-draft',
  createType: 'post-create' as const,
  editType: 'post-edit' as const,
  editKeyPrefix: 'cms-post-draft:',
  bodySchema: portableTextBodySchema,
}

// Module-level DTO accessors — stable identities so the screen's memoized
// detail object only recomputes when the loader DTO itself changes.
const getEntity = (d: AdminPostDetailDto) => d.post
const getLatestRevision = (d: AdminPostDetailDto) => d.latestRevision
const getPublishedRevision = (d: AdminPostDetailDto) => d.publishedRevision

// Thin post binding over the shared `EditorScreen`: DTO accessors, draft
// configs, wire calls (with admin-list cache invalidation), and the post
// meta sidebar. All screen structure + shared state live in `editor-shell`.
export function PostEditorShell({ mode, detail, navigate }: PostEditorShellProps) {
  const queryClient = useQueryClient()
  const featureEnabled = useContentSettings().post.featureEnabled

  const invalidateList = () => {
    // The admin list lives in the TanStack cache (useInfiniteQuery in
    // PostsView) — invalidate the namespace so a meta save (including the
    // create flow) is reflected when the user returns to the list.
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.posts.list.key() })
  }

  const adapter: EditorScreenAdapter<
    PostMetaDraft,
    AdminPostDetailDto['post'],
    AdminPostDetailDto,
    UpsertPostMetaInput
  > = {
    entityKind: 'post',
    entityLabel: '文章',
    listPath: '/admin/posts',
    bannerBasePath: '/posts',
    publicPath: (slug) => `/posts/${slug}`,
    analyticsPath: (id) => `/editor/post/${id}/analytics`,
    editPath: (id) => `/editor/post/${id}`,

    getEntity,
    getLatestRevision,
    getPublishedRevision,

    emptyMeta: EMPTY_POST_META_DRAFT,
    metaDraftFromEntity: metaDraftFromPost,
    metaDraftsEqual: postMetaDraftsEqual,
    localDraftConfig: POST_LOCAL_DRAFT_CONFIG,
    createDraftConfig: POST_CREATE_DRAFT_CONFIG,

    upsertMetaFn: async (input) => {
      const result = await orpc.admin.posts.upsertMeta(input)
      invalidateList()
      return result.post
    },
    saveDraftFn: (input) => orpc.admin.posts.saveDraft(input),
    publishFn: async (input) => {
      const result = await orpc.admin.posts.publishLatest(input)
      invalidateList()
      return result
    },
    unpublishFn: async (input) => {
      const result = await orpc.admin.posts.unpublish(input)
      invalidateList()
      return result.post
    },
    buildUpsertMetaPayload: buildPostUpsertPayload,
    directSaveDraft: (input) => orpc.admin.posts.saveDraft(input),

    deleteEntityFn: (id) => orpc.admin.posts.delete({ id }),
    restoreEntityFn: (id) => orpc.admin.posts.restore({ id }),
    invalidateList,

    renderMetaSidebar: (props) => <PostMetaSidebar {...props} featureGate={featureEnabled ? 'enabled' : 'disabled'} />,
  }

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
