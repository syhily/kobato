import { useCallback, useState } from 'react'
import { useRevalidator } from 'react-router'

import type { SettingsSection } from '@/shared/config/settings'

import { orpc } from '@/client/api/client'
import { useMutation } from '@/client/api/query'

export interface UseSettingsMutationResult {
  /** Commit a section payload. Sets status to 'saving', calls mutateAsync + revalidation. Returns `true` on success, `false` on error. */
  commit: (section: SettingsSection, payload: Record<string, unknown>) => Promise<boolean>
  /** Reset status and errorMessage to idle/null. */
  resetStatus: () => void
  /** Imperative revalidation (from useRevalidator). */
  revalidate: () => Promise<void>
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  errorMessage: string | null
}

export function useSettingsMutation(): UseSettingsMutationResult {
  const revalidator = useRevalidator()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: ({ section, payload }: { section: SettingsSection; payload: Record<string, unknown> }) =>
      orpc.admin.settings.update({ section, payload }),
  })

  const commit = useCallback(
    async (section: SettingsSection, payload: Record<string, unknown>) => {
      setStatus('saving')
      setErrorMessage(null)
      try {
        await updateMutation.mutateAsync({ section, payload })
        setStatus('saved')
        void revalidator.revalidate()
        return true
      } catch (error: unknown) {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : '保存失败')
        return false
      }
    },
    [updateMutation, revalidator],
  )

  const resetStatus = useCallback(() => {
    setStatus('idle')
    setErrorMessage(null)
  }, [])

  return {
    commit,
    resetStatus,
    revalidate: revalidator.revalidate,
    isPending: updateMutation.isPending,
    status,
    errorMessage,
  }
}
