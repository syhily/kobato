import { useCallback, useState } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

import type { SettingsSection } from '@/shared/config/sections'

import { orpc } from '@/client/api/client'
import { useMutation } from '@/client/api/query'

export interface UseSettingsMutationResult {
  /** Commit a section payload. Sets status to 'saving', calls mutateAsync + revalidation. Returns `true` on success, `false` on error. */
  commit: (section: SettingsSection, payload: Record<string, unknown>) => Promise<boolean>
  /** Reset status to idle. */
  resetStatus: () => void
  /** Imperative revalidation (from useRevalidator). */
  revalidate: () => Promise<void>
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function useSettingsMutation(): UseSettingsMutationResult {
  const revalidator = useRevalidator()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const updateMutation = useMutation({
    mutationFn: ({ section, payload }: { section: SettingsSection; payload: Record<string, unknown> }) =>
      orpc.admin.settings.update({ section, payload }),
  })

  const commit = useCallback(
    async (section: SettingsSection, payload: Record<string, unknown>) => {
      setStatus('saving')
      try {
        await updateMutation.mutateAsync({ section, payload })
        setStatus('saved')
        toast.success('已保存')
        void revalidator.revalidate()
        return true
      } catch (error: unknown) {
        setStatus('error')
        toast.error('保存失败', {
          description: error instanceof Error ? error.message : '请稍后重试',
        })
        return false
      }
    },
    [updateMutation, revalidator],
  )

  const resetStatus = useCallback(() => {
    setStatus('idle')
  }, [])

  return {
    commit,
    resetStatus,
    revalidate: revalidator.revalidate,
    isPending: updateMutation.isPending,
    status,
  }
}
