import { useMutation, useQuery } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { CacheSettings } from '@/shared/config/types'
import type { ReservedCacheBucketStats } from '@/shared/contracts/cache'
import type { CacheBucketId, CacheBucketSlot, ClearCacheTarget } from '@/shared/types/cache'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { BucketCard } from '@/ui/admin/settings/cache/BucketCard'
import { type ClearStatus, idleClearStatus } from '@/ui/admin/settings/cache/cache-status'
import { CacheStatusLine } from '@/ui/admin/settings/cache/CacheStatusLine'
import { ConfirmClearDialog } from '@/ui/admin/settings/cache/ConfirmClearDialog'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

type CacheSlice = CacheSettings['cache']

interface CacheViewProps {
  cache: CacheSlice
}

export function CacheView({ cache }: CacheViewProps) {
  const { t } = useI18n()
  const [status, setStatus] = useState<ClearStatus>(idleClearStatus)
  const [confirmTarget, setConfirmTarget] = useState<ClearCacheTarget | null>(null)

  // Only tunable buckets carry an editable settings slot; `Partial` keeps `bucket.id` indexable.
  const tunableSlots: Partial<Record<CacheBucketId, CacheBucketSlot>> = cache

  const {
    data: stats,
    isPending: statsLoading,
    error: statsError,
  } = useQuery(orpcQuery.admin.cache.getStats.queryOptions({ input: {} }))

  const clearMutation = useMutation({
    mutationFn: ({ target }: { target: ClearCacheTarget }) => orpc.admin.cache.clear({ target }),
    onError: (error) => {
      setStatus((prev) => ({
        state: 'error',
        target: prev.target,
        message: error.message || t('admin.settings.cache.view.operationFailed'),
      }))
    },
    onSuccess: (result) => {
      const summary =
        result.cleared.length === 1
          ? t('admin.settings.cache.view.clearedOne', {
              label: result.cleared[0]?.label ?? '',
              count: result.cleared[0]?.removed ?? 0,
            })
          : t('admin.settings.cache.view.clearedAll', { count: result.total })
      setStatus((prev) => ({ state: 'success', target: prev.target, message: summary }))
    },
  })

  const submitClear = useCallback(
    (target: ClearCacheTarget) => {
      setStatus({ state: 'pending', target, message: null })
      clearMutation.mutate({ target })
    },
    [clearMutation],
  )

  const totalKeys = stats?.buckets.reduce((sum, bucket) => sum + bucket.keyCount, 0) ?? 0
  const isClearPending = clearMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <SettingGroup
          title={t('admin.settings.cache.view.clearAllTitle')}
          description={
            statsLoading
              ? t('admin.settings.cache.view.loadingStats')
              : statsError
                ? t('admin.settings.cache.view.statsFailed')
                : t('admin.settings.cache.view.clearAllDescription', { count: totalKeys })
          }
        >
          <p className="text-sm text-muted-foreground">{t('admin.settings.cache.view.clearAllNote')}</p>
          <div className="sm:pr-44">
            {stats ? <CacheStatusLine status={status} target="all" generatedAt={stats.generatedAt} /> : null}
          </div>
          <div className="flex justify-center sm:hidden">
            <Button
              type="button"
              variant="destructive"
              disabled={isClearPending || totalKeys === 0}
              onClick={() => setConfirmTarget('all')}
            >
              <Trash2Icon data-icon />{' '}
              {isClearPending && status.target === 'all'
                ? t('admin.settings.cache.view.clearing')
                : t('admin.settings.cache.view.clearAll')}
            </Button>
          </div>
        </SettingGroup>
        <Button
          type="button"
          variant="destructive"
          disabled={isClearPending || totalKeys === 0}
          onClick={() => setConfirmTarget('all')}
          className="absolute right-6 bottom-6 hidden sm:inline-flex"
        >
          <Trash2Icon data-icon />{' '}
          {isClearPending && status.target === 'all'
            ? t('admin.settings.cache.view.clearing')
            : t('admin.settings.cache.view.clearAll')}
        </Button>
      </div>

      {stats?.buckets.map((bucket) => (
        <BucketCard
          key={bucket.id}
          bucket={bucket}
          settings={tunableSlots[bucket.id]}
          allBuckets={cache}
          isClearPending={isClearPending}
          clearStatus={status}
          onClear={() => setConfirmTarget(bucket.id)}
        />
      ))}

      <ReservedBucketsSection reserved={stats?.reserved ?? []} />

      <ConfirmClearDialog
        open={confirmTarget !== null}
        target={confirmTarget}
        buckets={stats?.buckets ?? []}
        onConfirm={() => {
          if (confirmTarget !== null) {
            submitClear(confirmTarget)
          }
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  )
}

function ReservedBucketsSection({ reserved }: { reserved: ReservedCacheBucketStats[] }) {
  const { t } = useI18n()
  return (
    <SettingGroup
      title={t('admin.settings.cache.view.reservedTitle')}
      description={t('admin.settings.cache.view.reservedDescription')}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {reserved.map((bucket) => (
          <div key={bucket.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{bucket.label}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{bucket.description}</p>
            <p className="mt-3 text-xs">
              <span className="text-muted-foreground">{t('admin.settings.cache.view.keyCount')}</span>
              <span className="font-medium">{bucket.keyCount}</span>
            </p>
          </div>
        ))}
      </div>
    </SettingGroup>
  )
}
