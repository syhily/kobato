import { CheckIcon, Loader2Icon } from 'lucide-react'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export type RestoreStep = 'uploading' | 'decrypting' | 'extracting' | 'switching' | 'restarting'

const STEP_ORDER: RestoreStep[] = ['uploading', 'decrypting', 'extracting', 'switching', 'restarting']

const STEP_LABELS: Record<RestoreStep, UiMessageId> = {
  uploading: 'admin.settings.backup.progress.uploading',
  decrypting: 'admin.settings.backup.progress.decrypting',
  extracting: 'admin.settings.backup.progress.extracting',
  switching: 'admin.settings.backup.progress.switching',
  restarting: 'admin.settings.backup.progress.restarting',
}

interface RestoreProgressPanelProps {
  current: RestoreStep
  /** 0-100 for the current step, or null when indeterminate. */
  percent: number | null
  /** The decrypt row only renders for encrypted uploads. */
  hasDecrypt: boolean
}

/** Step-by-step restore progress for the upload-restore flow: real upload
 *  percent (XHR), decrypt percent (server-reported bytes), indeterminate
 *  extraction, then the swap + restart legs. */
export function RestoreProgressPanel({ current, percent, hasDecrypt }: RestoreProgressPanelProps) {
  const { t } = useI18n()
  const steps = STEP_ORDER.filter((step) => hasDecrypt || step !== 'decrypting')
  const currentIndex = steps.indexOf(current)
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4" role="status" aria-live="polite">
      {steps.map((step, index) => {
        const status = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending'
        return (
          <div key={step} className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border',
                status === 'done' && 'border-status-success-border bg-status-success-bg text-status-success-fg',
                status === 'active' && 'border-brand text-brand',
                status === 'pending' && 'border-line text-muted-foreground',
              )}
            >
              {status === 'done' ? (
                <CheckIcon size={12} />
              ) : status === 'active' ? (
                <Loader2Icon size={12} className="animate-spin" />
              ) : (
                <span className="size-1 rounded-full bg-current" />
              )}
            </span>
            <span className={cn('text-sm', status === 'pending' && 'text-muted-foreground')}>
              {t(STEP_LABELS[step])}
            </span>
            {status === 'active' && percent !== null && (
              <span className="ml-auto flex items-center gap-2">
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-brand transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
              </span>
            )}
            {status === 'active' && percent === null && (
              <span className="ml-auto text-xs text-muted-foreground">
                {t('admin.settings.backup.progress.processing')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
