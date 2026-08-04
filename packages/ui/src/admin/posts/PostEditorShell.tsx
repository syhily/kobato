import type { AdminPostDetailDto, AdminPostDto } from '@kobato/shared/contracts/posts'
import type { PostMetaDraft, UpsertPostMetaInput, UpsertPostMetaOutput } from '@kobato/shared/types/posts'
import type { EditorAdapterConfig } from '@kobato/ui/admin/editor-shell/make-editor-adapter'
import type { NavigateFunction } from 'react-router'

import { orpc } from '@kobato/client/api/client'
import { orpcQuery } from '@kobato/client/api/orpc-query'
import { lexicalBodySchema } from '@kobato/shared/lexical/schema'
import { useContentSettings } from '@kobato/shared/lib/blog-config-context'
import { EMPTY_POST_META_DRAFT, postMetaDraftsEqual } from '@kobato/shared/types/posts'
import { EditorScreen } from '@kobato/ui/admin/editor-shell/EditorScreen'
import { makeEditorAdapter } from '@kobato/ui/admin/editor-shell/make-editor-adapter'
import { buildPostUpsertPayload } from '@kobato/ui/admin/posts/build-post-upsert-payload'
import { metaDraftFromPost, PostMetaSidebar } from '@kobato/ui/admin/posts/PostMetaSidebar'
import { useQueryClient } from '@tanstack/react-query'

export interface PostEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  navigate: NavigateFunction
  /** Headless public-link face (frontend origin + preview token) — see `EditorAdapterRuntime`. */
  preview?: { frontendUrl: string; token: string | null } | null
}

// Module-level DTO accessor — stable identity so the screen's memoized detail
// object only recomputes when the loader DTO itself changes.
const getEntity = (d: AdminPostDetailDto) => d.post

// Static post binding for the shared editor adapter (nouns, paths, draft
// configs, meta helpers, oRPC namespace); per-render inputs (query client,
// feature-gated sidebar) arrive as the runtime argument.
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
    bodySchema: lexicalBodySchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-post-draft:new:',
    sessionKey: 'cms-post-draft:new:session',
    broadcastName: 'cms-post-draft',
    createType: 'post-create',
    editType: 'post-edit',
    editKeyPrefix: 'cms-post-draft:',
    bodySchema: lexicalBodySchema,
  },
  buildUpsertMetaPayload: buildPostUpsertPayload,

  api: orpc.admin.posts,
  unwrapEntity: (output) => output.post,
  listQueryKey: () => orpcQuery.admin.posts.list.key(),
}

// Thin post binding over the shared `EditorScreen`: the adapter shape and
// wire wrappers are owned by `make-editor-adapter`; this only supplies the
// per-render query client and the feature-gated post sidebar.
export function PostEditorShell({ mode, detail, navigate, preview }: PostEditorShellProps) {
  const queryClient = useQueryClient()
  const featureEnabled = useContentSettings().post.featureEnabled

  const adapter = makeEditorAdapter(POST_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    preview,
    renderMetaSidebar: (props) => <PostMetaSidebar {...props} featureGate={featureEnabled ? 'enabled' : 'disabled'} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
