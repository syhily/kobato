import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import { EditorRouteLoader } from '@/ui/admin/editor-shared/EditorRouteLoader'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'

export interface PostEditorRouteProps {
  postId: string
  navigate: NavigateFunction
}

export function PostEditorRoute({ postId, navigate }: PostEditorRouteProps) {
  return (
    <EditorRouteLoader
      entityLabel="文章"
      listPath="/admin/posts"
      queryOptions={orpcQuery.admin.posts.get.queryOptions({ input: { id: postId } })}
      shell={PostEditorShell}
      navigate={navigate}
    />
  )
}
