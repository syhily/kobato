import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { orpc } from '@/client/api/client'
import { toastApiError } from '@/client/lib/toast-api-error'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ReindexProgress {
  phase: 'idle' | 'running' | 'success'
  total: number
  processed: number
  failed: number
}

const IDLE: ReindexProgress = { phase: 'idle', total: 0, processed: 0, failed: 0 }

/** Manual search-index rebuild — the recovery hatch after bulk imports
 *  (database pump, WordPress migration); the index maintains itself otherwise. */
export function SearchReindexCard() {
  const { t } = useI18n()
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
      toastApiError(err, 'admin.toast.searchReindexFailed', t)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{t('admin.dashboard.search.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.dashboard.search.description')}</p>
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
          {reindex.phase === 'idle' && t('admin.dashboard.search.build')}
          {reindex.phase === 'running' && t('admin.dashboard.search.running')}
          {reindex.phase === 'success' && t('common.state.done')}
        </Button>
      </div>
      {reindex.phase === 'running' && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('admin.dashboard.search.progress', {
            pending: Math.max(0, reindex.total - reindex.processed - reindex.failed),
            processed: reindex.processed,
            failed: reindex.failed,
            total: reindex.total,
          })}
        </p>
      )}
      {reindex.phase === 'success' && (
        <p className="mt-3 text-sm text-status-success-fg">
          {t('admin.dashboard.search.success', {
            processed: reindex.processed,
            failed: reindex.failed,
            total: reindex.total,
          })}
        </p>
      )}
    </div>
  )
}
