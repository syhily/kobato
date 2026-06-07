import { useMutation, useQuery } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { CacheSettings } from '@/shared/config/types'
import type { CacheBucketId, ClearCacheTarget, ReservedCacheBucketStats } from '@/shared/types/cache'

import { orpc } from '@/client/api/client'
import { BucketCard } from '@/ui/admin/settings/cache/BucketCard'
import { type ClearStatus, idleClearStatus } from '@/ui/admin/settings/cache/cache-status'
import { CacheStatusLine } from '@/ui/admin/settings/cache/CacheStatusLine'
import { ConfirmClearDialog } from '@/ui/admin/settings/cache/ConfirmClearDialog'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { Button } from '@/ui/components/button'

type CacheSlice = CacheSettings['cache']

interface CacheViewProps {
  cache: CacheSlice
}

export function CacheView({ cache }: CacheViewProps) {
  const [status, setStatus] = useState<ClearStatus>(idleClearStatus)
  const [confirmTarget, setConfirmTarget] = useState<ClearCacheTarget | null>(null)

  const {
    data: stats,
    isPending: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['admin', 'cache', 'stats'],
    queryFn: () => orpc.admin.cache.getStats({}),
  })

  const clearMutation = useMutation({
    mutationFn: ({ target }: { target: ClearCacheTarget }) => orpc.admin.cache.clear({ target }),
    onError: (error) => {
      setStatus((prev) => ({
        state: 'error',
        target: prev.target,
        message: error.message || '操作失败',
      }))
    },
    onSuccess: (result) => {
      const summary =
        result.cleared.length === 1
          ? `已清空「${result.cleared[0]?.label ?? ''}」缓存（${result.cleared[0]?.removed ?? 0} 项）`
          : `已清空全部缓存（${result.total} 项）`
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
          title="一键清空"
          description={
            statsLoading
              ? '正在读取缓存统计…'
              : statsError
                ? '读取缓存统计失败'
                : `SCAN 所有已注册的缓存键并通过 UNLINK 异步删除。当前共 ${totalKeys} 个键。`
          }
        >
          <p className="text-sm text-muted-foreground">
            清空后下一次访问会触发对应资源（OG 图、头像、日历）的重新生成 / 拉取。Session 与限流计数不会受影响。
          </p>
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
              <Trash2Icon data-icon /> {isClearPending && status.target === 'all' ? '清空中…' : '清空全部缓存'}
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
          <Trash2Icon data-icon /> {isClearPending && status.target === 'all' ? '清空中…' : '清空全部缓存'}
        </Button>
      </div>

      {stats?.buckets.map((bucket) => (
        <BucketCard
          key={bucket.id}
          bucket={bucket}
          settings={cache[bucket.id]}
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

export type { CacheBucketId }

function ReservedBucketsSection({ reserved }: { reserved: ReservedCacheBucketStats[] }) {
  return (
    <SettingGroup
      title="受保护的缓存（只读）"
      description="以下缓存关键到运行时安全，仅作可视化展示，不支持改名或清空。如确需操作，请通过 `npm` 或 Redis CLI 进行。"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {reserved.map((bucket) => (
          <div key={bucket.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{bucket.label}</h3>
              <span className="font-mono text-xs text-muted-foreground">{bucket.prefix}*</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{bucket.description}</p>
            <p className="mt-3 text-xs">
              <span className="text-muted-foreground">当前键数：</span>
              <span className="font-medium">{bucket.keyCount}</span>
            </p>
          </div>
        ))}
      </div>
    </SettingGroup>
  )
}
