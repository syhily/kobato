import { LoaderIcon } from 'lucide-react'

// Bottom status for admin infinite lists: spinner / exhausted line / nothing.
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
