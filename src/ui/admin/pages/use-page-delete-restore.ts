import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import type { AdminPageDetailDto } from '@/shared/types/pages'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { type ConfirmState } from '@/ui/admin/shared/ConfirmDialog'

export function usePageDeleteRestore(detail: AdminPageDetailDto | undefined) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const page = detail?.page

  const deleteApi = useMutation({
    mutationFn: (id: string) => orpc.admin.pages.delete({ id }),
    onSuccess: () => {
      toast.success('页面已删除')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.pages.list.key() })
      void navigate('/admin/pages')
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
    mutationFn: (id: string) => orpc.admin.pages.restore({ id }),
    onSuccess: () => {
      toast.success('页面已恢复')
      void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.pages.list.key() })
      void navigate(0)
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

  const handleDelete = page
    ? () =>
        setConfirm({
          title: `删除页面「${page.title}」？`,
          description: '页面会被软删除（30 天内可恢复）。已发布的链接将立即返回 404。',
          actionLabel: '删除',
          destructive: true,
          onConfirm: () => deleteApi.mutate(page.id),
        })
    : undefined

  const handleRestore = page ? () => restoreApi.mutate(page.id) : undefined

  return { confirm, setConfirm, handleDelete, handleRestore }
}
