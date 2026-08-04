import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { EditorRouteLoader } from '@kobato/ui/admin/editor-shared/EditorRouteLoader'
import { PostEditorShell } from '@kobato/ui/admin/posts/PostEditorShell'

export interface PostEditorRouteProps {
  postId: string
  navigate: NavigateFunction
  /** Headless public-link face (frontend origin + preview token) from the route loader. */
  preview?: { frontendUrl: string; token: string | null } | null
}

export function PostEditorRoute({ postId, navigate, preview }: PostEditorRouteProps) {
  return (
    <EditorRouteLoader
      entityLabel="文章"
      listPath="/admin/posts"
      queryOptions={orpcQuery.admin.posts.get.queryOptions({ input: { id: postId } })}
      shell={PostEditorShell}
      navigate={navigate}
      preview={preview}
    />
  )
}
