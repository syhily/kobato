import type { ClearCacheTarget } from '@kobato/shared/types/cache.ts'
import type { ClearStatus } from '@kobato/web/ui/admin/settings/cache/cache-status.ts'

import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context.tsx'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatTimestamp } from '@kobato/web/ui/admin/settings/cache/cache-formatters.ts'

interface CacheStatusLineProps {
  status: ClearStatus
  target: ClearCacheTarget
  generatedAt?: string
}

export function CacheStatusLine({ status, target, generatedAt }: CacheStatusLineProps) {
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const isSuccess = status.target === target && status.state === 'success' && !!status.message
  const isError = status.target === target && status.state === 'error' && !!status.message
  const message = isSuccess
    ? status.message
    : isError
      ? status.message
      : generatedAt
        ? t('admin.settings.cache.status.generatedAt', {
            time: formatTimestamp(generatedAt, { locale, timeZone }),
          })
        : ''
  return (
    <output aria-live="polite" className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
      {message}
    </output>
  )
}

interface ReadOnlyStatusLineProps {
  clearStatus: ClearStatus
  target: ClearCacheTarget
  savedHint: string | undefined
}

export function ReadOnlyStatusLine({ clearStatus, target, savedHint }: ReadOnlyStatusLineProps) {
  const isSuccess = clearStatus.target === target && clearStatus.state === 'success' && !!clearStatus.message
  const isError = clearStatus.target === target && clearStatus.state === 'error' && !!clearStatus.message
  if (!isSuccess && !isError && !savedHint) {
    return null
  }
  const message = isSuccess ? clearStatus.message : isError ? clearStatus.message : savedHint
  return (
    <output aria-live="polite" className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
      {message}
    </output>
  )
}

interface BucketSaveStatusProps {
  isDirty: boolean
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  validationError: string | null
}

export function BucketSaveStatus({ isDirty, isPending, status, validationError }: BucketSaveStatusProps) {
  const { t } = useI18n()
  let message = ''
  let tone: 'muted' | 'error' = 'muted'
  if (isPending) {
    message = t('admin.settings.cache.status.saving')
  } else if (validationError !== null) {
    message = t('admin.settings.cache.status.conflict')
    tone = 'error'
  } else if (status === 'error') {
    message = t('admin.settings.cache.status.saveFailed')
    tone = 'error'
  } else if (status === 'saved' && !isDirty) {
    message = t('admin.settings.cache.status.saved')
  } else if (isDirty) {
    message = t('admin.settings.cache.status.dirty')
  }
  return (
    <output
      aria-live="polite"
      className={cn('text-sm', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
    >
      {message}
    </output>
  )
}
