import { useCallback, useRef, useState } from 'react'

import type { SettingsChangeVerdict } from '@/ui/admin/settings/shell/settings-change-verdict'

import { SETTINGS_SKIP_COMMIT } from '@/ui/admin/settings/shell/settings-change-verdict'

interface UseLocaleSwitchOptions<Locale extends string> {
  /** Locale the page was loaded with — selecting it again is a no-op. */
  loadedLocale: Locale
  /**
   * Runs the whole switch as one settings-workspace transaction: the panel
   * goes inert while it runs, so no other card can be edited before the
   * reload. Clears on both success and failure. `focusAnchor` re-focuses a
   * specific control when the window closes.
   */
  runTransaction: <T>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null) => Promise<T>
  /**
   * The control to restore focus to after a failed switch. The locale select
   * trigger is the stable anchor: the option the user clicked lives in a
   * portal and unmounts when the popup closes. Omit to keep the provider's
   * active-element fallback.
   */
  focusAnchor?: () => HTMLElement | null
  /** Panel flush: resolves true only when EVERY dirty card committed. */
  flushAll: () => Promise<boolean>
  /** Write the picked locale into the card's form field. */
  change: (locale: Locale) => void
  /** Explicit field commit of the locale field (never a whole-card flush). */
  commit: () => Promise<boolean>
  /**
   * Announce the committed locale to other tabs. Called exactly once, after the
   * server acknowledged the write and immediately before `reload` — peers then
   * flush their own dirty cards and reload; they never re-commit the locale.
   */
  broadcast?: (locale: Locale) => void
  /** Called exactly once after a successful commit that changed the language. */
  reload: () => void
}

interface UseLocaleSwitchResult<Locale extends string> {
  /** The whole transaction (flush → field commit) is in flight. */
  isSwitching: boolean
  /**
   * Guard for `<SettingsSelect onValueChange>`: always returns
   * `SETTINGS_SKIP_COMMIT`, so the wrapper skips its own commit — this
   * transaction owns it. A rejected or vetoed switch persists nothing and
   * reloads nothing; the field commit rolls the control back to the committed
   * locale on its own.
   */
  requestChange: (locale: Locale | null) => Promise<SettingsChangeVerdict>
}

/**
 * The locale switch is the one transactional settings change: every dirty card
 * commits first, then the locale field on its own, and only a successful change
 * reloads — once, inside `runTransaction` so the workspace stays inert. Reloading
 * from a card's `onSaved` would interrupt sibling saves and persist a stale locale.
 */
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
        // Resolve the anchor once, before the portal option can unmount.
        const anchor = focusAnchor === undefined ? undefined : focusAnchor()
        // The transaction covers flush → explicit commit → reload. Its pending
        // flag keeps the whole workspace inert for that window.
        await runTransaction(async () => {
          // 1. Every dirty card must commit. A failure vetoes the switch and
          // leaves the unsaved input + errors on screen.
          if (!(await flushAll())) {
            return
          }
          // 2. Commit the locale field explicitly. No whole-card flush carries
          // it, so a retry can only persist the NEW pick — never the stale one.
          change(locale)
          if (!(await commit())) {
            return
          }
          // 3. Persisted and changed → announce to peer tabs, then one reload,
          // only now. Peers flush their dirty cards first; nobody re-commits it.
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
