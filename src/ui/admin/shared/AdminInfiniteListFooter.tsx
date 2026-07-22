import { LoaderIcon } from 'lucide-react'

// Shared bottom status for the admin infinite lists: spinner while the next
// page is in flight, the "everything loaded" line once the list is
// exhausted, nothing while idle mid-list. Rendered below the sentinel.
export function AdminInfiniteListFooter({
  noun,
  rowCount,
  hasNextPage,
  isFetchingNextPage,
}: {
  noun: string
  rowCount: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
}) {
  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      {isFetchingNextPage ? (
        <span className="inline-flex items-center gap-2">
          <LoaderIcon className="size-4 animate-spin" />
          加载中…
        </span>
      ) : !hasNextPage && rowCount > 0 ? (
        `已加载全部${noun}`
      ) : null}
    </div>
  )
}
