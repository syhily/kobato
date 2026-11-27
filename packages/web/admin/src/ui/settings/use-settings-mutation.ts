import type { SettingsSection } from '@kobato/settings/sections'
import type { SettingsSectionPatch } from '@kobato/settings/types'

import { orpc } from '@kobato/api/browser/client'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { toastApiError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

export type SettingsCommitResult = { ok: true; section: unknown } | { ok: false }

export interface UseSettingsMutationResult {
  commit: <Section extends SettingsSection>(
    section: Section,
    payload: SettingsSectionPatch<Section>,
  ) => Promise<SettingsCommitResult>
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function useSettingsMutation(): UseSettingsMutationResult {
  const { t } = useI18n()
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
        for (const warning of result.warnings) {
          toast.warning(warning)
        }
        return { ok: true, section: result.section }
      } catch (error: unknown) {
        setStatus('error')
        toastApiError(error, 'admin.toast.saveFailed', t)
        return { ok: false }
      }
    },
    [updateMutation, t],
  )

  return {
    commit,
    isPending: updateMutation.isPending,
    status,
  }
}
