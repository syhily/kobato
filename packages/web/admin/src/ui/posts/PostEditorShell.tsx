import type {
  AdminPostDetailDto,
  AdminPostDto,
  AdminPostUpsertMetaOutput as UpsertPostMetaOutput,
  UpsertPostMetaInput,
} from '@kobato/contracts/posts.ts'
import type { NavigateFunction } from 'react-router'

import { lexicalEditorStateSchema } from '@kobato/lexical/schema.ts'
import { EditorScreen } from '@kobato/web-admin/ui/editor-shell/EditorScreen.tsx'
import { type EditorAdapterConfig, makeEditorAdapter } from '@kobato/web-admin/ui/editor-shell/make-editor-adapter.ts'
import { buildPostUpsertPayload } from '@kobato/web-admin/ui/posts/build-post-upsert-payload.ts'
import { EMPTY_POST_META_DRAFT, postMetaDraftsEqual, type PostMetaDraft } from '@kobato/web-admin/ui/posts/post-meta.ts'
import { metaDraftFromPost, PostMetaSidebar } from '@kobato/web-admin/ui/posts/PostMetaSidebar.tsx'
import { orpc } from '@kobato/web-client/api/client.ts'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { useContentSettings } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { useQueryClient } from '@tanstack/react-query'

export interface PostEditorShellProps {
  mode: 'create' | 'edit'
  detail?: AdminPostDetailDto
  navigate: NavigateFunction
}

// Module-level accessor — stable identity so the memoized detail only recomputes when the loader DTO changes.
const getEntity = (d: AdminPostDetailDto) => d.post

const POST_EDITOR_ADAPTER_CONFIG: EditorAdapterConfig<
  PostMetaDraft,
  AdminPostDto,
  AdminPostDetailDto,
  UpsertPostMetaInput,
  UpsertPostMetaOutput
> = {
  entityKind: 'post',
  entityLabelId: 'admin.editor.entity.post',
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
    bodySchema: lexicalEditorStateSchema,
  },
  createDraftConfig: {
    keyPrefix: 'cms-post-draft:new:',
    sessionKey: 'cms-post-draft:new:session',
    broadcastName: 'cms-post-draft',
    createType: 'post-create',
    editType: 'post-edit',
    editKeyPrefix: 'cms-post-draft:',
    bodySchema: lexicalEditorStateSchema,
  },
  buildUpsertMetaPayload: buildPostUpsertPayload,

  api: orpc.admin.posts,
  unwrapEntity: (output) => output.post,
  listQueryKey: () => orpcQuery.admin.posts.list.key(),
}

export function PostEditorShell({ mode, detail, navigate }: PostEditorShellProps) {
  const queryClient = useQueryClient()
  const featureEnabled = useContentSettings().post.featureEnabled

  const adapter = makeEditorAdapter(POST_EDITOR_ADAPTER_CONFIG, {
    queryClient,
    renderMetaSidebar: (props) => <PostMetaSidebar {...props} featureGate={featureEnabled ? 'enabled' : 'disabled'} />,
  })

  return <EditorScreen mode={mode} detail={detail} navigate={navigate} adapter={adapter} />
}
