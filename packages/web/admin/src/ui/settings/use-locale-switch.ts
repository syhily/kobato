import type { SettingsChangeVerdict } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict.ts'

import { SETTINGS_SKIP_COMMIT } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict.ts'
import { useCallback, useRef, useState } from 'react'

interface UseLocaleSwitchOptions<Locale extends string> {
  loadedLocale: Locale
  runTransaction: <T>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null) => Promise<T>
  focusAnchor?: () => HTMLElement | null
  flushAll: () => Promise<boolean>
  change: (locale: Locale) => void
  commit: () => Promise<boolean>
  broadcast?: (locale: Locale) => void
  reload: () => void
}

interface UseLocaleSwitchResult<Locale extends string> {
  isSwitching: boolean
  requestChange: (locale: Locale | null) => Promise<SettingsChangeVerdict>
}

export function useLocaleSwitch<Locale extends string>({
  loadedLocale,
  runTransaction,
  focusAnchor,
  flushAll,
  change,
  commit,
  broadcast,
  reload,
}: UseLocaleSwitchOptions<Locale>): UseLocaleSwitchResult<Locale> {
  const [isSwitching, setIsSwitching] = useState(false)
  const inFlightRef = useRef(false)

  const requestChange = useCallback(
    async (locale: Locale | null): Promise<SettingsChangeVerdict> => {
      if (locale === null || locale === loadedLocale || inFlightRef.current) {
        return SETTINGS_SKIP_COMMIT
      }
      inFlightRef.current = true
      setIsSwitching(true)
      try {
        const anchor = focusAnchor === undefined ? undefined : focusAnchor()
        await runTransaction(async () => {
          if (!(await flushAll())) {
            return
          }
          change(locale)
          if (!(await commit())) {
            return
          }
          broadcast?.(locale)
          reload()
        }, anchor)
        return SETTINGS_SKIP_COMMIT
      } finally {
        inFlightRef.current = false
        setIsSwitching(false)
      }
    },
    [loadedLocale, runTransaction, focusAnchor, flushAll, change, commit, broadcast, reload],
  )

  return { isSwitching, requestChange }
}
