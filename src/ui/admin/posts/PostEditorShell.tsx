import type { NavigateFunction } from 'react-router'

import { useQueryClient } from '@tanstack/react-query'

import type { AdminPostDetailDto, AdminPostDto } from '@/shared/contracts/posts'
import type { PostMetaDraft, UpsertPostMetaInput, UpsertPostMetaOutput } from '@/shared/types/posts'
import type { EditorAdapterConfig } from '@/ui/admin/editor-shell/make-editor-adapter'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useContentSettings } from '@/shared/lib/blog-config-context'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { EMPTY_POST_META_DRAFT, postMetaDraftsEqual } from '@/shared/types/posts'
import { EditorScreen } from '@/ui/admin/editor-shell/EditorScreen'
import { makeEditorAdapter } from '@/ui/admin/editor-shell/make-editor-adapter'
import { buildPostUpsertPayload } from '@/ui/admin/posts/build-post-upsert-payload'
import { metaDraftFromPost, PostMetaSidebar } from '@/ui/admin/posts/PostMetaSidebar'

export interface PostEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  navigate: NavigateFunction
}

// Module-level accessor — stable identity so the memoized detail only recomputes when the loader DTO changes.
const getEntity = (d: AdminPostDetailDto) => d.post

// Static post binding for the shared editor adapter (nouns, paths, draft
// configs, meta helpers, oRPC namespace); per-render inputs arrive as runtime.
const POST_EDITOR_ADAPTER_CONFIG: EditorAdapterConfig<
  PostMetaDraft,
  AdminPostDto,
  AdminPostDetailDto,
  UpsertPostMetaInput,
  UpsertPostMetaOutput
> = {
  entityKind: 'post',
  entityLabel: '文章',
  listPath: '/admin/posts',
  bannerBasePath: '/posts',
  publicPath: (slug) => `/posts/${slug}`,
  analyticsPath: (id) => `/editor/post/${id}/analytics`,
  editPath: (id) => `/editor/post/${id}`,

  getEntity,

  emptyMeta: EMPTY_POST_META_DRAFT,
  metaDraftFromEntity: metaDraftFromPost,
  metaDraftsEqual: postMetaDraftsEqual,
  localDraftConfig: {
    keyPrefix: 'cms-post-draft:',
    broadcastName: 'cms-post-draft',
    editType: 'post-edit',
    bodySchema: portableTextBodySchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-post-draft:new:',
    sessionKey: 'cms-post-draft:new:session',
    broadcastName: 'cms-post-draft',
    createType: 'post-create',
    editType: 'post-edit',
    editKeyPrefix: 'cms-post-draft:',
    bodySchema: portableTextBodySchema,
  },
  buildUpsertMetaPayload: buildPostUpsertPayload,

  api: orpc.admin.posts,
  unwrapEntity: (output) => output.post,
  listQueryKey: () => orpcQuery.admin.posts.list.key(),
}

// Thin post binding over `EditorScreen` — adapter shape and wire wrappers are owned by `make-editor-adapter`.
export function PostEditorShell({ mode, detail, navigate }: PostEditorShellProps) {
  const queryClient = useQueryClient()
  const featureEnabled = useContentSettings().post.featureEnabled

  const adapter = makeEditorAdapter(POST_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    renderMetaSidebar: (props) => <PostMetaSidebar {...props} featureGate={featureEnabled ? 'enabled' : 'disabled'} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
