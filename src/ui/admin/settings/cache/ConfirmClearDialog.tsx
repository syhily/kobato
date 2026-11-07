import { Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { CacheBucketStats } from '@/shared/contracts/cache'
import type { ClearCacheTarget } from '@/shared/types/cache'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog'
import { useI18n } from '@/ui/lib/I18nProvider'

interface ConfirmClearDialogProps {
  open: boolean
  target: ClearCacheTarget | null
  buckets: CacheBucketStats[]
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmClearDialog({ open, target, buckets, onConfirm, onCancel }: ConfirmClearDialogProps) {
  const { t } = useI18n()
  const [lastTarget, setLastTarget] = useState<ClearCacheTarget | null>(target)
  if (target !== null && target !== lastTarget) {
    setLastTarget(target)
  }
  const renderTarget = target ?? lastTarget
  const isAll = renderTarget === 'all'
  const bucket = !isAll && renderTarget ? buckets.find((entry) => entry.id === renderTarget) : null
  const total = isAll ? buckets.reduce((sum, entry) => sum + entry.keyCount, 0) : (bucket?.keyCount ?? 0)
  const title = isAll
    ? t('admin.settings.cache.view.confirmAllTitle')
    : t('admin.settings.cache.view.confirmBucketTitle', { label: bucket?.label ?? '' })
  const description = isAll
    ? t('admin.settings.cache.view.confirmAllDescription', { count: total })
    : t('admin.settings.cache.view.confirmBucketDescription', {
        count: total,
        pattern: bucket?.pattern ?? '',
      })

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            <XIcon data-icon /> {t('common.action.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <Trash2Icon data-icon />{' '}
            {isAll ? t('admin.settings.cache.view.confirmAll') : t('admin.settings.cache.view.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
