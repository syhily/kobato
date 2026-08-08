import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'

export interface UseEditorDeleteRestoreArgs {
  /** Edit-mode entity; `undefined` in create mode (buttons stay unmounted). */
  entity: { id: string; title: string } | undefined
  /** Display noun woven into the confirm / toast copy (`文章` / `页面`). */
  entityLabel: string
  /** Admin list route to return to after a successful delete. */
  listPath: string
  deleteFn: (id: string) => Promise<unknown>
  restoreFn: (id: string) => Promise<unknown>
  /** Invalidate the entity's admin list cache namespace. */
  invalidateList: () => void
  navigate: NavigateFunction
}

/** Shared soft-delete / restore flow; callers render the returned `confirm` state. */
export function useEditorDeleteRestore({
  entity,
  entityLabel,
  listPath,
  deleteFn,
  restoreFn,
  invalidateList,
  navigate,
}: UseEditorDeleteRestoreArgs) {
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const deleteApi = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success(`${entityLabel}已删除`)
      invalidateList()
      void navigate(listPath)
    },
    onError: (error) => {
      setConfirm({
        title: '删除失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const restoreApi = useMutation({
    mutationFn: restoreFn,
    onSuccess: () => {
      toast.success(`${entityLabel}已恢复`)
      invalidateList()
      void navigate(0) // full reload to refetch
    },
    onError: (error) => {
      setConfirm({
        title: '恢复失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const handleDelete = entity
    ? () =>
        setConfirm({
          title: `删除${entityLabel}「${entity.title}」？`,
          description: `${entityLabel}会被软删除（30 天内可恢复）。已发布的链接将立即返回 404。`,
          actionLabel: '删除',
          destructive: true,
          onConfirm: () => deleteApi.mutate(entity.id),
        })
    : undefined

  const handleRestore = entity ? () => restoreApi.mutate(entity.id) : undefined

  return { confirm, setConfirm, handleDelete, handleRestore }
}
