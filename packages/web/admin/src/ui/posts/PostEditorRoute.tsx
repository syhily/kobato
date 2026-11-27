import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { EditorRouteLoader } from '@kobato/web-admin/ui/editor-shell/EditorRouteLoader'
import { PostEditorShell } from '@kobato/web-admin/ui/posts/PostEditorShell'

export interface PostEditorRouteProps {
  postId: string
  navigate: NavigateFunction
}

export function PostEditorRoute({ postId, navigate }: PostEditorRouteProps) {
  return (
    <EditorRouteLoader
      entityLabelId="admin.editor.entity.post"
      listPath="/admin/posts"
      queryOptions={orpcQuery.admin.posts.get.queryOptions({ input: { id: postId } })}
      shell={PostEditorShell}
      navigate={navigate}
    />
  )
}
