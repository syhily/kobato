import type { NavigateFunction } from 'react-router'

import { ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'
import { Link } from 'react-router'

import { orpcQuery, useQuery } from '@/client/api/query'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'
import { Button } from '@/ui/components/button'
import { Skeleton } from '@/ui/components/skeleton'

export interface PageEditorRouteProps {
  pageId: string
  navigate: NavigateFunction
}

// Top-level wrapper around `PageEditorShell` that owns the
// "fetch the detail DTO from the API on mount" lifecycle. Kept
// separate from the shell so the shell stays plain-props +
// straightforward to unit-test.
export function PageEditorRoute({ pageId, navigate }: PageEditorRouteProps) {
  const getPageQuery = useQuery(orpcQuery.admin.pages.get.queryOptions({ input: { id: pageId } }))

  if (getPageQuery.error) {
    return <PageEditorError message={getPageQuery.error.message} />
  }
  if (getPageQuery.isPending || getPageQuery.data === undefined) {
    return <PageEditorSkeleton />
  }
  return <PageEditorShell mode="edit" detail={getPageQuery.data} navigate={navigate} />
}

function PageEditorError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dialog-max-h-sm flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangleIcon className="size-10 text-destructive" />
      <h1 className="text-lg font-semibold">无法打开页面编辑器</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        render={
          <Link to="/admin/pages">
            <ArrowLeftIcon /> 返回列表
          </Link>
        }
      />
    </div>
  )
}

function PageEditorSkeleton() {
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
