import { Fragment } from 'react'

import { Skeleton } from '@/ui/components/skeleton'

export function PagesSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 5 }, (_, i) => (
        <Fragment key={`skeleton-${i}`}>
          <div className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="aspect-[16/10] w-[100px] shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="hidden h-4 w-[52px] md:block" />
            <Skeleton className="h-[34px] w-[52px] rounded-md" />
          </div>
        </Fragment>
      ))}
    </div>
  )
}
