import type { ClearCacheTarget } from '@/shared/types/cache'
import type { ClearStatus } from '@/ui/admin/settings/cache/cache-status'

import { formatTimestamp } from '@/ui/admin/settings/cache/cache-formatters'

interface CacheStatusLineProps {
  status: ClearStatus
  target: ClearCacheTarget
  generatedAt?: string
}

// Status messages always live next to the action that triggered them
// — render only when *this* card was the originator of the last
// request. Otherwise show the snapshot timestamp (the "all" card)
// or nothing.
//
// The outer `<p>` is always rendered (even empty) and carries
// `role="status"` + `aria-live="polite"` so screen readers announce
// the "已清空 … N 项" / "数据采集时间：…" transitions. Without a
// persistent live region, swapping `return null` for a freshly
// mounted node would not trigger an announcement.
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

// Pinned next to the action buttons so the editor sees the result
// of the most recent operation (clear / save) without scrolling.
// Returns null when there's nothing to say so the surrounding
// `mr-auto` spacer collapses cleanly and the buttons hug the right
// edge.
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
  errorMessage: string | null
  validationError: string | null
}

// Validation errors show under the input itself (`SettingsRow.error`),
// so the action-bar text only needs a one-liner status. Order
// matters: pending > validation > server error > saved-clean > dirty.
//
// Rendered inside a persistent `role="status"` live region so the
// state transitions (保存中 → 已保存 / 保存失败) are announced to
// screen readers without the region being torn down.
export function BucketSaveStatus({ isDirty, isPending, status, errorMessage, validationError }: BucketSaveStatusProps) {
  let message = ''
  let tone: 'muted' | 'error' = 'muted'
  if (isPending) {
    message = '保存中…'
  } else if (validationError !== null) {
    message = '配置存在冲突，请先修正'
    tone = 'error'
  } else if (status === 'error') {
    message = errorMessage ?? '保存失败'
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
