import { Fragment } from 'react'

import { Skeleton } from '@/ui/components/skeleton'

export function PostsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, i) => (
        <Fragment key={`skeleton-${i}`}>
          <div className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="aspect-[16/10] w-(--spacing-admin-thumb)" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="hidden h-3 w-10 md:block" />
            <Skeleton className="h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) rounded-md" />
          </div>
        </Fragment>
      ))}
    </>
  )
}
