import { LoaderIcon } from 'lucide-react'

import { useI18n } from '@/ui/lib/I18nProvider'

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
  const { t } = useI18n()
  return (
    <div className="py-6 text-center text-sm text-muted-foreground">
      {isFetchingNextPage ? (
        <span className="inline-flex items-center gap-2">
          <LoaderIcon className="size-4 animate-spin" />
          {t('common.state.loading')}
        </span>
      ) : !hasNextPage && rowCount > 0 ? (
        t('admin.shared.list.exhausted', { noun })
      ) : null}
    </div>
  )
}
