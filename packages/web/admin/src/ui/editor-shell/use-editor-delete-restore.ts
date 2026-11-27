import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { NavigateFunction } from 'react-router'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { type ConfirmState } from '@kobato/web-admin/ui/shared/ConfirmDialog'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

export interface UseEditorDeleteRestoreArgs {
  entity: { id: string; title: string } | undefined
  entityLabelId: UiMessageId
  listPath: string
  deleteFn: (id: string) => Promise<unknown>
  restoreFn: (id: string) => Promise<unknown>
  invalidateList: () => void
  navigate: NavigateFunction
}

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
      void navigate(0)
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
