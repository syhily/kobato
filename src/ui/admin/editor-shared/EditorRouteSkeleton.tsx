import { Skeleton } from '@/ui/components/skeleton'

export function EditorRouteSkeleton() {
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
