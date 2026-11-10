import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { orpc } from '@/client/api/client'
import { toastApiError } from '@/client/lib/toast-api-error'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ReprojectProgress {
  phase: 'idle' | 'running' | 'success'
  total: number
  processed: number
  rewritten: number
  failed: number
}

const IDLE: ReprojectProgress = { phase: 'idle', total: 0, processed: 0, rewritten: 0, failed: 0 }

/** Manual rebuild hatch for stale body_html / body_text / body_html_feed
 *  columns after a renderer-side fix; the save pipeline maintains them otherwise. */
export function BodyProjectionCard() {
  const { t } = useI18n()
  const [reproject, setReproject] = useState<ReprojectProgress>(IDLE)

  useEffect(() => {
    if (reproject.phase === 'success') {
      const timer = setTimeout(() => {
        setReproject(IDLE)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [reproject.phase])

  async function handleReproject() {
    setReproject({ phase: 'running', total: 0, processed: 0, rewritten: 0, failed: 0 })
    let offset = 0
    let total = 0
    let processed = 0
    let rewritten = 0
    let failed = 0

    try {
      while (true) {
        const data = (await orpc.admin.renders.reprojectBodies({ batchSize: 5, offset })) as {
          processed: number
          failed: number
          rewritten: number
          total: number
          nextOffset: number | null
        }
        total = data.total
        processed += data.processed
        rewritten += data.rewritten
        failed += data.failed
        offset = data.nextOffset ?? total
        setReproject({ phase: 'running', total, processed, rewritten, failed })
        if (data.nextOffset === null) {
          break
        }
      }
      setReproject({ phase: 'success', total, processed, rewritten, failed })
    } catch (err) {
      setReproject(IDLE)
      toastApiError(err, 'admin.toast.cacheRebuildFailed', t)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{t('admin.dashboard.bodyProjection.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.dashboard.bodyProjection.description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={reproject.phase === 'running'}
          onClick={() => {
            void handleReproject()
          }}
        >
          {reproject.phase === 'running' && <Loader2Icon className="animate-spin" />}
          {reproject.phase === 'success' && <CheckIcon className="text-status-success-fg" />}
          {reproject.phase === 'idle' && t('admin.dashboard.bodyProjection.build')}
          {reproject.phase === 'running' && t('admin.dashboard.bodyProjection.running')}
          {reproject.phase === 'success' && t('common.state.done')}
        </Button>
      </div>
      {reproject.phase === 'running' && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('admin.dashboard.bodyProjection.progress', {
            pending: Math.max(0, reproject.total - reproject.processed - reproject.failed),
            processed: reproject.processed,
            rewritten: reproject.rewritten,
            failed: reproject.failed,
            total: reproject.total,
          })}
        </p>
      )}
      {reproject.phase === 'success' && (
        <p className="mt-3 text-sm text-status-success-fg">
          {t('admin.dashboard.bodyProjection.success', {
            processed: reproject.processed,
            rewritten: reproject.rewritten,
            failed: reproject.failed,
            total: reproject.total,
          })}
        </p>
      )}
    </div>
  )
}
