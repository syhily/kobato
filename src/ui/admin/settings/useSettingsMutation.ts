import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import type { SettingsSection } from '@/shared/config/sections'
import type { SettingsSectionPatch } from '@/shared/config/types'

import { orpc } from '@/client/api/client'
import { toastApiError } from '@/client/lib/toast-api-error'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export type SettingsCommitResult = { ok: true; section: unknown } | { ok: false }

export interface UseSettingsMutationResult {
  /**
   * Commit a section payload. Sets status to 'saving', posts to
   * `admin.settings.update`. The response is AUTHORITATIVE — the merged,
   * validated section in admin display shape (masks included). The caller
   * adopts it as its new baseline; there is deliberately NO revalidate
   * here: a save must never refetch the document out from under the
   * user's hands (Ghost's useEditSettings discipline).
   */
  commit: <Section extends SettingsSection>(
    section: Section,
    payload: SettingsSectionPatch<Section>,
  ) => Promise<SettingsCommitResult>
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function useSettingsMutation(): UseSettingsMutationResult {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (status === 'saved') {
      const timer = setTimeout(() => setStatus('idle'), 2000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const updateMutation = useMutation({
    mutationFn: ({ section, payload }: { section: SettingsSection; payload: Record<string, unknown> }) =>
      orpc.admin.settings.update({ section, payload }),
  })

  const commit = useCallback(
    async <Section extends SettingsSection>(
      section: Section,
      payload: SettingsSectionPatch<Section>,
    ): Promise<SettingsCommitResult> => {
      setStatus('saving')
      try {
        const result = await updateMutation.mutateAsync({
          section,
          payload: unsafeCast<Record<string, unknown>>(payload),
        })
        setStatus('saved')
        return { ok: true, section: result.section }
      } catch (error: unknown) {
        setStatus('error')
        toastApiError(error, '保存失败')
        return { ok: false }
      }
    },
    [updateMutation],
  )

  return {
    commit,
    isPending: updateMutation.isPending,
    status,
  }
}
