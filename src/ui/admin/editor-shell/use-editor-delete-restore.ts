import type { NavigateFunction } from 'react-router'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface UseEditorDeleteRestoreArgs {
  /** Edit-mode entity; `undefined` in create mode (buttons stay unmounted). */
  entity: { id: string; title: string } | undefined
  /** Display-noun message id woven into the confirm / toast copy (`admin.editor.entity.*`). */
  entityLabelId: UiMessageId
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
  entityLabelId,
  listPath,
  deleteFn,
  restoreFn,
  invalidateList,
  navigate,
}: UseEditorDeleteRestoreArgs) {
  const { t } = useI18n()
  const entityLabel = t(entityLabelId)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const deleteApi = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success(t('admin.editor.delete.deleted', { entity: entityLabel }))
      invalidateList()
      void navigate(listPath)
    },
    onError: (error) => {
      setConfirm({
        title: t('admin.editor.delete.failed'),
        description: error.message,
        actionLabel: t('admin.categories.acknowledge'),
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const restoreApi = useMutation({
    mutationFn: restoreFn,
    onSuccess: () => {
      toast.success(t('admin.editor.delete.restored', { entity: entityLabel }))
      invalidateList()
      void navigate(0) // full reload to refetch
    },
    onError: (error) => {
      setConfirm({
        title: t('admin.editor.delete.restoreFailed'),
        description: error.message,
        actionLabel: t('admin.categories.acknowledge'),
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const handleDelete = entity
    ? () =>
        setConfirm({
          title: t('admin.editor.delete.title', { entity: entityLabel, title: entity.title }),
          description: t('admin.editor.delete.body', { entity: entityLabel }),
          actionLabel: t('common.action.delete'),
          destructive: true,
          onConfirm: () => deleteApi.mutate(entity.id),
        })
    : undefined

  const handleRestore = entity ? () => restoreApi.mutate(entity.id) : undefined

  return { confirm, setConfirm, handleDelete, handleRestore }
}
