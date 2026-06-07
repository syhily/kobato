import type { NavigateFunction } from 'react-router'

import { ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'
import { Link } from 'react-router'

import { orpcQuery, useQuery } from '@/client/api/query'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'
import { Button } from '@/ui/components/button'
import { Skeleton } from '@/ui/components/skeleton'

export interface PostEditorRouteProps {
  postId: string
  navigate: NavigateFunction
}

export function PostEditorRoute({ postId, navigate }: PostEditorRouteProps) {
  const postQuery = useQuery(orpcQuery.admin.posts.get.queryOptions({ input: { id: postId } }))

  if (postQuery.error) {
    return <PostEditorError message={postQuery.error.message} />
  }
  if (postQuery.isPending || postQuery.data === undefined) {
    return <PostEditorSkeleton />
  }
  return <PostEditorShell mode="edit" detail={postQuery.data} navigate={navigate} />
}

function PostEditorError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dialog-max-h-sm flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangleIcon className="size-10 text-destructive" />
      <h1 className="text-lg font-semibold">无法打开文章编辑器</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        render={
          <Link to="/admin/posts">
            <ArrowLeftIcon /> 返回列表
          </Link>
        }
      />
    </div>
  )
}

function PostEditorSkeleton() {
  return (
    <div className="flex min-h-admin-content-min flex-col gap-0 p-2 md:gap-4 md:p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid grow gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="min-h-(--spacing-editor-min)" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  )
}
