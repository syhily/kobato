import { orpc } from '@kobato/client/api/client'
import { toastApiError } from '@kobato/client/lib/toast-api-error'
import { Button } from '@kobato/ui/components/button'
import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ReindexProgress {
  phase: 'idle' | 'running' | 'success'
  total: number
  processed: number
  failed: number
}

const IDLE: ReindexProgress = { phase: 'idle', total: 0, processed: 0, failed: 0 }

/**
 * Manual search-index rebuild. The plain-text index maintains itself on
 * every save/publish and on restore — this is the recovery hatch after
 * bulk imports (e.g. a database pump or a WordPress migration).
 */
export function SearchReindexCard() {
  const [reindex, setReindex] = useState<ReindexProgress>(IDLE)

  useEffect(() => {
    if (reindex.phase === 'success') {
      const timer = setTimeout(() => {
        setReindex(IDLE)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [reindex.phase])

  async function handleReindex() {
    setReindex({ phase: 'running', total: 0, processed: 0, failed: 0 })
    let offset = 0
    let total = 0
    let processed = 0
    let failed = 0

    try {
      while (true) {
        const data = (await orpc.admin.renders.reindexSearch({ batchSize: 5, offset })) as {
          processed: number
          failed: number
          total: number
          nextOffset: number | null
        }
        total = data.total
        processed += data.processed
        failed += data.failed
        offset = data.nextOffset ?? total
        setReindex({ phase: 'running', total, processed, failed })
        if (data.nextOffset === null) {
          break
        }
      }
      setReindex({ phase: 'success', total, processed, failed })
    } catch (err) {
      setReindex(IDLE)
      toastApiError(err, '索引重建失败')
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">搜索索引</h2>
          <p className="mt-1 text-sm text-muted-foreground">批量导入或更新文章后，可以手动重建搜索索引。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={reindex.phase === 'running'}
          onClick={() => {
            void handleReindex()
          }}
        >
          {reindex.phase === 'running' && <Loader2Icon className="animate-spin" />}
          {reindex.phase === 'success' && <CheckIcon className="text-status-success-fg" />}
          {reindex.phase === 'idle' && '重建索引'}
          {reindex.phase === 'running' && '索引中...'}
          {reindex.phase === 'success' && '完成'}
        </Button>
      </div>
      {reindex.phase === 'running' && (
        <p className="mt-3 text-sm text-muted-foreground">
          等待 {Math.max(0, reindex.total - reindex.processed - reindex.failed)} / 成功 {reindex.processed} / 失败{' '}
          {reindex.failed}（共 {reindex.total}）
        </p>
      )}
      {reindex.phase === 'success' && (
        <p className="mt-3 text-sm text-status-success-fg">
          索引重建完成：成功 {reindex.processed} / 失败 {reindex.failed}（共 {reindex.total}）
        </p>
      )}
    </div>
  )
}
