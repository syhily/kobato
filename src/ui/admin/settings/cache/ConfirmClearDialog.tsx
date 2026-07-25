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

interface ConfirmClearDialogProps {
  open: boolean
  target: ClearCacheTarget | null
  buckets: CacheBucketStats[]
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmClearDialog({ open, target, buckets, onConfirm, onCancel }: ConfirmClearDialogProps) {
  const [lastTarget, setLastTarget] = useState<ClearCacheTarget | null>(target)
  if (target !== null && target !== lastTarget) {
    setLastTarget(target)
  }
  const renderTarget = target ?? lastTarget
  const isAll = renderTarget === 'all'
  const bucket = !isAll && renderTarget ? buckets.find((entry) => entry.id === renderTarget) : null
  const total = isAll ? buckets.reduce((sum, entry) => sum + entry.keyCount, 0) : (bucket?.keyCount ?? 0)
  const title = isAll ? '清空全部缓存？' : `清空「${bucket?.label ?? ''}」缓存？`
  const description = isAll
    ? `本次操作会删除数据库缓存表中全部 ${total} 条记录。下一次访问 OG 图 / 头像 / 日历会重新生成或拉取，可能短时间内增加服务器负载。该操作不可撤销。`
    : `本次操作会删除缓存表中 ${total} 条键匹配 ${bucket?.pattern ?? ''} 的记录。该操作不可撤销。`

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            <XIcon data-icon /> 取消
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <Trash2Icon data-icon /> {isAll ? '确认清空全部' : '确认清空'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
