import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '../../../client/api/orpc-query'
import { EditorRouteLoader } from '../editor-shared/EditorRouteLoader'
import { PostEditorShell } from './PostEditorShell'

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
