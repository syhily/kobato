import type { NavigateFunction } from 'react-router'

import { useQuery } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'
import { EditorRouteError } from '@/ui/admin/editor-shared/EditorRouteError'
import { EditorRouteSkeleton } from '@/ui/admin/editor-shared/EditorRouteSkeleton'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'

export interface PostEditorRouteProps {
  postId: string
  navigate: NavigateFunction
}

export function PostEditorRoute({ postId, navigate }: PostEditorRouteProps) {
  const postQuery = useQuery(orpcQuery.admin.posts.get.queryOptions({ input: { id: postId } }))

  if (postQuery.error) {
    return <EditorRouteError message={postQuery.error.message} entityLabel="文章" listPath="/admin/posts" />
  }
  if (postQuery.isPending || postQuery.data === undefined) {
    return <EditorRouteSkeleton />
  }
  return <PostEditorShell mode="edit" detail={postQuery.data} navigate={navigate} />
}
