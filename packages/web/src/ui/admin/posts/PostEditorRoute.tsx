import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { EditorRouteLoader } from '@kobato/web/ui/admin/editor-shared/EditorRouteLoader.tsx'
import { PostEditorShell } from '@kobato/web/ui/admin/posts/PostEditorShell.tsx'

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
