import type { ClearCacheTarget } from '@/shared/types/cache'
import type { ClearStatus } from '@/ui/admin/settings/cache/cache-status'

import { formatTimestamp } from '@/ui/admin/settings/cache/cache-formatters'

interface CacheStatusLineProps {
  status: ClearStatus
  target: ClearCacheTarget
  generatedAt?: string
}

export function CacheStatusLine({ status, target, generatedAt }: CacheStatusLineProps) {
  const isSuccess = status.target === target && status.state === 'success' && !!status.message
  const isError = status.target === target && status.state === 'error' && !!status.message
  const message = isSuccess
    ? status.message
    : isError
      ? status.message
      : generatedAt
        ? `数据采集时间：${formatTimestamp(generatedAt)}`
        : ''
  return (
    <output aria-live="polite" className={isError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
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
    <output aria-live="polite" className={isError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
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
  let message = ''
  let tone: 'muted' | 'error' = 'muted'
  if (isPending) {
    message = '保存中…'
  } else if (validationError !== null) {
    message = '配置存在冲突，请先修正'
    tone = 'error'
  } else if (status === 'error') {
    message = '保存失败'
    tone = 'error'
  } else if (status === 'saved' && !isDirty) {
    message = '已保存'
  } else if (isDirty) {
    message = '尚未保存的更改'
  }
  return (
    <output
      aria-live="polite"
      className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
      {message}
    </output>
  )
}
